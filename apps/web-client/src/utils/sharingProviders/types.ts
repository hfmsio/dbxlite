/**
 * Content to be shared
 */
export interface ShareContent {
  sql: string;
  tabName?: string;
  filename?: string;
}

/**
 * Result from a share operation
 */
export interface ShareResult {
  url: string; // Full URL to load: ?share=gist:abc123
  shareId: string; // Provider-specific ID: abc123
  providerId: string; // Provider name: gist
}

/**
 * Plugin interface for sharing providers
 * Each provider implements how to share and load SQL content
 */
export interface SharingProviderPlugin {
  providerId: string; // 'gist', 'pastebin', 'carbon', etc.
  name: string; // Human-readable: 'GitHub Gist'
  icon?: string; // Optional icon/emoji

  /**
   * Share SQL content and return a share ID
   */
  share(content: ShareContent): Promise<ShareResult>;

  /**
   * Load SQL content from a share ID
   */
  load(shareId: string): Promise<string>;

  /**
   * Optional: Check if provider is available (e.g., rate limit check)
   */
  isAvailable?(): Promise<boolean>;
}
