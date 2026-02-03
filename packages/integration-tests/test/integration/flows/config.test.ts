import { describe } from 'vitest';
import { testFlow, ensureProject, commandCli } from './dsl.ts';

describe('flow: config apply', () => {
  testFlow('applies project config',
    ensureProject(),
    commandCli('go run /workspace/packages/cli/cmd/stk/main.go config apply')
  );
});
