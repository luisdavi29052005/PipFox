// test/api.spec.ts
import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestToken } from './helpers/getTestToken';
const API = 'http://localhost:5000/api';

let token: string;
let accountId: string;

beforeAll(() => { token = getTestToken(); });

describe('Accounts', () => {
  it('create account', async () => {
    const { body } = await request(API)
      .post('/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Vitest Account' })
      .expect(200);

    accountId = body.id;
    expect(body.status).toBe('not_ready');
  });
});
