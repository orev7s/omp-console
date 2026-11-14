/**
 * Jest's CommonJS resolver cannot load `@omp-console/protocol`: its package
 * `exports` map only advertises `types` and `import`, and the app test preset
 * does not add a runtime mapping. The client imports its Zod schemas at runtime,
 * so point the bare specifier at the built module for this suite only. The
 * relative path is from this directory to the workspace package dist.
 */
jest.mock(
  '@omp-console/protocol',
  () => require('../../../../../packages/protocol/dist/index.js'),
  { virtual: true },
);

import { ApiError, ApiClient } from '../client';
import { buildUrls } from '../url';

const client = new ApiClient(
  buildUrls({ host: 'vps.example.com', port: 443, mode: 'https_domain' }),
);

type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit?]>;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: FetchMock;
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

function lastCall(): [string, RequestInit?] {
  const calls = fetchMock.mock.calls;
  return calls[calls.length - 1];
}

describe('ApiClient request building', () => {
  it('posts a prompt with a JSON body and bearer auth', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ accepted: true }));

    await expect(client.prompt('tok', 's1', 'hello')).resolves.toEqual({ accepted: true });

    const [url, init] = lastCall();
    expect(url).toBe('https://vps.example.com:443/v1/sessions/s1/prompt');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer tok',
    });
    expect(init?.body).toBe(JSON.stringify({ message: 'hello' }));
  });

  it('posts a follow-up to the follow-up route', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ accepted: true }));

    await client.followUp('tok', 's1', 'next');

    const [url, init] = lastCall();
    expect(url).toBe('https://vps.example.com:443/v1/sessions/s1/follow-up');
    expect(init?.body).toBe(JSON.stringify({ message: 'next' }));
  });

  it('posts a steer to the steer route', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ accepted: true }));

    await client.steer('tok', 's1', 'stop that');

    const [url, init] = lastCall();
    expect(url).toBe('https://vps.example.com:443/v1/sessions/s1/steer');
    expect(init?.body).toBe(JSON.stringify({ message: 'stop that' }));
  });

  it('posts an abort with auth and no body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ aborted: true }));

    await expect(client.abort('tok', 's1')).resolves.toEqual({ aborted: true });

    const [url, init] = lastCall();
    expect(url).toBe('https://vps.example.com:443/v1/sessions/s1/abort');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ authorization: 'Bearer tok' });
    expect(init?.body).toBeUndefined();
  });

  it('encodes the cursor and limit into the messages query', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ messages: [], nextCursor: null }));

    await client.messages('tok', 's1', { cursor: 'a b', limit: 50 });

    const [url] = lastCall();
    expect(url).toBe(
      'https://vps.example.com:443/v1/sessions/s1/messages?cursor=a%20b&limit=50',
    );
  });

  it('omits the query when no message options are given', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ messages: [], nextCursor: null }));

    await client.messages('tok', 's1');

    expect(lastCall()[0]).toBe('https://vps.example.com:443/v1/sessions/s1/messages');
  });

  it('posts the model to the model route', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ accepted: true }));

    await client.setModel('tok', 's1', 'claude-sonnet');

    const [url, init] = lastCall();
    expect(url).toBe('https://vps.example.com:443/v1/sessions/s1/model');
    expect(init?.body).toBe(JSON.stringify({ model: 'claude-sonnet' }));
  });

  it('posts the thinking level to the thinking route', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ accepted: true }));

    await client.setThinking('tok', 's1', 'high');

    const [url, init] = lastCall();
    expect(url).toBe('https://vps.example.com:443/v1/sessions/s1/thinking');
    expect(init?.body).toBe(JSON.stringify({ thinkingLevel: 'high' }));
  });

  it('gets stats with bearer auth', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ stats: { turns: 2 } }));

    await expect(client.stats('tok', 's1')).resolves.toEqual({ stats: { turns: 2 } });

    const [url, init] = lastCall();
    expect(url).toBe('https://vps.example.com:443/v1/sessions/s1/stats');
    expect(init?.headers).toEqual({ authorization: 'Bearer tok' });
  });

  it('never puts the token in the URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ messages: [], nextCursor: null }));

    await client.messages('secret-token', 's1');

    expect(lastCall()[0]).not.toContain('secret-token');
  });
});

describe('ApiClient error mapping', () => {
  it('maps a server error envelope to ApiError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: 'unauthorized', message: 'Bad token.', retryable: false } },
        401,
      ),
    );

    await expect(client.messages('tok', 's1')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'unauthorized',
      message: 'Bad token.',
      status: 401,
      retryable: false,
    });
  });

  it('falls back to a generic error for a non-JSON body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);

    const error = await client.messages('tok', 's1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('internal');
    expect((error as ApiError).retryable).toBe(true);
  });
});
