import { describe } from 'vitest';
import * as path from 'path';
import { testFlow, ensureLogic, execInClient } from './dsl.ts';

describe('flow: client sdk call', () => {
  testFlow('calls logic via SDK from client container',
    ensureLogic(),
    execInClient(ctx => `cd /workspace && API_URL=${ctx.apiUrlInternal} tsx ${path.join(ctx.scriptsRootContainer, 'client-call.ts')}`)
      .expectOutput('"echo":"hello"')
  );
});
