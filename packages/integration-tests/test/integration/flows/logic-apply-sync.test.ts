import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getFlowContext } from './context.ts';

describe('flow: logic apply + sync', () => {
  it('applies logic and generates types', async () => {
    const ctx = getFlowContext();
    await ctx.ensureLogicApplied();
    await ctx.runCli('go run /workspace/packages/cli/cmd/stk/main.go sync', ctx.projectDirContainer);
    expect(fs.existsSync(path.join(ctx.projectDir, '.stk', 'santokit-env.d.ts'))).toBe(true);
  }, 60000);
});
