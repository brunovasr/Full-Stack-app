const { DatabaseSync } = require('node:sqlite');

// Abre (ou cria) o banco SQLite e garante o esquema das tabelas.
function abrirBanco(arquivo = process.env.DB_FILE || 'dados.sqlite') {
  const db = new DatabaseSync(arquivo);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      papel TEXT NOT NULL DEFAULT 'usuario' CHECK (papel IN ('usuario','admin')),
      criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      nome TEXT NOT NULL,
      UNIQUE (usuario_id, nome)
    );
    CREATE TABLE IF NOT EXISTS tarefas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
      titulo TEXT NOT NULL,
      descricao TEXT NOT NULL DEFAULT '',
      concluida INTEGER NOT NULL DEFAULT 0,
      criada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return db;
}

module.exports = { abrirBanco };
