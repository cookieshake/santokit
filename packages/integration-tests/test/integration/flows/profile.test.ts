import { describe } from 'vitest';
import { testFlow, commandCli } from './dsl.ts';

describe('flow: profile & project context', () => {
  testFlow('configures profile and project',
    commandCli('go run /workspace/packages/cli/cmd/stk/main.go profile set test --hub-url http://hub:8080 --project-id default --token test-token'),
    commandCli('go run /workspace/packages/cli/cmd/stk/main.go profile use test'),
    commandCli('go run /workspace/packages/cli/cmd/stk/main.go project set default')
  );
});
