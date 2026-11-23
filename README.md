# Aplicação Web na Nuvem — Ambientes de Desenvolvimento de Software

**Aluno:** Bruno Vasconcelos Rocha
**Curso:** Análise e Desenvolvimento de Sistemas — UNIFOR
**Disciplina:** Ambientes de Desenvolvimento de Software

## Aplicação em operação

URL pública: **https://salmon-desert-024b56b10.4.azurestaticapps.net**

Aplicação web simples (Lista de Tarefas) em HTML, CSS e JavaScript, publicada no **Microsoft Azure** pelo serviço **Azure Static Web Apps** (plano gratuito), com implantação contínua a partir deste repositório via GitHub Actions.

## Atividade

1. Criar conta em uma plataforma de computação em nuvem.
2. Selecionar uma aplicação para desenvolvimento de uma aplicação Web.
3. Publicar a URL da aplicação em operação na plataforma.

### 1. Conta criada na plataforma de nuvem

Conta criada no Microsoft Azure, com a assinatura **Azure subscription 1** ativa.

![Assinatura ativa no Azure](docs/img/01-assinatura-azure.png)

### 2. Aplicação selecionada e criada

Foi criado o recurso **app-bruno-unifor** (Aplicativo Web Estático, plano Free), conectado ao branch `main` deste repositório.

![Recurso Static Web App no portal do Azure](docs/img/02-recurso-static-web-app.png)

Repositório no GitHub com o código da aplicação e o fluxo de trabalho gerado pelo Azure:

![Repositório no GitHub](docs/img/03-repositorio-github.png)

### 3. Aplicação em operação na nuvem

Página acessada pela URL pública:

![Aplicação em operação](docs/img/04-aplicacao-em-operacao.png)

Funcionamento — adicionar, concluir e remover tarefas:

![Tarefa adicionada](docs/img/05-tarefa-adicionada.png)

![Tarefa concluída](docs/img/06-tarefa-concluida.png)

![Tarefa removida](docs/img/07-tarefa-removida.png)

## Requisitos atendidos (versão 2.0)

Sistema escolhido: **Controle de Biblioteca** (acervo, empréstimos, devoluções com multa e administração de usuários). Equipe individual (1 pessoa) → mínimo de 6 transações; o sistema possui **10**.

| Requisito | Como foi atendido |
|---|---|
| Trabalho a escolher | Sistema de controle de biblioteca |
| Equipe e transações | 10 transações: cadastrar usuário, login, cadastrar livro, editar livro, excluir livro, emprestar livro, devolver livro (com multa), renovar empréstimo, alterar papel de usuário, excluir usuário |
| Frontend | HTML, CSS, JavaScript e **React** (Vite) em `frontend/` |
| Backend | **Node.js + Express**, Web Service **REST** com rotas em `/api/*` (`backend/src/app.js`) |
| Controle de acesso | **Autenticação** com JWT (senhas com bcrypt) e **autorização** por papel: `leitor` consulta o acervo e gerencia só os próprios empréstimos; `admin` (bibliotecário) gerencia acervo, todos os empréstimos e usuários. O primeiro usuário cadastrado vira admin |
| SGBD | **SQLite** (módulo nativo `node:sqlite`), esquema em `backend/src/db.js` |
| Controle de versão | Git/GitHub, com commits por etapa |
| Testes formais | 16 testes automatizados dos serviços (`node:test` + `supertest`) em `backend/test/` |

### Regras de negócio

- Prazo de empréstimo de 14 dias; uma renovação de 7 dias, não permitida em atraso.
- Limite de 3 empréstimos em aberto por usuário; não é possível pegar dois exemplares do mesmo livro.
- Multa de R$ 1,00 por dia de atraso, calculada na devolução.
- Livro com empréstimo em aberto não pode ser excluído nem ter o total de exemplares reduzido abaixo do emprestado; usuário com empréstimo em aberto não pode ser excluído.

### Rotas da API

| Método | Rota | Acesso |
|---|---|---|
| POST | `/api/auth/registrar`, `/api/auth/login` | público |
| GET | `/api/auth/eu` | autenticado |
| GET | `/api/livros?q=` | autenticado |
| POST | `/api/livros` | admin |
| PUT/DELETE | `/api/livros/:id` | admin |
| GET/POST | `/api/emprestimos` | autenticado (leitor vê só os seus) |
| PATCH | `/api/emprestimos/:id/devolver`, `/renovar` | dono do empréstimo ou admin |
| GET | `/api/admin/usuarios` | admin |
| PATCH | `/api/admin/usuarios/:id/papel` | admin |
| DELETE | `/api/admin/usuarios/:id` | admin |

### Como executar

Requer Node.js 22 ou superior.

```bash
npm run install:tudo   # instala dependências do backend e do frontend
npm test               # executa os testes formais da API
npm run build          # gera o frontend (frontend/dist)
JWT_SECRET=troque-isto npm start   # servidor em http://localhost:3000 (API + React)
```

Para desenvolvimento: `npm --prefix backend start` e, em outro terminal, `npm --prefix frontend run dev`.

Variáveis de ambiente: `PORT`, `JWT_SECRET` (obrigatório em produção) e `DB_FILE` (arquivo SQLite, padrão `biblioteca.sqlite`).

> **Implantação:** o Azure Static Web Apps publica apenas o frontend (`frontend/dist`). A API Node precisa ser hospedada em um serviço de servidor (por exemplo, Azure App Service), pois o Static Web Apps não executa o Express.

## Estrutura do repositório

- `backend/` — API Node/Express, banco SQLite e testes (`backend/test/`)
- `frontend/` — aplicação React (Vite)
- `.github/workflows/` — fluxo de implantação do Azure Static Web Apps
- `docs/img/` — prints da publicação na nuvem (atividade anterior)
