import type { ShareContent, ShareResult, SharingProviderPlugin } from './types';

// Re-export types for consumers
export type { ShareContent, ShareResult, SharingProviderPlugin };

// Registry of all sharing providers (matches EngineDetector pattern)
const sharingProviders: SharingProviderPlugin[] = [];

/**
 * Register a sharing provider plugin
 */
export function registerSharingProvider(plugin: SharingProviderPlugin): void {
  const existing = sharingProviders.findIndex(
    (p) => p.providerId === plugin.providerId,
  );
  if (existing >= 0) {
    sharingProviders[existing] = plugin; // Update
  } else {
    sharingProviders.push(plugin); // Add new
  }
}

/**
 * Get all registered providers
 */
export function getRegisteredProviders(): SharingProviderPlugin[] {
  return [...sharingProviders];
}

/**
 * Clear all registered providers (for testing only)
 */
export function clearProviders(): void {
  sharingProviders.length = 0;
}

/**
 * Get provider by ID
 */
export function getProviderById(
  providerId: string,
): SharingProviderPlugin | undefined {
  return sharingProviders.find((p) => p.providerId === providerId);
}

/**
 * Share content using a specific provider
 */
export async function shareWith(
  providerId: string,
  content: ShareContent,
): Promise<ShareResult> {
  const provider = getProviderById(providerId);
  if (!provider) {
    throw new Error(`Unknown sharing provider: ${providerId}`);
  }
  return provider.share(content);
}

/**
 * Load shared content from a share URL parameter
 * Format: "provider:shareId" (e.g., "gist:abc123")
 */
export async function loadShared(shareParam: string): Promise<string> {
  const [providerId, shareId] = shareParam.split(':', 2);
  if (!providerId || !shareId) {
    throw new Error(`Invalid share format: ${shareParam}`);
  }

  const provider = getProviderById(providerId);
  if (!provider) {
    throw new Error(`Unknown sharing provider: ${providerId}`);
  }

  return provider.load(shareId);
}
