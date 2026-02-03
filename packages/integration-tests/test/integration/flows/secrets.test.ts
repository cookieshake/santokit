import { describe } from 'vitest';
import { testFlow, ensureProject, commandCli } from './dsl.ts';

describe('flow: secrets set/list/delete', () => {
  testFlow('manages secrets',
    ensureProject(),
    commandCli('stk secret set TEST_SECRET secret-value'),
    commandCli('stk secret list'),
    commandCli('stk secret delete TEST_SECRET')
  );
});
