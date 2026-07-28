import type { ShareContent, ShareResult, SharingProviderPlugin } from '../types';

export interface TokenCheck {
  valid: boolean;
  hasGistScope: boolean;
  login?: string;
  message: string;
}

/**
 * Verify a GitHub token by calling `GET /user`. A 200 means the token is
 * valid; the `x-oauth-scopes` header tells us whether it can create gists.
 * Classic PATs list scopes in that header; fine-grained tokens leave it
 * empty, so we treat a valid token with no reported scopes as usable and
 * let the actual gist call surface any permission error.
 */
export async function verifyGithubToken(token: string): Promise<TokenCheck> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { valid: false, hasGistScope: false, message: 'No token provided' };
  }
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${trimmed}` },
    });
    if (!response.ok) {
      return {
        valid: false,
        hasGistScope: false,
        message:
          response.status === 401
            ? 'Invalid or expired token'
            : `GitHub error: ${response.status} ${response.statusText}`,
      };
    }
    const scopesHeader = response.headers.get('x-oauth-scopes');
    const scopes = (scopesHeader ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    // Fine-grained tokens report no classic scopes; assume capable if valid.
    const hasGistScope = scopes.length === 0 || scopes.includes('gist');
    const data = await response.json();
    return {
      valid: true,
      hasGistScope,
      login: data.login,
      message: hasGistScope
        ? `Valid${data.login ? ` (${data.login})` : ''}`
        : 'Token is valid but missing the "gist" scope',
    };
  } catch {
    return {
      valid: false,
      hasGistScope: false,
      message: 'Could not reach GitHub to verify the token',
    };
  }
}

/**
 * GitHub Gist sharing provider.
 *
 * Gist creation requires a GitHub Personal Access Token with the `gist`
 * scope: GitHub removed anonymous gist creation in 2018 (POST without auth
 * now returns 401). Loading an existing gist stays anonymous (public read).
 */
export const gistProvider: SharingProviderPlugin = {
  providerId: 'gist',
  name: 'GitHub Gist',
  icon: '📝',

  async share(content: ShareContent): Promise<ShareResult> {
    if (!content.token) {
      throw new Error(
        'A GitHub token (gist scope) is required to create a gist. Add one in Settings.',
      );
    }
    const response = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${content.token}`,
      },
      body: JSON.stringify({
        public: false, // Secret gist (unlisted)
        files: {
          [content.filename || 'query.sql']: { content: content.sql },
        },
        description: `Shared SQL query from dbxlite${content.tabName ? `: ${content.tabName}` : ''}`,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          'GitHub rejected the token (401). Check that it is valid and has the gist scope.',
        );
      }
      throw new Error(
        `Failed to create gist: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    const shareId = data.id;

    return {
      shareId,
      providerId: 'gist',
      url: `${window.location.origin}?share=gist:${shareId}`,
    };
  },

  async load(shareId: string): Promise<string> {
    const response = await fetch(`https://api.github.com/gists/${shareId}`);

    if (!response.ok) {
      throw new Error(`Failed to load gist: ${response.statusText}`);
    }

    const data = await response.json();
    const firstFile = Object.values(data.files)[0] as any;

    if (!firstFile || !firstFile.content) {
      throw new Error('Gist has no content');
    }

    return firstFile.content;
  },

  async isAvailable(): Promise<boolean> {
    // Check GitHub API rate limit
    try {
      const response = await fetch('https://api.github.com/rate_limit');
      const data = await response.json();
      return data.resources?.core?.remaining > 0;
    } catch {
      return false;
    }
  },
};
