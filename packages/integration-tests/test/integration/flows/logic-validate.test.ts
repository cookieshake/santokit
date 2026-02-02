import { describe, it } from 'vitest';
import { getFlowContext } from './context.ts';

describe('flow: logic validate', () => {
  it('validates logic files', async () => {
    const ctx = getFlowContext();
    await ctx.ensureProjectPrepared();
    await ctx.runCli('go run /workspace/packages/cli/cmd/stk/main.go logic validate', ctx.projectDirContainer);
  }, 60000);
});
