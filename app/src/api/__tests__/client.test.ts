// jest.mock calls below are hoisted above these imports by babel-jest.
import { getAccessToken } from '@/lib/supabase';

import { ApiError, aiRequest } from '../client';

jest.mock('@/lib/env', () => ({
  env: { aiUrl: 'https://ai.example.test', supabaseUrl: '', supabaseAnonKey: '' },
  useAiMocks: false,
  hasSupabase: false,
}));
jest.mock('@/lib/supabase', () => ({ getAccessToken: jest.fn() }));

const mockToken = getAccessToken as jest.MockedFunction<typeof getAccessToken>;
const fetchMock = jest.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

const json = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

const get = (timeoutMs = 1000) =>
  aiRequest<unknown>({ method: 'GET', path: '/foods/search', query: { q: 'egg' }, timeoutMs });

beforeEach(() => {
  fetchMock.mockReset();
  mockToken.mockResolvedValue('tok123');
});

it('sends the Supabase token and query string', async () => {
  fetchMock.mockResolvedValue(json(200, []));
  await get();
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe('https://ai.example.test/foods/search?q=egg');
  expect(init.headers.Authorization).toBe('Bearer tok123');
});

it('refuses to call without a session', async () => {
  mockToken.mockResolvedValue(null);
  await expect(get()).rejects.toMatchObject({ kind: 'unauthenticated' });
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each<[number, string, boolean]>([
  [401, 'unauthenticated', false],
  [429, 'rate_limited', false],
  [415, 'bad_request', false],
  [503, 'server', true],
])('maps HTTP %i to %s (retryable=%s)', async (status, kind, retryable) => {
  fetchMock.mockResolvedValue(json(status, { detail: 'x' }));
  const err = (await get().catch((e) => e)) as ApiError;
  expect(err).toBeInstanceOf(ApiError);
  expect(err.kind).toBe(kind);
  expect(err.retryable).toBe(retryable);
});

it('maps a thrown fetch to a retryable network error', async () => {
  fetchMock.mockRejectedValue(new TypeError('Network request failed'));
  await expect(get()).rejects.toMatchObject({ kind: 'network', retryable: true });
});

it('times out slow requests', async () => {
  fetchMock.mockImplementation(
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) =>
        init.signal!.addEventListener('abort', () => reject(new Error('aborted'))),
      ),
  );
  await expect(get(20)).rejects.toMatchObject({ kind: 'timeout' });
});

it('sends JSON bodies with a content type', async () => {
  fetchMock.mockResolvedValue(json(200, { items: [], warnings: [] }));
  await aiRequest({ method: 'POST', path: '/meal/text', body: { text: 'eggs' }, timeoutMs: 1000 });
  const [, init] = fetchMock.mock.calls[0]!;
  expect(init.headers['Content-Type']).toBe('application/json');
  expect(init.body).toBe('{"text":"eggs"}');
});
