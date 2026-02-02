import { describe, it } from 'vitest';
import { getFlowContext } from './context.ts';

describe('flow: schema plan/apply', () => {
  it('plans and applies schema', async () => {
    const ctx = getFlowContext();
    await ctx.ensureProjectPrepared();
    await ctx.runCli('go run /workspace/packages/cli/cmd/stk/main.go schema plan', ctx.projectDirContainer);
    await ctx.runCli('go run /workspace/packages/cli/cmd/stk/main.go schema apply -y', ctx.projectDirContainer);
  }, 60000);
});
