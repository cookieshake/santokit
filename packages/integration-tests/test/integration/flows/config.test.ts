import { describe, it } from 'vitest';
import { getFlowContext } from './context.ts';

describe('flow: config apply', () => {
  it('applies project config', async () => {
    const ctx = getFlowContext();
    await ctx.ensureProjectPrepared();
    await ctx.runCli('go run /workspace/packages/cli/cmd/stk/main.go config apply', ctx.projectDirContainer);
  }, 60000);
});
