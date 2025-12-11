/**
 * Sharing Providers Index
 * Auto-registers all sharing provider plugins
 *
 * To add a new provider:
 * 1. Create providers/yourprovider.ts
 * 2. Import and register it here
 */

import { registerSharingProvider } from './registry';
import { gistProvider } from './providers/gist';

// Auto-register all built-in providers
registerSharingProvider(gistProvider);

// Re-export providers for direct access
export { gistProvider } from './providers/gist';

// Re-export core types and functions
export {
  registerSharingProvider,
  getRegisteredProviders,
  getProviderById,
  shareWith,
  loadShared,
  type ShareContent,
  type ShareResult,
  type SharingProviderPlugin,
} from './registry';
export type { SharingProviderPlugin as SharingProvider } from './types';
