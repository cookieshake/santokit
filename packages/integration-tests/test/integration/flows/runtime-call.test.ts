import { describe } from 'vitest';
import { testFlow, ensureLogic, requestApi } from './dsl.ts';

describe('flow: runtime call (/call)', () => {
  testFlow('executes logic via /call',
    ensureLogic(),
    requestApi('POST', '/call', { path: 'echo/ping', params: { message: 'hello' } })
      .expectStatus(200)
      .expectBodyPartial({ echo: 'hello' })
  );
});
