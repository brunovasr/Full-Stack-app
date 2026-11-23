const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { gerarToken, autenticar, exigirPapel } = require('./auth');

function criarApp(db) {
  const app = express();
  app.use(express.json());

  const texto = (v) => (typeof v === 'string' ? v.trim() : '');
  const publico = (u) => ({ id: u.id, nome: u.nome, email: u.email, papel: u.papel });

  // ---------- Autenticação ----------
  // Transação 1: cadastro de usuário
  app.post('/api/auth/registrar', (req, res) => {
    const nome = texto(req.body.nome);
    const email = texto(req.body.email).toLowerCase();
    const senha = typeof req.body.senha === 'string' ? req.body.senha : '';
    if (!nome || !email.includes('@')) return res.status(400).json({ erro: 'Nome e e-mail válidos são obrigatórios.' });
    if (senha.length < 6) return res.status(400).json({ erro: 'A senha deve ter ao menos 6 caracteres.' });
    if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email))
      return res.status(409).json({ erro: 'E-mail já cadastrado.' });
    // O primeiro usuário do sistema torna-se administrador.
    const primeiro = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n === 0;
    const info = db
      .prepare('INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES (?, ?, ?, ?)')
      .run(nome, email, bcrypt.hashSync(senha, 10), primeiro ? 'admin' : 'usuario');
    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ usuario: publico(usuario), token: gerarToken(usuario) });
  });

  // Transação 2: login
  app.post('/api/auth/login', (req, res) => {
    const email = texto(req.body.email).toLowerCase();
    const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
    if (!usuario || !bcrypt.compareSync(String(req.body.senha || ''), usuario.senha_hash))
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    res.json({ usuario: publico(usuario), token: gerarToken(usuario) });
  });

  app.get('/api/auth/eu', autenticar, (req, res) => {
    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
    if (!usuario) return res.status(401).json({ erro: 'Usuário não existe mais.' });
    res.json(publico(usuario));
  });

  // ---------- Categorias ----------
  app.get('/api/categorias', autenticar, (req, res) => {
    res.json(db.prepare('SELECT id, nome FROM categorias WHERE usuario_id = ? ORDER BY nome').all(req.usuario.id));
  });

  // Transação 3: criar categoria
  app.post('/api/categorias', autenticar, (req, res) => {
    const nome = texto(req.body.nome);
    if (!nome) return res.status(400).json({ erro: 'Informe o nome da categoria.' });
    try {
      const info = db.prepare('INSERT INTO categorias (usuario_id, nome) VALUES (?, ?)').run(req.usuario.id, nome);
      res.status(201).json({ id: Number(info.lastInsertRowid), nome });
    } catch {
      res.status(409).json({ erro: 'Categoria já existe.' });
    }
  });

  // ---------- Tarefas (cada usuário só acessa as suas) ----------
  const converter = (t) => ({ ...t, concluida: Boolean(t.concluida) });
  const buscarTarefa = (id, usuarioId) =>
    db.prepare('SELECT * FROM tarefas WHERE id = ? AND usuario_id = ?').get(Number(id), usuarioId);
  const categoriaValida = (categoriaId, usuarioId) =>
    categoriaId == null ||
    Boolean(db.prepare('SELECT 1 FROM categorias WHERE id = ? AND usuario_id = ?').get(Number(categoriaId), usuarioId));

  app.get('/api/tarefas', autenticar, (req, res) => {
    const linhas = db.prepare('SELECT * FROM tarefas WHERE usuario_id = ? ORDER BY id').all(req.usuario.id);
    res.json(linhas.map(converter));
  });

  // Transação 4: criar tarefa
  app.post('/api/tarefas', autenticar, (req, res) => {
    const titulo = texto(req.body.titulo);
    if (!titulo) return res.status(400).json({ erro: 'Informe um título.' });
    const categoriaId = req.body.categoria_id ?? null;
    if (!categoriaValida(categoriaId, req.usuario.id)) return res.status(400).json({ erro: 'Categoria inválida.' });
    const info = db
      .prepare('INSERT INTO tarefas (usuario_id, categoria_id, titulo, descricao) VALUES (?, ?, ?, ?)')
      .run(req.usuario.id, categoriaId, titulo, texto(req.body.descricao));
    res.status(201).json(converter(buscarTarefa(info.lastInsertRowid, req.usuario.id)));
  });

  // Transação 5: editar tarefa
  app.put('/api/tarefas/:id', autenticar, (req, res) => {
    const tarefa = buscarTarefa(req.params.id, req.usuario.id);
    if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
    const titulo = req.body.titulo === undefined ? tarefa.titulo : texto(req.body.titulo);
    if (!titulo) return res.status(400).json({ erro: 'Informe um título.' });
    const categoriaId = req.body.categoria_id === undefined ? tarefa.categoria_id : req.body.categoria_id;
    if (!categoriaValida(categoriaId, req.usuario.id)) return res.status(400).json({ erro: 'Categoria inválida.' });
    const descricao = req.body.descricao === undefined ? tarefa.descricao : texto(req.body.descricao);
    db.prepare('UPDATE tarefas SET titulo = ?, descricao = ?, categoria_id = ? WHERE id = ?').run(
      titulo, descricao, categoriaId, tarefa.id);
    res.json(converter(buscarTarefa(tarefa.id, req.usuario.id)));
  });

  // Transação 6: concluir / reabrir tarefa
  app.patch('/api/tarefas/:id/concluir', autenticar, (req, res) => {
    const tarefa = buscarTarefa(req.params.id, req.usuario.id);
    if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
    db.prepare('UPDATE tarefas SET concluida = ? WHERE id = ?').run(tarefa.concluida ? 0 : 1, tarefa.id);
    res.json(converter(buscarTarefa(tarefa.id, req.usuario.id)));
  });

  // Transação 7: excluir tarefa
  app.delete('/api/tarefas/:id', autenticar, (req, res) => {
    const tarefa = buscarTarefa(req.params.id, req.usuario.id);
    if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
    db.prepare('DELETE FROM tarefas WHERE id = ?').run(tarefa.id);
    res.status(204).end();
  });

  // ---------- Administração (somente papel "admin") ----------
  const admin = [autenticar, exigirPapel('admin')];

  app.get('/api/admin/usuarios', ...admin, (req, res) => {
    res.json(db.prepare('SELECT id, nome, email, papel FROM usuarios ORDER BY id').all());
  });

  // Transação 8: alterar papel de um usuário
  app.patch('/api/admin/usuarios/:id/papel', ...admin, (req, res) => {
    const papel = req.body.papel;
    if (!['usuario', 'admin'].includes(papel)) return res.status(400).json({ erro: 'Papel inválido.' });
    const id = Number(req.params.id);
    if (id === req.usuario.id) return res.status(400).json({ erro: 'Você não pode alterar o próprio papel.' });
    const info = db.prepare('UPDATE usuarios SET papel = ? WHERE id = ?').run(papel, id);
    if (!info.changes) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    res.json(db.prepare('SELECT id, nome, email, papel FROM usuarios WHERE id = ?').get(id));
  });

  // Transação 9: excluir usuário
  app.delete('/api/admin/usuarios/:id', ...admin, (req, res) => {
    const id = Number(req.params.id);
    if (id === req.usuario.id) return res.status(400).json({ erro: 'Você não pode excluir a si mesmo.' });
    const info = db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
    if (!info.changes) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    res.status(204).end();
  });

  // ---------- Frontend compilado (produção) ----------
  const dist = path.join(__dirname, '..', '..', 'frontend', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  return app;
}

module.exports = { criarApp };
