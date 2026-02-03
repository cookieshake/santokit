import { describe } from 'vitest';
import { testFlow, ensureProject, commandCli } from './dsl.ts';

describe('flow: schema plan/apply', () => {
  testFlow('plans and applies schema',
    ensureProject(),
    commandCli('go run /workspace/packages/cli/cmd/stk/main.go schema plan'),
    commandCli('go run /workspace/packages/cli/cmd/stk/main.go schema apply -y')
  );
});
