# Guia: publicar a aplicação na nuvem (caminho mais fácil)

Plataforma sugerida: **Microsoft Azure for Students** + **App Service** (não exige cartão de crédito; basta o e-mail da UNIFOR).

## Parte 1 — Testar no seu computador (opcional, 2 min)
1. Instale o Node.js (versão 22 ou superior, https://nodejs.org).
2. Na pasta do projeto: `npm run install:tudo`, `npm run build` e depois `npm start`.
3. Abra http://localhost:3000 — deve aparecer a tela de login do sistema de biblioteca.

## Parte 2 — Colocar no GitHub
1. Crie um repositório novo (ex.: `app-nuvem-unifor`) na sua conta `brunovasr`.
2. Na pasta do projeto:
   ```
   git init
   git add .
   git commit -m "feat: aplicação web inicial para publicação em nuvem"
   git branch -M main
   git remote add origin https://github.com/brunovasr/app-nuvem-unifor.git
   git push -u origin main
   ```

## Parte 3 — Criar a conta (tarefa 1)
1. Acesse https://azure.microsoft.com/free/students e clique em **Start free**.
2. Entre/cadastre-se com o e-mail institucional da UNIFOR e valide o status de estudante.
3. Tire um print da conta criada (portal.azure.com) — provável item de entrega.

## Parte 4 — Publicar (tarefas 2 e 3)
1. No portal Azure: **Criar um recurso → Aplicação Web (Web App)**.
2. Preencha:
   - Assinatura: *Azure for Students*
   - Grupo de recursos: criar novo (ex.: `rg-app-unifor`)
   - Nome: algo único, ex.: `app-bruno-unifor` (vira a URL `https://app-bruno-unifor.azurewebsites.net`)
   - Publicar: **Código**
   - Pilha de runtime: **Node 20 LTS** (ou o mais recente LTS)
   - Região: Brazil South
   - Plano: **Free F1** (ou B1, se o F1 não estiver disponível)
3. **Revisar + criar → Criar**.
4. Quando terminar, abra o recurso → **Central de Implantação (Deployment Center)**:
   - Origem: **GitHub** → autorize → escolha o repositório e a branch `main` → **Salvar**.
5. Aguarde o deploy (alguns minutos, aba *Logs*).
6. Abra a **URL padrão** do recurso. Se aparecer a tela de login da biblioteca, está em operação.

## Parte 5 — Entrega
Entregue a URL (`https://SEU-NOME.azurewebsites.net`), mais prints da conta e do app funcionando, se o professor pedir.

## Problemas comuns
- Página de erro/"Application Error": veja *Log stream*; confirme que o runtime é Node e que o `package.json` está na raiz do repositório.
- Nome já em uso: troque o nome do Web App.
- Plano F1 indisponível na região: escolha outra região ou o plano B1.
