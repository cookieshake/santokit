import { describe, it } from 'vitest';
import { getFlowContext } from './context.ts';

describe('flow: secrets set/list/delete', () => {
  it('manages secrets', async () => {
    const ctx = getFlowContext();
    await ctx.ensureProjectPrepared();
    await ctx.runCli('go run /workspace/packages/cli/cmd/stk/main.go secret set TEST_SECRET secret-value', ctx.projectDirContainer);
    await ctx.runCli('go run /workspace/packages/cli/cmd/stk/main.go secret list', ctx.projectDirContainer);
    await ctx.runCli('go run /workspace/packages/cli/cmd/stk/main.go secret delete TEST_SECRET', ctx.projectDirContainer);
  }, 60000);
});
