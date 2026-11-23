const jwt = require('jsonwebtoken');

const SEGREDO = () => process.env.JWT_SECRET || 'segredo-de-desenvolvimento';

function gerarToken(usuario) {
  return jwt.sign({ id: usuario.id, papel: usuario.papel }, SEGREDO(), { expiresIn: '8h' });
}

// Autenticação: exige um token JWT válido no cabeçalho Authorization.
function autenticar(req, res, next) {
  const cabecalho = req.headers.authorization || '';
  const [tipo, token] = cabecalho.split(' ');
  if (tipo !== 'Bearer' || !token) return res.status(401).json({ erro: 'Token não informado.' });
  try {
    req.usuario = jwt.verify(token, SEGREDO());
    next();
  } catch {
    res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
}

// Autorização: restringe a rota a determinados papéis.
const exigirPapel = (...papeis) => (req, res, next) =>
  papeis.includes(req.usuario.papel) ? next() : res.status(403).json({ erro: 'Acesso negado.' });

module.exports = { gerarToken, autenticar, exigirPapel };
