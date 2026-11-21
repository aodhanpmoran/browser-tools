import { beforeEach, expect, it, vi } from 'vitest';

const session: Record<string, unknown> = {};
beforeEach(() => {
  for (const k of Object.keys(session)) delete session[k];
  vi.resetModules();
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      session: {
        get: vi.fn(async (k: string) => {
          const snap = structuredClone({ [k]: session[k] });
          await new Promise((r) => setTimeout(r, 1));
          return snap;
        }),
        set: vi.fn(async (o: Record<string, unknown>) => {
          Object.assign(session, structuredClone(o));
        }),
        remove: vi.fn(async () => {}),
      },
    },
  };
});

it('keeps every hop when appendHop calls race for one tab', async () => {
  const { appendHop, getTrace } = await import('../../src/features/redirect-tracer/chains');
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      appendHop(1, { url: 'u' + i, statusCode: 301, statusLine: '', redirectUrl: 'r' } as never),
    ),
  );
  expect((await getTrace(1)).chain).toHaveLength(10);
});
