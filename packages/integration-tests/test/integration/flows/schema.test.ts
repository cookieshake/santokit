import { describe } from 'vitest';
import { testFlow, ensureProject, commandCli } from './dsl.ts';

describe('flow: schema plan/apply', () => {
  testFlow('plans and applies schema',
    ensureProject(),
    commandCli('stk schema plan'),
    commandCli('stk schema apply -y')
  );
});
