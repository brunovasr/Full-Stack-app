import { useEffect, useState } from 'react';
import { chamar } from './api.js';

export default function Tarefas({ aoErro }) {
  const [tarefas, setTarefas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [titulo, setTitulo] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [novaCategoria, setNovaCategoria] = useState('');

  const executar = (fn) => fn().catch((e) => aoErro(e.message));
  const carregar = () => executar(async () => {
    setTarefas(await chamar('GET', '/api/tarefas'));
    setCategorias(await chamar('GET', '/api/categorias'));
  });
  useEffect(() => { carregar(); }, []);

  const nomeCategoria = (id) => categorias.find((c) => c.id === id)?.nome;

  const criar = (e) => { e.preventDefault(); executar(async () => {
    await chamar('POST', '/api/tarefas', { titulo, categoria_id: categoriaId ? Number(categoriaId) : null });
    setTitulo(''); await carregar();
  }); };
  const editar = (t) => {
    const novo = window.prompt('Novo título:', t.titulo);
    if (novo !== null) executar(async () => { await chamar('PUT', `/api/tarefas/${t.id}`, { titulo: novo }); await carregar(); });
  };
  const concluir = (t) => executar(async () => { await chamar('PATCH', `/api/tarefas/${t.id}/concluir`); await carregar(); });
  const excluir = (t) => executar(async () => { await chamar('DELETE', `/api/tarefas/${t.id}`); await carregar(); });
  const criarCategoria = (e) => { e.preventDefault(); executar(async () => {
    await chamar('POST', '/api/categorias', { nome: novaCategoria });
    setNovaCategoria(''); await carregar();
  }); };

  return (
    <>
      <h2>Nova tarefa</h2>
      <form onSubmit={criar}>
        <input placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
        <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
          <option value="">Sem categoria</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <button>Adicionar</button>
      </form>
      <form onSubmit={criarCategoria}>
        <input placeholder="Nova categoria" value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)} required />
        <button>Criar categoria</button>
      </form>
      <ul>
        {tarefas.map((t) => (
          <li key={t.id} className={t.concluida ? 'feita' : ''}>
            <span>{t.titulo} {t.categoria_id && <small>({nomeCategoria(t.categoria_id)})</small>}</span>
            <span className="acoes">
              <button onClick={() => concluir(t)}>{t.concluida ? 'Reabrir' : 'Concluir'}</button>
              <button onClick={() => editar(t)}>Editar</button>
              <button onClick={() => excluir(t)}>Excluir</button>
            </span>
          </li>
        ))}
        {!tarefas.length && <li>Nenhuma tarefa ainda.</li>}
      </ul>
    </>
  );
}
