import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

console.log('SUPABASE_URL:', SUPABASE_URL); // Só pra garantir!


describe('Supabase Auth - signup e login', () => {
  it('cria usuário e faz login', async () => {
    const email = `test${Date.now()}@pipefox.dev`;
    const password = 'Teste123!';

    // Cadastro
    const signup = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const signupData = await signup.json();

    expect(signup.status).toBe(200);
    expect(signupData.user).toBeDefined();
    expect(signupData.user.email).toBe(email);

    // Login
    const login = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const loginData = await login.json();

    expect(login.status).toBe(200);
    expect(loginData.access_token).toBeDefined();
    expect(loginData.user.email).toBe(email);
  });
});
