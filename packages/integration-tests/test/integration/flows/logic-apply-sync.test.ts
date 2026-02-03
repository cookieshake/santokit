import { describe } from 'vitest';
import * as path from 'path';
import { testFlow, ensureLogic, commandCli } from './dsl.ts';

describe('flow: logic apply + sync', () => {
  testFlow('applies logic and generates types',
    ensureLogic(),
    commandCli('stk sync'),
    commandCli(ctx => `test -f ${path.join(ctx.projectDirContainer, '.stk', 'santokit-env.d.ts')}`)
  );
});
