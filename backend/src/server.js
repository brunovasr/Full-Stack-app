const { abrirBanco } = require('./db');
const { criarApp } = require('./app');

const PORT = process.env.PORT || 3000;
criarApp(abrirBanco()).listen(PORT, () => console.log(`API em execução na porta ${PORT}`));
