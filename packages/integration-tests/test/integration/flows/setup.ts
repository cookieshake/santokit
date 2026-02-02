import { beforeAll, afterAll } from 'vitest';
import { startFlowContext } from './global-setup';

type FlowState = {
  promise: Promise<void> | null;
  cleanup: (() => Promise<void>) | null;
  refCount: number;
};

const state: FlowState = ((globalThis as any).__FLOW_STATE__ ??= {
  promise: null,
  cleanup: null,
  refCount: 0,
});

beforeAll(async () => {
  state.refCount += 1;
  if (!state.promise) {
    state.promise = startFlowContext().then(({ ctx, cleanup }) => {
      state.cleanup = cleanup;
      (globalThis as any).__FLOW_CTX__ = ctx;
    });
  }

  await state.promise;
});

afterAll(async () => {
  state.refCount -= 1;
  if (state.refCount <= 0 && state.cleanup) {
    await state.cleanup();
    state.cleanup = null;
    state.promise = null;
    (globalThis as any).__FLOW_CTX__ = undefined;
  }
});
