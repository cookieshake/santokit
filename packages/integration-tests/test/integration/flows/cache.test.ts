import { describe } from 'vitest';
import { testFlow, requestToHub, ensureLogic } from './dsl.ts';

describe('flow: cache headers', () => {
  testFlow('returns MISS then HIT',
    ensureLogic(),
    requestToHub('POST', '/call', { path: 'cache/ping', params: {} })
      .expectHeader('x-cache-status', 'MISS'),

    requestToHub('POST', '/call', { path: 'cache/ping', params: {} })
      .expectHeader('x-cache-status', 'HIT')
  );
});
