import { useEffect, useState } from 'react';
import { chamar } from './api.js';
import Autenticacao from './Autenticacao.jsx';
import Tarefas from './Tarefas.jsx';
import Admin from './Admin.jsx';

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(Boolean(localStorage.getItem('token')));
  const [erro, setErro] = useState('');

  // Restaura a sessão a partir do token salvo.
  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    chamar('GET', '/api/auth/eu')
      .then(setUsuario)
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setCarregando(false));
  }, []);

  const sair = () => { localStorage.removeItem('token'); setUsuario(null); };

  if (carregando) return <p>Carregando...</p>;
  if (!usuario) return <Autenticacao aoEntrar={setUsuario} />;

  return (
    <>
      <div className="topo">
        <h1>Gerenciador de Tarefas</h1>
        <span>{usuario.nome} ({usuario.papel}) <button onClick={sair}>Sair</button></span>
      </div>
      {erro && <p className="erro">{erro}</p>}
      <Tarefas aoErro={setErro} />
      {usuario.papel === 'admin' && <Admin eu={usuario} aoErro={setErro} />}
    </>
  );
}
