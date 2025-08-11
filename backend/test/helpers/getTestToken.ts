// test/helpers/getTestToken.ts
import 'dotenv/config';         // Carrega variáveis de ambiente (.env/.env.test)
import jwt from 'jsonwebtoken'; // Só precisa importar uma vez

export function getTestToken() {
  const secret = process.env.SUPABASE_JWT_SECRET;          // defina no .env ou .env.test
  const now    = Math.floor(Date.now() / 1000);

  const payload = {
  sub:  'd86b1bdd-2d22-46ef-879b-18e87a2b34a3', // Pode ser qualquer UUID, mas tente usar um válido
  aud:  'authenticated',
  role: 'authenticated',
  email:'test@pipefox.dev',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { email_verified: true },
  iat:  now,
  exp:  now + 60 * 60 * 24 * 7
};


  return jwt.sign(payload, secret, { algorithm: 'HS256' });
}
