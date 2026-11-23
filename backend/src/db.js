const { DatabaseSync } = require('node:sqlite');

// Abre (ou cria) o banco SQLite e garante o esquema das tabelas.
function abrirBanco(arquivo = process.env.DB_FILE || 'biblioteca.sqlite') {
  const db = new DatabaseSync(arquivo);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      papel TEXT NOT NULL DEFAULT 'leitor' CHECK (papel IN ('leitor','admin')),
      criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS livros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      autor TEXT NOT NULL,
      isbn TEXT NOT NULL DEFAULT '',
      exemplares_total INTEGER NOT NULL CHECK (exemplares_total >= 0),
      exemplares_disponiveis INTEGER NOT NULL CHECK (exemplares_disponiveis >= 0),
      ativo INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS emprestimos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      livro_id INTEGER NOT NULL REFERENCES livros(id),
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      data_emprestimo TEXT NOT NULL,
      data_prevista TEXT NOT NULL,
      data_devolucao TEXT,
      renovacoes INTEGER NOT NULL DEFAULT 0,
      multa_centavos INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

module.exports = { abrirBanco };
