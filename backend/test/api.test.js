const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { abrirBanco } = require('../src/db');
const { criarApp } = require('../src/app');

const DIA = 24 * 60 * 60 * 1000;
let app, relogio;
beforeEach(() => {
  relogio = new Date('2026-11-01T12:00:00Z');
  app = criarApp(abrirBanco(':memory:'), { agora: () => relogio });
});
const avancar = (dias) => { relogio = new Date(relogio.getTime() + dias * DIA); };

const registrar = async (nome, email, senha = 'senha123') =>
  (await request(app).post('/api/auth/registrar').send({ nome, email, senha })).body;
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const novoLivro = async (token, extra = {}) =>
  (await request(app).post('/api/livros').set(auth(token))
    .send({ titulo: 'Dom Casmurro', autor: 'Machado de Assis', exemplares_total: 2, ...extra })).body;
const emprestar = (token, livro_id) => request(app).post('/api/emprestimos').set(auth(token)).send({ livro_id });

describe('Autenticação', () => {
  test('o primeiro usuário vira admin e o segundo, leitor', async () => {
    const a = await registrar('Ana', 'ana@x.com');
    const b = await registrar('Beto', 'beto@x.com');
    assert.equal(a.usuario.papel, 'admin');
    assert.equal(b.usuario.papel, 'leitor');
    assert.ok(a.token);
  });
  test('rejeita cadastro inválido e e-mail duplicado', async () => {
    assert.equal((await request(app).post('/api/auth/registrar').send({ nome: '', email: 'x', senha: '123456' })).status, 400);
    assert.equal((await request(app).post('/api/auth/registrar').send({ nome: 'A', email: 'a@x.com', senha: '123' })).status, 400);
    await registrar('Ana', 'ana@x.com');
    assert.equal((await request(app).post('/api/auth/registrar').send({ nome: 'Ana', email: 'ANA@x.com', senha: 'senha123' })).status, 409);
  });
  test('login com credenciais corretas e incorretas', async () => {
    await registrar('Ana', 'ana@x.com');
    const ok = await request(app).post('/api/auth/login').send({ email: 'ana@x.com', senha: 'senha123' });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token);
    assert.equal((await request(app).post('/api/auth/login').send({ email: 'ana@x.com', senha: 'errada' })).status, 401);
  });
  test('rotas protegidas exigem token válido', async () => {
    assert.equal((await request(app).get('/api/livros')).status, 401);
    assert.equal((await request(app).get('/api/livros').set(auth('lixo'))).status, 401);
  });
});

describe('CORS', () => {
  test('responde ao preflight e libera a origem do frontend', async () => {
    const r = await request(app).options('/api/livros').set('Origin', 'https://site.exemplo.net');
    assert.equal(r.status, 204);
    assert.equal(r.headers['access-control-allow-origin'], '*');
    assert.match(r.headers['access-control-allow-headers'], /Authorization/);
  });
});

describe('Acervo', () => {
  test('admin cadastra, edita, busca e exclui livro', async () => {
    const a = await registrar('Ana', 'ana@x.com');
    const livro = await novoLivro(a.token);
    assert.equal(livro.exemplares_disponiveis, 2);

    const editado = await request(app).put(`/api/livros/${livro.id}`).set(auth(a.token)).send({ exemplares_total: 5 });
    assert.equal(editado.body.exemplares_disponiveis, 5);

    const busca = await request(app).get('/api/livros?q=machado').set(auth(a.token));
    assert.equal(busca.body.length, 1);
    assert.equal((await request(app).get('/api/livros?q=inexistente').set(auth(a.token))).body.length, 0);

    assert.equal((await request(app).delete(`/api/livros/${livro.id}`).set(auth(a.token))).status, 204);
    assert.deepEqual((await request(app).get('/api/livros').set(auth(a.token))).body, []);
  });
  test('leitor não pode cadastrar, editar nem excluir livros (403)', async () => {
    const a = await registrar('Ana', 'ana@x.com');
    const b = await registrar('Beto', 'beto@x.com');
    const livro = await novoLivro(a.token);
    assert.equal((await request(app).post('/api/livros').set(auth(b.token)).send({ titulo: 'x', autor: 'y', exemplares_total: 1 })).status, 403);
    assert.equal((await request(app).put(`/api/livros/${livro.id}`).set(auth(b.token)).send({ titulo: 'z' })).status, 403);
    assert.equal((await request(app).delete(`/api/livros/${livro.id}`).set(auth(b.token))).status, 403);
  });
  test('valida dados do livro', async () => {
    const a = await registrar('Ana', 'ana@x.com');
    assert.equal((await request(app).post('/api/livros').set(auth(a.token)).send({ titulo: '', autor: 'x', exemplares_total: 1 })).status, 400);
    assert.equal((await request(app).post('/api/livros').set(auth(a.token)).send({ titulo: 'x', autor: 'y', exemplares_total: -1 })).status, 400);
  });
  test('não exclui livro emprestado nem reduz total abaixo dos emprestados', async () => {
    const a = await registrar('Ana', 'ana@x.com');
    const b = await registrar('Beto', 'beto@x.com');
    const livro = await novoLivro(a.token);
    await emprestar(b.token, livro.id);
    assert.equal((await request(app).delete(`/api/livros/${livro.id}`).set(auth(a.token))).status, 409);
    assert.equal((await request(app).put(`/api/livros/${livro.id}`).set(auth(a.token)).send({ exemplares_total: 0 })).status, 409);
  });
});

describe('Empréstimos', () => {
  test('empresta e devolve no prazo, ajustando o estoque e sem multa', async () => {
    const a = await registrar('Ana', 'ana@x.com');
    const b = await registrar('Beto', 'beto@x.com');
    const livro = await novoLivro(a.token);

    const emp = await emprestar(b.token, livro.id);
    assert.equal(emp.status, 201);
    assert.equal(new Date(emp.body.data_prevista).getTime() - relogio.getTime(), 14 * DIA);
    const apos = (await request(app).get('/api/livros').set(auth(b.token))).body[0];
    assert.equal(apos.exemplares_disponiveis, 1);

    avancar(10);
    const dev = await request(app).patch(`/api/emprestimos/${emp.body.id}/devolver`).set(auth(b.token));
    assert.equal(dev.status, 200);
    assert.equal(dev.body.multa_centavos, 0);
    assert.ok(dev.body.data_devolucao);
    assert.equal((await request(app).get('/api/livros').set(auth(b.token))).body[0].exemplares_disponiveis, 2);
    assert.equal((await request(app).patch(`/api/emprestimos/${emp.body.id}/devolver`).set(auth(b.token))).status, 409);
  });
  test('cobra multa de R$ 1,00 por dia de atraso', async () => {
    const a = await registrar('Ana', 'ana@x.com');
    const b = await registrar('Beto', 'beto@x.com');
    const livro = await novoLivro(a.token);
    const emp = await emprestar(b.token, livro.id);
    avancar(14 + 5);
    const lista = await request(app).get('/api/emprestimos').set(auth(b.token));
    assert.equal(lista.body[0].atrasado, true);
    assert.equal(lista.body[0].multa_prevista_centavos, 500);
    const dev = await request(app).patch(`/api/emprestimos/${emp.body.id}/devolver`).set(auth(b.token));
    assert.equal(dev.body.multa_centavos, 500);
  });
  test('recusa empréstimo sem exemplar, duplicado ou acima do limite de 3', async () => {
    const a = await registrar('Ana', 'ana@x.com');
    const b = await registrar('Beto', 'beto@x.com');
    const c = await registrar('Caio', 'caio@x.com');
    const unico = await novoLivro(a.token, { titulo: 'Único', exemplares_total: 1 });
    assert.equal((await emprestar(b.token, unico.id)).status, 201);
    assert.equal((await emprestar(b.token, unico.id)).status, 409); // já está com o livro
    assert.equal((await emprestar(c.token, unico.id)).status, 409); // sem exemplares
    assert.equal((await emprestar(c.token, 999)).status, 404);

    const ids = [];
    for (const t of ['L1', 'L2', 'L3', 'L4']) ids.push((await novoLivro(a.token, { titulo: t })).id);
    for (const id of ids.slice(0, 3)) assert.equal((await emprestar(c.token, id)).status, 201);
    assert.equal((await emprestar(c.token, ids[3])).status, 409); // limite
  });
  test('renova uma única vez e não renova em atraso', async () => {
    const a = await registrar('Ana', 'ana@x.com');
    const b = await registrar('Beto', 'beto@x.com');
    const livro = await novoLivro(a.token);
    const emp = await emprestar(b.token, livro.id);
    const ren = await request(app).patch(`/api/emprestimos/${emp.body.id}/renovar`).set(auth(b.token));
    assert.equal(ren.status, 200);
    assert.equal(ren.body.renovacoes, 1);
    assert.equal(new Date(ren.body.data_prevista).getTime() - relogio.getTime(), 21 * DIA);
    assert.equal((await request(app).patch(`/api/emprestimos/${emp.body.id}/renovar`).set(auth(b.token))).status, 409);

    const outro = await emprestar(a.token, livro.id);
    avancar(20);
    assert.equal((await request(app).patch(`/api/emprestimos/${outro.body.id}/renovar`).set(auth(a.token))).status, 409);
  });
  test('autorização: leitor não vê nem altera empréstimo de outro; admin vê todos', async () => {
    const a = await registrar('Ana', 'ana@x.com');
    const b = await registrar('Beto', 'beto@x.com');
    const c = await registrar('Caio', 'caio@x.com');
    const livro = await novoLivro(a.token);
    const emp = await emprestar(b.token, livro.id);
    assert.equal((await request(app).patch(`/api/emprestimos/${emp.body.id}/devolver`).set(auth(c.token))).status, 404);
    assert.equal((await request(app).patch(`/api/emprestimos/${emp.body.id}/renovar`).set(auth(c.token))).status, 404);
    assert.equal((await request(app).get('/api/emprestimos').set(auth(c.token))).body.length, 0);
    assert.equal((await request(app).get('/api/emprestimos').set(auth(a.token))).body.length, 1);
    assert.equal((await request(app).patch(`/api/emprestimos/${emp.body.id}/devolver`).set(auth(a.token))).status, 200);
  });
});

describe('Administração de usuários', () => {
  test('leitor recebe 403 nas rotas de admin', async () => {
    await registrar('Ana', 'ana@x.com');
    const b = await registrar('Beto', 'beto@x.com');
    assert.equal((await request(app).get('/api/admin/usuarios').set(auth(b.token))).status, 403);
  });
  test('admin lista, altera papel e exclui usuários', async () => {
    const a = await registrar('Ana', 'ana@x.com');
    const b = await registrar('Beto', 'beto@x.com');
    assert.equal((await request(app).get('/api/admin/usuarios').set(auth(a.token))).body.length, 2);
    const promovido = await request(app).patch(`/api/admin/usuarios/${b.usuario.id}/papel`).set(auth(a.token)).send({ papel: 'admin' });
    assert.equal(promovido.body.papel, 'admin');
    assert.equal((await request(app).patch(`/api/admin/usuarios/${b.usuario.id}/papel`).set(auth(a.token)).send({ papel: 'x' })).status, 400);
    assert.equal((await request(app).delete(`/api/admin/usuarios/${b.usuario.id}`).set(auth(a.token))).status, 204);
    assert.equal((await request(app).delete(`/api/admin/usuarios/${b.usuario.id}`).set(auth(a.token))).status, 404);
  });
  test('não exclui usuário com empréstimo em aberto; admin não altera nem exclui a si mesmo', async () => {
    const a = await registrar('Ana', 'ana@x.com');
    const b = await registrar('Beto', 'beto@x.com');
    const livro = await novoLivro(a.token);
    await emprestar(b.token, livro.id);
    assert.equal((await request(app).delete(`/api/admin/usuarios/${b.usuario.id}`).set(auth(a.token))).status, 409);
    assert.equal((await request(app).patch(`/api/admin/usuarios/${a.usuario.id}/papel`).set(auth(a.token)).send({ papel: 'leitor' })).status, 400);
    assert.equal((await request(app).delete(`/api/admin/usuarios/${a.usuario.id}`).set(auth(a.token))).status, 400);
  });
});
