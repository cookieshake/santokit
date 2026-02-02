import { describe, it, expect } from 'vitest';
import { getFlowContext } from './context.ts';

describe('flow: storage presign + delete', () => {
  it('returns presigned urls and deletes', async () => {
    const ctx = getFlowContext();
    await ctx.ensureLogicApplied();

    const presign = await fetch(`${ctx.apiUrl}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'storage/presign', params: {} })
    });
    const presignJson = await presign.json();
    expect(presignJson.uploadUrl).toContain('X-Amz-Algorithm');
    expect(presignJson.downloadUrl).toContain('X-Amz-Algorithm');

    const deleted = await fetch(`${ctx.apiUrl}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'storage/delete', params: {} })
    });
    const deletedJson = await deleted.json();
    expect(deletedJson.deleted).toBe(true);
  }, 60000);
});
