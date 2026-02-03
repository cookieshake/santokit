import { describe, expect } from 'vitest';
import { testFlow, ensureLogic, requestApi } from './dsl.ts';

describe('flow: storage presign + delete', () => {
  testFlow('returns presigned urls and deletes',
    ensureLogic(),
    requestApi('POST', '/call', { path: 'storage/presign', params: {} })
      .expectStatus(200)
      .inspectBody((json) => {
        expect(json.uploadUrl).toContain('X-Amz-Algorithm');
        expect(json.downloadUrl).toContain('X-Amz-Algorithm');
      }),

    requestApi('POST', '/call', { path: 'storage/delete', params: {} })
      .expectStatus(200)
      .expectBodyPartial({ deleted: true })
  );
});
