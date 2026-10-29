import { GET } from "@/app/api/events/version/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncGoogleCalendarForUser } from "@/lib/googleCalendar";
import { bumpUserDataVersion } from "@/lib/inMemoryCache";

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ prisma: {
  user: { findUnique: jest.fn() },
} }));
jest.mock("@/lib/googleCalendar", () => ({ syncGoogleCalendarForUser: jest.fn() }));

describe("event version reads", () => {
  let userId: string;
  let userSequence = 0;

  beforeEach(() => {
    jest.clearAllMocks();
    userId = `version-user-${++userSequence}`;
    (auth as jest.Mock).mockResolvedValue({ user: { id: userId } });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ eventsRevision: BigInt(10) });
    (syncGoogleCalendarForUser as jest.Mock).mockResolvedValue({ changed: false });
  });

  it("reuses reads and sync work within the cache window", async () => {
    const responses = await Promise.all([GET(), GET()]);
    expect(await responses[0].json()).toEqual({ version: "10" });
    await GET();
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(syncGoogleCalendarForUser).toHaveBeenCalledTimes(1);
    expect(responses[0].headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("checks again after mutations and detects deletion of an older event", async () => {
    const previous = await (await GET()).json();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ eventsRevision: BigInt(11) });
    bumpUserDataVersion("events", userId);
    const current = await (await GET()).json();
    expect(current.version).not.toBe(previous.version);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  it("isolates user caches and rejects unauthenticated requests", async () => {
    await GET();
    (auth as jest.Mock).mockResolvedValue({ user: { id: `${userId}-other` } });
    await GET();
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
    (auth as jest.Mock).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });
});
