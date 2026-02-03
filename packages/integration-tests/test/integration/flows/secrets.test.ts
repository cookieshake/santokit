import { describe } from 'vitest';
import { testFlow, ensureProject, commandCli } from './dsl.ts';

describe('flow: secrets set/list/delete', () => {
  testFlow('manages secrets',
    ensureProject(),
    commandCli('go run /workspace/packages/cli/cmd/stk/main.go secret set TEST_SECRET secret-value'),
    commandCli('go run /workspace/packages/cli/cmd/stk/main.go secret list'),
    commandCli('go run /workspace/packages/cli/cmd/stk/main.go secret delete TEST_SECRET')
  );
});
