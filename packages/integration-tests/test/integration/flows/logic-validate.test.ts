import { describe } from 'vitest';
import { testFlow, ensureProject, commandCli } from './dsl.ts';

describe('flow: logic validate', () => {
  testFlow('validates logic files',
    ensureProject(),
    commandCli('stk logic validate')
  );
});
