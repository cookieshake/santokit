import { describe, it, expect } from 'vitest';
import { getFlowContext } from './context.ts';

describe('flow: runtime call (/call)', () => {
  it('executes logic via /call', async () => {
    const ctx = getFlowContext();
    await ctx.ensureLogicApplied();
    const response = await fetch(`${ctx.apiUrl}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'echo/ping', params: { message: 'hello' } })
    });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.echo).toBe('hello');
  }, 60000);
});
