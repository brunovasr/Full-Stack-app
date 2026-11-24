const bcrypt = require('bcryptjs');

// Cria dados de demonstração quando o banco está vazio e SEED_SENHA está definida.
// Útil em hospedagens com disco temporário (o banco é recriado a cada reinício).
function semear(db, senha) {
  if (!senha || db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n > 0) return false;
  const hash = bcrypt.hashSync(senha, 10);
  const usuario = db.prepare('INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES (?, ?, ?, ?)');
  usuario.run('Bibliotecário Demo', 'bibliotecario@unifor.br', hash, 'admin');
  usuario.run('Leitor Demo', 'leitor@unifor.br', hash, 'leitor');
  const livro = db.prepare('INSERT INTO livros (titulo, autor, isbn, exemplares_total, exemplares_disponiveis) VALUES (?, ?, ?, ?, ?)');
  [['Dom Casmurro', 'Machado de Assis', '9788535910663', 3],
   ['Capitães da Areia', 'Jorge Amado', '9788535914061', 2],
   ['Vidas Secas', 'Graciliano Ramos', '9788501115942', 3],
   ['Memórias Póstumas de Brás Cubas', 'Machado de Assis', '9788535911664', 1]]
    .forEach(([t, a, i, n]) => livro.run(t, a, i, n, n));
  return true;
}

module.exports = { semear };
