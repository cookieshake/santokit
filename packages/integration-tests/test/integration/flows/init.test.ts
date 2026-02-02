import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getFlowContext } from './context.ts';

describe('flow: init', () => {
  it('initializes project structure', async () => {
    const ctx = getFlowContext();
    await ctx.ensureProjectPrepared();
    expect(fs.existsSync(path.join(ctx.projectDir, '.stk'))).toBe(true);
    expect(fs.existsSync(path.join(ctx.projectDir, 'stk.config.json'))).toBe(true);
  }, 60000);
});
