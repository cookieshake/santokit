import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { getFlowContext } from './context.ts';

describe('flow: user fetch call', () => {
  it('calls logic via raw fetch script', async () => {
    const ctx = getFlowContext();
    await ctx.ensureLogicApplied();
    const execResult = await ctx.execInClient(
      `cd /workspace && API_URL=${ctx.apiUrlInternal} tsx ${path.join(ctx.scriptsRootContainer, 'user-fetch.ts')}`
    );
    expect(execResult.exitCode).toBe(0);
    expect(execResult.output.trim()).toContain('"echo":"hello"');
  }, 60000);
});
