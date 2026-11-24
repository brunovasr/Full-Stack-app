// Cliente da API REST: anexa o token JWT guardado após o login.
// URL base da API: vazia quando o Express serve o frontend; definida em public/config.js quando a API está em outro domínio.
const BASE = (window.API_URL || '').replace(/\/$/, '');

export async function chamar(metodo, url, corpo) {
  const token = localStorage.getItem('token');
  const resp = await fetch(BASE + url, {
    method: metodo,
    headers: {
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (resp.status === 204) return null;
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(dados.erro || 'Erro na requisição.');
  return dados;
}
