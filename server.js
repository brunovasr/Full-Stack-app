const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Lista de tarefas em memória (suficiente para demonstrar a aplicação em operação)
let tarefas = [];
let proximoId = 1;

app.get('/api/tarefas', (req, res) => res.json(tarefas));

app.post('/api/tarefas', (req, res) => {
  const titulo = (req.body.titulo || '').trim();
  if (!titulo) return res.status(400).json({ erro: 'Informe um título.' });
  const tarefa = { id: proximoId++, titulo, concluida: false };
  tarefas.push(tarefa);
  res.status(201).json(tarefa);
});

app.put('/api/tarefas/:id', (req, res) => {
  const tarefa = tarefas.find(t => t.id === Number(req.params.id));
  if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  tarefa.concluida = !tarefa.concluida;
  res.json(tarefa);
});

app.delete('/api/tarefas/:id', (req, res) => {
  tarefas = tarefas.filter(t => t.id !== Number(req.params.id));
  res.status(204).end();
});

app.listen(PORT, () => console.log(`Servidor em execução na porta ${PORT}`));
