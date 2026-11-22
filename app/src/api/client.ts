import { env } from '@/lib/env';
import { getAccessToken } from '@/lib/supabase';

export type ApiErrorKind =
  | 'unauthenticated' // no session, or the AI service answered 401
  | 'timeout'
  | 'network' // offline, DNS, service asleep on a free host
  | 'rate_limited' // 429: daily scan cap or Gemini free-tier limit
  | 'bad_request' // 4xx other than 401/429
  | 'server'; // 5xx

export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Worth showing a "Try again" button for. */
  get retryable(): boolean {
    return this.kind === 'timeout' || this.kind === 'network' || this.kind === 'server';
  }
}

/** Photo calls go through Gemini and can be slow; a free host may also be cold-starting. */
export const TIMEOUT_MS = { photo: 45_000, text: 30_000, search: 10_000 } as const;

type RequestOptions = {
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, string>;
  body?: FormData | object;
  timeoutMs: number;
  signal?: AbortSignal;
};

export async function aiRequest<T>(opts: RequestOptions): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new ApiError('unauthenticated', 'Please sign in again.');

  const url = new URL(env.aiUrl + opts.path);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) {
    body = opts.body; // fetch sets the multipart boundary itself
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onOuterAbort);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: opts.method,
      headers,
      body,
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted && !opts.signal?.aborted) {
      throw new ApiError('timeout', 'The request took too long.');
    }
    if (opts.signal?.aborted) throw e; // caller cancelled: let it propagate as-is
    throw new ApiError('network', 'Could not reach the server. Check your connection.');
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onOuterAbort);
  }

  if (!res.ok) throw await errorFromResponse(res);
  return (await res.json()) as T;
}

async function errorFromResponse(res: Response): Promise<ApiError> {
  let detail = '';
  try {
    const data = (await res.json()) as { detail?: unknown };
    if (typeof data.detail === 'string') detail = data.detail;
  } catch {
    // non-JSON error body; fall through to the generic message
  }
  if (res.status === 401) return new ApiError('unauthenticated', 'Please sign in again.', 401);
  if (res.status === 429)
    return new ApiError('rate_limited', detail || "You've reached today's scan limit.", 429);
  if (res.status >= 500)
    return new ApiError('server', 'The server had a problem. Try again.', res.status);
  return new ApiError('bad_request', detail || 'The request was rejected.', res.status);
}
