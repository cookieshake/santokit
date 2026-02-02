import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { getFlowContext } from './context.ts';

describe('flow: client sdk call', () => {
  it('calls logic via SDK from client container', async () => {
    const ctx = getFlowContext();
    await ctx.ensureLogicApplied();
    const execResult = await ctx.execInClient(
      `cd /workspace && API_URL=${ctx.apiUrlInternal} tsx ${path.join(ctx.scriptsRootContainer, 'client-call.ts')}`
    );
    expect(execResult.exitCode).toBe(0);
    expect(execResult.output.trim()).toContain('"echo":"hello"');
  }, 60000);
});
