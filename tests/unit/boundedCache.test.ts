import { BoundedCache } from "@/lib/boundedCache";

describe("bounded cache", () => {
  it("evicts the least recently read entry", () => {
    const cache = new BoundedCache<number>(2);
    cache.set("first", 1, 10000);
    cache.set("second", 2, 10000);
    expect(cache.get("first")).toBe(1);
    cache.set("third", 3, 10000);
    expect(cache.get("second")).toBeUndefined();
    expect(cache.get("first")).toBe(1);
  });

  it("removes expired entries when another key is written", () => {
    jest.useFakeTimers();
    try {
      const cache = new BoundedCache<number>(2);
      cache.set("expired", 1, 100);
      jest.advanceTimersByTime(101);
      cache.set("fresh", 2, 100);
      expect([...cache.keys()]).toEqual(["fresh"]);
    } finally { jest.useRealTimers(); }
  });
});
