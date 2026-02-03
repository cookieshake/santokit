import { describe, expect } from 'vitest';
import { testFlow, requestHub } from './dsl.ts';

describe('flow: auth login/me/refresh/logout', () => {
  testFlow('performs auth flow',
    requestHub('POST', '/auth/login', { email: 'test@example.com', password: 'pass' })
      .as('login')
      .expectBodyPartial({ accessToken: expect.any(String) }),

    requestHub('GET', '/auth/me')
      .withBearerToken(store => store.login.accessToken)
      .expectStatus(200),

    requestHub('POST', '/auth/refresh')
      .withBearerToken(store => store.login.accessToken)
      .as('refresh')
      .expectBodyPartial({ accessToken: expect.any(String) }),

    requestHub('POST', '/auth/logout')
      .expectStatus(200)
  );
});
