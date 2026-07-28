import { afterEach, describe, expect, test, vi } from 'vitest';
import { gistProvider, verifyGithubToken } from '../providers/gist';

function mockFetch(impl: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) => impl(url, init));
}

function jsonResponse(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): Response {
  return {
    ok: (init?.status ?? 200) < 400,
    status: init?.status ?? 200,
    statusText: init?.status === 401 ? 'Unauthorized' : 'OK',
    headers: new Headers(init?.headers ?? {}),
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('gistProvider.share', () => {
  test('rejects when no token is provided', async () => {
    await expect(
      gistProvider.share({ sql: 'SELECT 1' }),
    ).rejects.toThrow(/token/i);
  });

  test('sends an Authorization header when a token is provided', async () => {
    let seenAuth: string | null = null;
    vi.stubGlobal(
      'fetch',
      mockFetch((_url, init) => {
        seenAuth =
          (init?.headers as Record<string, string>)?.Authorization ?? null;
        return jsonResponse({ id: 'abc123' });
      }),
    );
    // Provider builds its URL from window.location.origin
    vi.stubGlobal('window', { location: { origin: 'http://localhost' } });

    const result = await gistProvider.share({
      sql: 'SELECT 1',
      token: 'ghp_test',
    });
    expect(seenAuth).toBe('Bearer ghp_test');
    expect(result.url).toContain('share=gist:abc123');
  });

  test('gives a clear error on 401', async () => {
    vi.stubGlobal('fetch', mockFetch(() => jsonResponse({}, { status: 401 })));
    await expect(
      gistProvider.share({ sql: 'SELECT 1', token: 'bad' }),
    ).rejects.toThrow(/401|gist scope/i);
  });
});

describe('verifyGithubToken', () => {
  test('returns invalid for an empty token without calling the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const check = await verifyGithubToken('   ');
    expect(check.valid).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('classic PAT with gist scope is valid and capable', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(() =>
        jsonResponse(
          { login: 'octocat' },
          { headers: { 'x-oauth-scopes': 'repo, gist' } },
        ),
      ),
    );
    const check = await verifyGithubToken('ghp_ok');
    expect(check.valid).toBe(true);
    expect(check.hasGistScope).toBe(true);
    expect(check.login).toBe('octocat');
  });

  test('valid token missing gist scope is flagged', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(() =>
        jsonResponse(
          { login: 'octocat' },
          { headers: { 'x-oauth-scopes': 'repo' } },
        ),
      ),
    );
    const check = await verifyGithubToken('ghp_noscope');
    expect(check.valid).toBe(true);
    expect(check.hasGistScope).toBe(false);
  });

  test('fine-grained token (no scopes header) is treated as capable', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(() => jsonResponse({ login: 'octocat' })),
    );
    const check = await verifyGithubToken('github_pat_x');
    expect(check.valid).toBe(true);
    expect(check.hasGistScope).toBe(true);
  });

  test('401 marks the token invalid', async () => {
    vi.stubGlobal('fetch', mockFetch(() => jsonResponse({}, { status: 401 })));
    const check = await verifyGithubToken('bad');
    expect(check.valid).toBe(false);
  });
});
