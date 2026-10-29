export class BoundedCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(private readonly capacity: number) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (entry.expiresAt <= Date.now()) return undefined;
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number) {
    const now = Date.now();
    for (const [existingKey, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(existingKey);
    }
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: now + ttlMs });
    while (this.entries.size > this.capacity) {
      this.entries.delete(this.entries.keys().next().value!);
    }
  }

  delete(key: string) { this.entries.delete(key); }
  clear() { this.entries.clear(); }
  keys() { return this.entries.keys(); }
}
