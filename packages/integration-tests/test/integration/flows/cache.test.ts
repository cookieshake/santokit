import { describe, it, expect } from 'vitest';
import { getFlowContext } from './context.ts';

describe('flow: cache headers', () => {
  it('returns MISS then HIT', async () => {
    const ctx = getFlowContext();
    await ctx.ensureLogicApplied();

    const first = await fetch(`${ctx.apiUrl}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'cache/ping', params: {} })
    });
    expect(first.headers.get('x-cache-status')).toBe('MISS');

    const second = await fetch(`${ctx.apiUrl}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'cache/ping', params: {} })
    });
    expect(second.headers.get('x-cache-status')).toBe('HIT');
  }, 60000);
});
