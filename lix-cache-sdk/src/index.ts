// Main client
export { LixCache } from './client';
export { Collection } from './collection';

// Types
export type {
  LixCacheConfig,
  SetOptions,
  RememberOptions,
  RememberAllOptions,
  RememberAllResult,
  ScanOptions,
  ScanResult,
  CacheStats,
  ClearResult,
  BatchOperation,
  BatchResult,
  HealthResponse,
} from './types';

// Errors
export {
  LixCacheError,
  LixConnectionError,
  LixNotFoundError,
  LixTypeError,
  LixServerError,
  LixTimeoutError,
} from './errors';
