import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getFlowContext } from './context.ts';

describe('flow: init', () => {
  it('initializes project structure', async () => {
    const ctx = getFlowContext();
    await ctx.ensureProjectPrepared();
    await ctx.ensureProjectPrepared();
    await ctx.runCli(`test -d ${path.join(ctx.projectDirContainer, '.stk')}`, ctx.projectDirContainer);
    await ctx.runCli(`test -f ${path.join(ctx.projectDirContainer, 'stk.config.json')}`, ctx.projectDirContainer);

  }, 60000);
});
