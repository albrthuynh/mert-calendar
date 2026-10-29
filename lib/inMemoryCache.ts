import { BoundedCache } from "./boundedCache";
export type CacheScope = "events" | "todos" | "importantDays";

type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

type InMemoryCacheStore = {
  entries: BoundedCache<CacheEntry>;
  versions: BoundedCache<number>;
  nextVersion: number;
};

declare global {
  var __calendarBoundedCacheStoreV2: InMemoryCacheStore | undefined;
}

const cacheStore: InMemoryCacheStore = globalThis.__calendarBoundedCacheStoreV2 ?? {
  entries: new BoundedCache<CacheEntry>(512),
  versions: new BoundedCache<number>(1024),
  nextVersion: 0,
};

if (!globalThis.__calendarBoundedCacheStoreV2) {
  globalThis.__calendarBoundedCacheStoreV2 = cacheStore;
}

function getVersionKey(scope: CacheScope, userId: string) {
  return `${scope}:${userId}`;
}

export function getUserDataVersion(scope: CacheScope, userId: string): number {
  return cacheStore.versions.get(getVersionKey(scope, userId)) ?? bumpUserDataVersion(scope, userId);
}

export function bumpUserDataVersion(scope: CacheScope, userId: string): number {
  // Never reuse a generation after its entry is evicted.
  const nextVersion = ++cacheStore.nextVersion;
  cacheStore.versions.set(getVersionKey(scope, userId), nextVersion, 24 * 60 * 60 * 1000);
  return nextVersion;
}

export function readInMemoryCache<T>(key: string): T | undefined {
  const entry = cacheStore.entries.get(key);
  if (!entry) return undefined;

  if (entry.expiresAt <= Date.now()) {
    cacheStore.entries.delete(key);
    return undefined;
  }

  return entry.value as T;
}

export function writeInMemoryCache(key: string, value: unknown, ttlMs: number): void {
  cacheStore.entries.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1, ttlMs),
  }, ttlMs);
}

const pendingLoads = new Map<string, Promise<unknown>>();

export async function getOrSetInMemoryCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const cached = readInMemoryCache<T>(key);
  if (cached !== undefined) {
    return cached;
  }

  const pendingLoad = pendingLoads.get(key);
  if (pendingLoad) return pendingLoad as Promise<T>;

  const request = Promise.resolve().then(loader).then((freshValue) => {
    writeInMemoryCache(key, freshValue, ttlMs);
    return freshValue;
  }).finally(() => {
    pendingLoads.delete(key);
  });
  pendingLoads.set(key, request);
  return request;
}
