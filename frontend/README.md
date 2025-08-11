PipeFox Frontend

1. Instalar dependências
npm i

2. Copiar variáveis
cp .env.example .env
edite VITE_API_URL para apontar ao seu backend

3. Rodar
npm run dev

Fluxo
- Tela de Login faz POST /api/auth/login, cookie httpOnly é setado pelo backend
- Botão "Entrar com Google" redireciona para VITE_API_URL + /api/auth/google
- Ao carregar a área /app, fazemos GET /api/auth/me, se 401 volta para /login
