import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getFlowContext } from './context.ts';

describe('flow: logic apply + sync', () => {
  it('applies logic and generates types', async () => {
    const ctx = getFlowContext();
    await ctx.ensureLogicApplied();
    await ctx.runCli('go run /workspace/packages/cli/cmd/stk/main.go sync', ctx.projectDirContainer);
    // Since we are using a docker volume, we must check for file existence inside the container, not locally
    // fs.existsSync(path.join(ctx.projectDir, ...)) will always be false or outdated because the data is in the volume.
    // We can use a simple `test -f` command via `runCli` or similar.
    // If runCli throws on error, we can catch it or rely on it succeeding (exit code 0).
    // `runCli` throws if exit code != 0. `test -f` returns 0 if file exists.
    await ctx.runCli(`test -f ${path.join(ctx.projectDirContainer, '.stk', 'santokit-env.d.ts')}`, ctx.projectDirContainer);

  }, 60000);
});
