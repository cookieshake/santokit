import { describe, it } from 'vitest';
import { getFlowContext } from './context.ts';

describe('flow: profile & project context', () => {
  it('configures profile and project', async () => {
    const ctx = getFlowContext();
    await ctx.runCli('go run /workspace/packages/cli/cmd/stk/main.go profile set test --hub-url http://hub:8080 --project-id default --token test-token', '/workspace');
    await ctx.runCli('go run /workspace/packages/cli/cmd/stk/main.go profile use test', '/workspace');
    await ctx.runCli('go run /workspace/packages/cli/cmd/stk/main.go project set default', '/workspace');
  }, 60000);
});
