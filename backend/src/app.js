const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { gerarToken, autenticar, exigirPapel } = require('./auth');

// Regras da biblioteca
const PRAZO_DIAS = 14;
const DIAS_RENOVACAO = 7;
const MAX_EMPRESTIMOS = 3;
const MULTA_DIA_CENTAVOS = 100;
const DIA_MS = 24 * 60 * 60 * 1000;

// "agora" é injetável para que os testes possam simular atrasos.
function criarApp(db, { agora = () => new Date() } = {}) {
  const app = express();
  app.use(express.json());

  // CORS: permite que o frontend (hospedado em outro domínio) chame a API.
  // Origens liberadas via CORS_ORIGIN (separadas por vírgula); "*" por padrão.
  const origens = (process.env.CORS_ORIGIN || '*').split(',').map((o) => o.trim());
  app.use((req, res, next) => {
    const origem = req.headers.origin;
    if (origem && (origens.includes('*') || origens.includes(origem))) {
      res.setHeader('Access-Control-Allow-Origin', origens.includes('*') ? '*' : origem);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  const texto = (v) => (typeof v === 'string' ? v.trim() : '');
  const publico = (u) => ({ id: u.id, nome: u.nome, email: u.email, papel: u.papel });
  const somarDias = (iso, dias) => new Date(new Date(iso).getTime() + dias * DIA_MS).toISOString();
  const ehInteiro = (n) => Number.isInteger(n) && n >= 0;

  // Verificação de saúde para a hospedagem (responde 200 sem exigir login).
  app.get('/api/saude', (req, res) => res.json({ status: 'ok' }));

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
    // O primeiro usuário do sistema torna-se administrador (bibliotecário).
    const primeiro = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n === 0;
    const info = db
      .prepare('INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES (?, ?, ?, ?)')
      .run(nome, email, bcrypt.hashSync(senha, 10), primeiro ? 'admin' : 'leitor');
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

  // ---------- Acervo de livros ----------
  const admin = [autenticar, exigirPapel('admin')];
  const buscarLivro = (id) => db.prepare('SELECT * FROM livros WHERE id = ? AND ativo = 1').get(Number(id));
  const emprestadosDoLivro = (id) =>
    db.prepare('SELECT COUNT(*) AS n FROM emprestimos WHERE livro_id = ? AND data_devolucao IS NULL').get(id).n;

  app.get('/api/livros', autenticar, (req, res) => {
    const q = `%${texto(req.query.q)}%`;
    res.json(db.prepare(
      'SELECT id, titulo, autor, isbn, exemplares_total, exemplares_disponiveis FROM livros ' +
      'WHERE ativo = 1 AND (titulo LIKE ? OR autor LIKE ?) ORDER BY titulo').all(q, q));
  });

  // Dados de um livro vindos do corpo da requisição; devolve erro (string) ou os valores.
  function lerLivro(corpo, atual = {}) {
    const titulo = corpo.titulo === undefined ? atual.titulo : texto(corpo.titulo);
    const autor = corpo.autor === undefined ? atual.autor : texto(corpo.autor);
    const isbn = corpo.isbn === undefined ? atual.isbn ?? '' : texto(corpo.isbn);
    const total = corpo.exemplares_total === undefined ? atual.exemplares_total : corpo.exemplares_total;
    if (!titulo || !autor) return { erro: 'Título e autor são obrigatórios.' };
    if (!ehInteiro(total)) return { erro: 'Quantidade de exemplares inválida.' };
    return { titulo, autor, isbn, total };
  }

  // Transação 3: cadastrar livro (admin)
  app.post('/api/livros', ...admin, (req, res) => {
    const d = lerLivro(req.body);
    if (d.erro) return res.status(400).json({ erro: d.erro });
    const info = db.prepare(
      'INSERT INTO livros (titulo, autor, isbn, exemplares_total, exemplares_disponiveis) VALUES (?, ?, ?, ?, ?)')
      .run(d.titulo, d.autor, d.isbn, d.total, d.total);
    res.status(201).json(buscarLivro(info.lastInsertRowid));
  });

  // Transação 4: editar livro (admin)
  app.put('/api/livros/:id', ...admin, (req, res) => {
    const livro = buscarLivro(req.params.id);
    if (!livro) return res.status(404).json({ erro: 'Livro não encontrado.' });
    const d = lerLivro(req.body, livro);
    if (d.erro) return res.status(400).json({ erro: d.erro });
    const emprestados = emprestadosDoLivro(livro.id);
    if (d.total < emprestados)
      return res.status(409).json({ erro: `Há ${emprestados} exemplar(es) emprestado(s); o total não pode ser menor.` });
    db.prepare('UPDATE livros SET titulo = ?, autor = ?, isbn = ?, exemplares_total = ?, exemplares_disponiveis = ? WHERE id = ?')
      .run(d.titulo, d.autor, d.isbn, d.total, d.total - emprestados, livro.id);
    res.json(buscarLivro(livro.id));
  });

  // Transação 5: excluir livro do acervo (admin) — bloqueado se houver empréstimo em aberto
  app.delete('/api/livros/:id', ...admin, (req, res) => {
    const livro = buscarLivro(req.params.id);
    if (!livro) return res.status(404).json({ erro: 'Livro não encontrado.' });
    if (emprestadosDoLivro(livro.id) > 0)
      return res.status(409).json({ erro: 'Livro possui empréstimos em aberto.' });
    db.prepare('UPDATE livros SET ativo = 0 WHERE id = ?').run(livro.id);
    res.status(204).end();
  });

  // ---------- Empréstimos ----------
  const consultaEmprestimos = `
    SELECT e.id, e.livro_id, l.titulo, e.usuario_id, u.nome AS usuario_nome, e.data_emprestimo,
           e.data_prevista, e.data_devolucao, e.renovacoes, e.multa_centavos
    FROM emprestimos e JOIN livros l ON l.id = e.livro_id JOIN usuarios u ON u.id = e.usuario_id`;
  const buscarEmprestimo = (id) => db.prepare(`${consultaEmprestimos} WHERE e.id = ?`).get(Number(id));
  // Leitor só mexe nos próprios empréstimos; admin em todos.
  const podeAcessar = (req, e) => req.usuario.papel === 'admin' || e.usuario_id === req.usuario.id;
  const diasDeAtraso = (e, ref) => Math.max(0, Math.ceil((new Date(ref) - new Date(e.data_prevista)) / DIA_MS));

  app.get('/api/emprestimos', autenticar, (req, res) => {
    const dono = req.usuario.papel === 'admin' ? '' : 'WHERE e.usuario_id = ?';
    const linhas = db.prepare(`${consultaEmprestimos} ${dono} ORDER BY e.id DESC`)
      .all(...(dono ? [req.usuario.id] : []));
    const ref = agora().toISOString();
    res.json(linhas.map((e) => ({
      ...e,
      atrasado: !e.data_devolucao && diasDeAtraso(e, ref) > 0,
      multa_prevista_centavos: e.data_devolucao ? 0 : diasDeAtraso(e, ref) * MULTA_DIA_CENTAVOS,
    })));
  });

  // Transação 6: emprestar livro
  app.post('/api/emprestimos', autenticar, (req, res) => {
    const livro = buscarLivro(req.body.livro_id);
    if (!livro) return res.status(404).json({ erro: 'Livro não encontrado.' });
    const abertos = db.prepare('SELECT livro_id FROM emprestimos WHERE usuario_id = ? AND data_devolucao IS NULL')
      .all(req.usuario.id);
    if (abertos.length >= MAX_EMPRESTIMOS)
      return res.status(409).json({ erro: `Limite de ${MAX_EMPRESTIMOS} empréstimos em aberto atingido.` });
    if (abertos.some((a) => a.livro_id === livro.id))
      return res.status(409).json({ erro: 'Você já está com um exemplar deste livro.' });
    if (livro.exemplares_disponiveis < 1)
      return res.status(409).json({ erro: 'Não há exemplares disponíveis.' });
    const inicio = agora().toISOString();
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE livros SET exemplares_disponiveis = exemplares_disponiveis - 1 WHERE id = ?').run(livro.id);
      const info = db.prepare(
        'INSERT INTO emprestimos (livro_id, usuario_id, data_emprestimo, data_prevista) VALUES (?, ?, ?, ?)')
        .run(livro.id, req.usuario.id, inicio, somarDias(inicio, PRAZO_DIAS));
      db.exec('COMMIT');
      res.status(201).json(buscarEmprestimo(info.lastInsertRowid));
    } catch (e) {
      db.exec('ROLLBACK');
      res.status(500).json({ erro: 'Falha ao registrar o empréstimo.' });
    }
  });

  // Transação 7: devolver livro (calcula multa por atraso)
  app.patch('/api/emprestimos/:id/devolver', autenticar, (req, res) => {
    const e = buscarEmprestimo(req.params.id);
    if (!e || !podeAcessar(req, e)) return res.status(404).json({ erro: 'Empréstimo não encontrado.' });
    if (e.data_devolucao) return res.status(409).json({ erro: 'Empréstimo já devolvido.' });
    const hoje = agora().toISOString();
    const multa = diasDeAtraso(e, hoje) * MULTA_DIA_CENTAVOS;
    db.exec('BEGIN');
    db.prepare('UPDATE emprestimos SET data_devolucao = ?, multa_centavos = ? WHERE id = ?').run(hoje, multa, e.id);
    db.prepare('UPDATE livros SET exemplares_disponiveis = exemplares_disponiveis + 1 WHERE id = ?').run(e.livro_id);
    db.exec('COMMIT');
    res.json(buscarEmprestimo(e.id));
  });

  // Transação 8: renovar empréstimo (uma vez, e somente se não estiver atrasado)
  app.patch('/api/emprestimos/:id/renovar', autenticar, (req, res) => {
    const e = buscarEmprestimo(req.params.id);
    if (!e || !podeAcessar(req, e)) return res.status(404).json({ erro: 'Empréstimo não encontrado.' });
    if (e.data_devolucao) return res.status(409).json({ erro: 'Empréstimo já devolvido.' });
    if (e.renovacoes >= 1) return res.status(409).json({ erro: 'Este empréstimo já foi renovado.' });
    if (diasDeAtraso(e, agora().toISOString()) > 0)
      return res.status(409).json({ erro: 'Empréstimo em atraso não pode ser renovado.' });
    db.prepare('UPDATE emprestimos SET data_prevista = ?, renovacoes = renovacoes + 1 WHERE id = ?')
      .run(somarDias(e.data_prevista, DIAS_RENOVACAO), e.id);
    res.json(buscarEmprestimo(e.id));
  });

  // ---------- Administração de usuários (somente "admin") ----------
  app.get('/api/admin/usuarios', ...admin, (req, res) => {
    res.json(db.prepare('SELECT id, nome, email, papel FROM usuarios ORDER BY id').all());
  });

  // Transação 9: alterar papel de um usuário
  app.patch('/api/admin/usuarios/:id/papel', ...admin, (req, res) => {
    const papel = req.body.papel;
    if (!['leitor', 'admin'].includes(papel)) return res.status(400).json({ erro: 'Papel inválido.' });
    const id = Number(req.params.id);
    if (id === req.usuario.id) return res.status(400).json({ erro: 'Você não pode alterar o próprio papel.' });
    const info = db.prepare('UPDATE usuarios SET papel = ? WHERE id = ?').run(papel, id);
    if (!info.changes) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    res.json(db.prepare('SELECT id, nome, email, papel FROM usuarios WHERE id = ?').get(id));
  });

  // Transação 10: excluir usuário (bloqueado se tiver empréstimos em aberto)
  app.delete('/api/admin/usuarios/:id', ...admin, (req, res) => {
    const id = Number(req.params.id);
    if (id === req.usuario.id) return res.status(400).json({ erro: 'Você não pode excluir a si mesmo.' });
    if (!db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(id))
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    if (db.prepare('SELECT 1 FROM emprestimos WHERE usuario_id = ? AND data_devolucao IS NULL').get(id))
      return res.status(409).json({ erro: 'Usuário possui empréstimos em aberto.' });
    db.exec('BEGIN');
    db.prepare('DELETE FROM emprestimos WHERE usuario_id = ?').run(id);
    db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
    db.exec('COMMIT');
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
