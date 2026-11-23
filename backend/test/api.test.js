const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { abrirBanco } = require('../src/db');
const { criarApp } = require('../src/app');

let app;
beforeEach(() => { app = criarApp(abrirBanco(':memory:')); });

const registrar = async (nome, email, senha = 'senha123') =>
  (await request(app).post('/api/auth/registrar').send({ nome, email, senha })).body;
const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('Autenticação', () => {
  test('cadastra usuário; o primeiro vira admin e o segundo, usuário comum', async () => {
    const a = await registrar('Ana', 'ana@x.com');
    const b = await registrar('Beto', 'beto@x.com');
    assert.equal(a.usuario.papel, 'admin');
    assert.equal(b.usuario.papel, 'usuario');
    assert.ok(a.token);
  });
  test('rejeita cadastro inválido e e-mail duplicado', async () => {
    const r1 = await request(app).post('/api/auth/registrar').send({ nome: '', email: 'x', senha: '123456' });
    assert.equal(r1.status, 400);
    const r2 = await request(app).post('/api/auth/registrar').send({ nome: 'A', email: 'a@x.com', senha: '123' });
    assert.equal(r2.status, 400);
    await registrar('Ana', 'ana@x.com');
    const r3 = await request(app).post('/api/auth/registrar').send({ nome: 'Ana', email: 'ANA@x.com', senha: 'senha123' });
    assert.equal(r3.status, 409);
  });
  test('login com credenciais corretas e incorretas', async () => {
    await registrar('Ana', 'ana@x.com');
    const ok = await request(app).post('/api/auth/login').send({ email: 'ana@x.com', senha: 'senha123' });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token);
    const ruim = await request(app).post('/api/auth/login').send({ email: 'ana@x.com', senha: 'errada' });
    assert.equal(ruim.status, 401);
  });
  test('rotas protegidas exigem token válido', async () => {
    assert.equal((await request(app).get('/api/tarefas')).status, 401);
    assert.equal((await request(app).get('/api/tarefas').set(auth('lixo'))).status, 401);
  });
});

describe('Tarefas e categorias', () => {
  test('ciclo completo: criar, editar, concluir e excluir tarefa', async () => {
    const { token } = await registrar('Ana', 'ana@x.com');
    const cat = await request(app).post('/api/categorias').set(auth(token)).send({ nome: 'Estudos' });
    assert.equal(cat.status, 201);

    const criada = await request(app).post('/api/tarefas').set(auth(token))
      .send({ titulo: 'Entregar trabalho', categoria_id: cat.body.id });
    assert.equal(criada.status, 201);
    assert.equal(criada.body.concluida, false);
    const id = criada.body.id;

    const editada = await request(app).put(`/api/tarefas/${id}`).set(auth(token)).send({ titulo: 'Entregar trabalho final' });
    assert.equal(editada.body.titulo, 'Entregar trabalho final');
    assert.equal(editada.body.categoria_id, cat.body.id);

    const feita = await request(app).patch(`/api/tarefas/${id}/concluir`).set(auth(token));
    assert.equal(feita.body.concluida, true);
    const reaberta = await request(app).patch(`/api/tarefas/${id}/concluir`).set(auth(token));
    assert.equal(reaberta.body.concluida, false);

    assert.equal((await request(app).delete(`/api/tarefas/${id}`).set(auth(token))).status, 204);
    assert.deepEqual((await request(app).get('/api/tarefas').set(auth(token))).body, []);
  });
  test('valida título vazio e categoria inexistente', async () => {
    const { token } = await registrar('Ana', 'ana@x.com');
    assert.equal((await request(app).post('/api/tarefas').set(auth(token)).send({ titulo: '  ' })).status, 400);
    assert.equal((await request(app).post('/api/tarefas').set(auth(token)).send({ titulo: 'x', categoria_id: 99 })).status, 400);
  });
  test('categoria duplicada retorna 409', async () => {
    const { token } = await registrar('Ana', 'ana@x.com');
    await request(app).post('/api/categorias').set(auth(token)).send({ nome: 'Casa' });
    const r = await request(app).post('/api/categorias').set(auth(token)).send({ nome: 'Casa' });
    assert.equal(r.status, 409);
  });
  test('autorização: usuário não acessa tarefas de outro', async () => {
    const a = await registrar('Ana', 'ana@x.com');
    const b = await registrar('Beto', 'beto@x.com');
    const t = await request(app).post('/api/tarefas').set(auth(a.token)).send({ titulo: 'Privada' });
    assert.equal((await request(app).put(`/api/tarefas/${t.body.id}`).set(auth(b.token)).send({ titulo: 'x' })).status, 404);
    assert.equal((await request(app).patch(`/api/tarefas/${t.body.id}/concluir`).set(auth(b.token))).status, 404);
    assert.equal((await request(app).delete(`/api/tarefas/${t.body.id}`).set(auth(b.token))).status, 404);
    assert.deepEqual((await request(app).get('/api/tarefas').set(auth(b.token))).body, []);
  });
});

describe('Administração', () => {
  test('usuário comum recebe 403 nas rotas de admin', async () => {
    await registrar('Ana', 'ana@x.com');
    const b = await registrar('Beto', 'beto@x.com');
    assert.equal((await request(app).get('/api/admin/usuarios').set(auth(b.token))).status, 403);
  });
  test('admin lista, altera papel e exclui usuários', async () => {
    const a = await registrar('Ana', 'ana@x.com');
    const b = await registrar('Beto', 'beto@x.com');
    const lista = await request(app).get('/api/admin/usuarios').set(auth(a.token));
    assert.equal(lista.body.length, 2);

    const promovido = await request(app).patch(`/api/admin/usuarios/${b.usuario.id}/papel`).set(auth(a.token)).send({ papel: 'admin' });
    assert.equal(promovido.body.papel, 'admin');
    assert.equal((await request(app).patch(`/api/admin/usuarios/${b.usuario.id}/papel`).set(auth(a.token)).send({ papel: 'x' })).status, 400);

    assert.equal((await request(app).delete(`/api/admin/usuarios/${b.usuario.id}`).set(auth(a.token))).status, 204);
    assert.equal((await request(app).delete(`/api/admin/usuarios/${b.usuario.id}`).set(auth(a.token))).status, 404);
  });
  test('admin não pode alterar nem excluir a si mesmo', async () => {
    const a = await registrar('Ana', 'ana@x.com');
    assert.equal((await request(app).patch(`/api/admin/usuarios/${a.usuario.id}/papel`).set(auth(a.token)).send({ papel: 'usuario' })).status, 400);
    assert.equal((await request(app).delete(`/api/admin/usuarios/${a.usuario.id}`).set(auth(a.token))).status, 400);
  });
});
