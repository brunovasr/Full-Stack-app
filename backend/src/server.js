const { abrirBanco } = require('./db');
const { criarApp } = require('./app');
const { semear } = require('./seed');

const PORT = process.env.PORT || 3000;
const db = abrirBanco();
if (semear(db, process.env.SEED_SENHA)) console.log('Dados de demonstração criados.');
criarApp(db).listen(PORT, () => console.log(`API em execução na porta ${PORT}`));
