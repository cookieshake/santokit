import { describe } from 'vitest';
import * as path from 'path';
import { testFlow, ensureProject, commandCli } from './dsl.ts';

describe('flow: init', () => {
  testFlow('initializes project structure',
    ensureProject(),
    ensureProject(),
    commandCli(ctx => `test -d ${path.join(ctx.projectDirContainer, '.stk')}`),
    commandCli(ctx => `test -f ${path.join(ctx.projectDirContainer, 'stk.config.json')}`)
  );
});
