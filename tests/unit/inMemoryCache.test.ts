import { bumpUserDataVersion, getOrSetInMemoryCache, getUserDataVersion } from "@/lib/inMemoryCache";

describe("server read cache", () => {
  it("shares concurrent loads for the same key and respects expiry", async () => {
    jest.useFakeTimers();
    try {
      const loader = jest.fn().mockResolvedValue("events");
      expect(await Promise.all([
        getOrSetInMemoryCache("concurrent-test", 1000, loader),
        getOrSetInMemoryCache("concurrent-test", 1000, loader),
      ])).toEqual(["events", "events"]);
      expect(loader).toHaveBeenCalledTimes(1);
      await getOrSetInMemoryCache("concurrent-test", 1000, loader);
      expect(loader).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(1001);
      await getOrSetInMemoryCache("concurrent-test", 1000, loader);
      expect(loader).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("retries failed loads rather than caching errors", async () => {
    const loader = jest.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("recovered");
    await expect(getOrSetInMemoryCache("failure-test", 1000, loader)).rejects.toThrow("offline");
    await expect(getOrSetInMemoryCache("failure-test", 1000, loader)).resolves.toBe("recovered");
  });

  it("keeps users and mutation versions separate", async () => {
    const loader = jest.fn().mockResolvedValue("events");
    const key = () => `version-test:${getUserDataVersion("events", "cache-user")}`;
    await getOrSetInMemoryCache(key(), 1000, loader);
    bumpUserDataVersion("events", "other-cache-user");
    await getOrSetInMemoryCache(key(), 1000, loader);
    expect(loader).toHaveBeenCalledTimes(1);
    bumpUserDataVersion("events", "cache-user");
    await getOrSetInMemoryCache(key(), 1000, loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
