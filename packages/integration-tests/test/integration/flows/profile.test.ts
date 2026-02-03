import { describe } from 'vitest';
import { testFlow, commandCli } from './dsl.ts';

describe('flow: profile & project context', () => {
  testFlow('configures profile and project',
    commandCli('stk profile set test --hub-url http://hub:8080 --project-id default --token test-token'),
    commandCli('stk profile use test'),
    commandCli('stk project set default')
  );
});
