import { describe, it, expect } from 'vitest';
import { getFlowContext } from './context.ts';

describe('flow: auth login/me/refresh/logout', () => {
  it('performs auth flow', async () => {
    const ctx = getFlowContext();
    const login = await fetch(`${ctx.hubUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'pass' })
    });
    const loginJson = await login.json();
    expect(loginJson.accessToken).toBeDefined();

    const me = await fetch(`${ctx.hubUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${loginJson.accessToken}` }
    });
    expect(me.status).toBe(200);

    const refresh = await fetch(`${ctx.hubUrl}/auth/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${loginJson.accessToken}` }
    });
    const refreshJson = await refresh.json();
    expect(refreshJson.accessToken).toBeDefined();

    const logout = await fetch(`${ctx.hubUrl}/auth/logout`, { method: 'POST' });
    expect(logout.status).toBe(200);
  }, 60000);
});
