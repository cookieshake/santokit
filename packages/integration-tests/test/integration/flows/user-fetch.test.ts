import { describe } from 'vitest';
import * as path from 'path';
import { testFlow, ensureLogic, execInClient } from './dsl.ts';

describe('flow: user fetch call', () => {
  testFlow('calls logic via raw fetch script',
    ensureLogic(),
    execInClient(ctx => `cd /workspace && API_URL=${ctx.apiUrlInternal} tsx ${path.join(ctx.scriptsRootContainer, 'user-fetch.ts')}`)
      .expectOutput('"echo":"hello"')
  );
});
