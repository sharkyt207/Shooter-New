import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRemoteConfig } from './remoteConfig';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function respond(body: string, init: { ok?: boolean; contentLength?: string } = {}) {
  const headers = new Headers();
  if (init.contentLength !== undefined) headers.set('content-length', init.contentLength);
  const mock = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: init.ok ?? true,
    headers,
    text: async () => body,
  }));
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe('createRemoteConfig', () => {
  it('makes no request at all when no URL was configured', async () => {
    const mock = respond('{}');
    expect(await createRemoteConfig(null).fetch()).toBeNull();
    expect(mock).not.toHaveBeenCalled();
  });

  it('returns the parsed document', async () => {
    respond('{"version":"2026.1","PLAYER":{"baseSpeed":4.5}}');
    expect(await createRemoteConfig('https://example.test/balance.json').fetch()).toEqual({
      version: '2026.1',
      PLAYER: { baseSpeed: 4.5 },
    });
  });

  it('never sends credentials', async () => {
    const mock = respond('{}');
    await createRemoteConfig('https://example.test/balance.json').fetch();
    expect(mock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'omit' });
  });

  it.each([
    ['a non-OK response', () => respond('{}', { ok: false })],
    ['malformed JSON', () => respond('{oh no')],
    ['an oversized document by header', () => respond('{}', { contentLength: '999999' })],
    [
      'a network failure',
      () => {
        globalThis.fetch = vi.fn(async () => {
          throw new Error('offline');
        }) as unknown as typeof fetch;
      },
    ],
  ])('answers null on %s', async (_label, arrange) => {
    arrange();
    expect(await createRemoteConfig('https://example.test/balance.json').fetch()).toBeNull();
  });

  it('rejects an oversized body even when the header lied', async () => {
    respond(`{"filler":"${'x'.repeat(70_000)}"}`);
    expect(await createRemoteConfig('https://example.test/balance.json').fetch()).toBeNull();
  });
});
