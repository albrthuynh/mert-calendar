export type CacheScope = "events" | "todos" | "importantDays";

type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

type InMemoryCacheStore = {
  entries: Map<string, CacheEntry>;
  versions: Map<string, number>;
};

declare global {
  var __mertInMemoryCacheStore: InMemoryCacheStore | undefined;
}

const cacheStore: InMemoryCacheStore = globalThis.__mertInMemoryCacheStore ?? {
  entries: new Map<string, CacheEntry>(),
  versions: new Map<string, number>(),
};

if (!globalThis.__mertInMemoryCacheStore) {
  globalThis.__mertInMemoryCacheStore = cacheStore;
}

function getVersionKey(scope: CacheScope, userId: string) {
  return `${scope}:${userId}`;
}

export function getUserDataVersion(scope: CacheScope, userId: string): number {
  return cacheStore.versions.get(getVersionKey(scope, userId)) ?? 0;
}

export function bumpUserDataVersion(scope: CacheScope, userId: string): number {
  const nextVersion = getUserDataVersion(scope, userId) + 1;
  cacheStore.versions.set(getVersionKey(scope, userId), nextVersion);
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
  });
}

export async function getOrSetInMemoryCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const cached = readInMemoryCache<T>(key);
  if (cached !== undefined) {
    return cached;
  }

  const freshValue = await loader();
  writeInMemoryCache(key, freshValue, ttlMs);
  return freshValue;
}
