import type { ShareContent, ShareResult, SharingProviderPlugin } from '../types';

/**
 * GitHub Gist sharing provider
 * Uses anonymous gists (no auth required)
 */
export const gistProvider: SharingProviderPlugin = {
  providerId: 'gist',
  name: 'GitHub Gist',
  icon: '📝',

  async share(content: ShareContent): Promise<ShareResult> {
    const response = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        public: false, // Secret gist (unlisted)
        files: {
          [content.filename || 'query.sql']: { content: content.sql },
        },
        description: `Shared SQL query from dbxlite${content.tabName ? `: ${content.tabName}` : ''}`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create gist: ${response.statusText}`);
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
