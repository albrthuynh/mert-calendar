import { decryptToken, encryptToken } from "@/lib/security/tokenEncryption";
import { checkGoogleCalendarConnection } from "@/lib/googleCalendar";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    account: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    user: { findUnique: jest.fn() },
    googleCalendarChannel: { findFirst: jest.fn() },
  },
}));

type AccountCredentials = {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  scope: string;
};

describe("Google Calendar connection checks", () => {
  let account: AccountCredentials;
  let fetchMock: jest.SpyInstance;
  const originalClientId = process.env.AUTH_GOOGLE_ID;
  const originalClientSecret = process.env.AUTH_GOOGLE_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TOKEN_ENCRYPTION_KEY = "ab".repeat(32);
    process.env.TOKEN_ENCRYPTION_MODE = "enabled";
    process.env.AUTH_GOOGLE_ID = "test-client";
    process.env.AUTH_GOOGLE_SECRET = "test-secret";
    account = {
      id: "account-1",
      access_token: "old-access-token",
      refresh_token: "refresh-token",
      expires_at: Math.floor(Date.now() / 1000) - 60,
      scope: "https://www.googleapis.com/auth/calendar.events",
    };
    (prisma.account.findFirst as jest.Mock).mockImplementation(async () => ({ ...account }));
    (prisma.account.update as jest.Mock).mockImplementation(async ({ data }) => {
      Object.assign(account, data);
      return account;
    });
    (prisma.account.updateMany as jest.Mock).mockImplementation(async ({ data }) => {
      Object.assign(account, data);
      return { count: 1 };
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      googleCalendarSyncEnabled: true,
      googleCalendarLastSyncedAt: null,
    });
    (prisma.googleCalendarChannel.findFirst as jest.Mock).mockResolvedValue(null);
    fetchMock = jest.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchMock.mockRestore();
    if (originalClientId === undefined) delete process.env.AUTH_GOOGLE_ID;
    else process.env.AUTH_GOOGLE_ID = originalClientId;
    if (originalClientSecret === undefined) delete process.env.AUTH_GOOGLE_SECRET;
    else process.env.AUTH_GOOGLE_SECRET = originalClientSecret;
  });

  it("refreshes an expired token, saves it, and verifies Calendar access", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: "new-access-token", expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({ kind: "calendar#events" }));

    expect(await checkGoogleCalendarConnection("user-1")).toMatchObject({
      connected: true,
      requiresReconnect: false,
      connectionError: null,
    });
    expect(fetchMock.mock.calls[0][0]).toBe("https://oauth2.googleapis.com/token");
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer new-access-token");
    expect(account.access_token).not.toBe("new-access-token");
    expect(decryptToken(account.access_token!, "user-1:access_token")).toBe("new-access-token");
    expect(decryptToken(account.refresh_token!, "user-1:refresh_token")).toBe("refresh-token");
    expect(account.expires_at).toBeGreaterThan(Date.now() / 1000);
  });

  it("detects revoked access even when the stored token has not expired", async () => {
    account.expires_at = Math.floor(Date.now() / 1000) + 3600;
    fetchMock
      .mockResolvedValueOnce(Response.json({}, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ error: "invalid_grant" }, { status: 400 }));

    expect(await checkGoogleCalendarConnection("user-1")).toMatchObject({
      requiresReconnect: true,
      connectionError: expect.stringContaining("Reconnect Google Calendar"),
    });
    expect(prisma.account.updateMany).toHaveBeenCalledWith({
      where: { id: "account-1", refresh_token: "refresh-token" },
      data: { access_token: null, refresh_token: null, expires_at: null },
    });
    expect(await checkGoogleCalendarConnection("user-1")).toMatchObject({ requiresReconnect: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("compares the stored ciphertext when clearing revoked credentials", async () => {
    const ciphertext = encryptToken("refresh-token", "user-1:refresh_token");
    account.refresh_token = ciphertext;
    fetchMock.mockResolvedValueOnce(Response.json({ error: "invalid_grant" }, { status: 400 }));
    expect(await checkGoogleCalendarConnection("user-1")).toMatchObject({ requiresReconnect: true });
    expect(prisma.account.updateMany).toHaveBeenCalledWith({
      where: { id: "account-1", refresh_token: ciphertext },
      data: { access_token: null, refresh_token: null, expires_at: null },
    });
  });

  it("does not overwrite a concurrent reconnection after refreshing", async () => {
    (prisma.account.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
    fetchMock.mockResolvedValueOnce(Response.json({ access_token: "stale-refresh-result", expires_in: 3600 }));
    await expect(checkGoogleCalendarConnection("user-1")).rejects.toMatchObject({ status: 409 });
    expect(account.access_token).toBe("old-access-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requests reconnection when expired credentials have no refresh token", async () => {
    account.refresh_token = null;
    expect(await checkGoogleCalendarConnection("user-1")).toMatchObject({ requiresReconnect: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps credentials on temporary Google failures", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "temporarily_unavailable" }, { status: 503 }));
    await expect(checkGoogleCalendarConnection("user-1")).rejects.toMatchObject({
      status: 503,
      requiresReconnect: false,
    });
    expect(prisma.account.updateMany).not.toHaveBeenCalled();
    expect(decryptToken(account.refresh_token!, "user-1:refresh_token")).toBe("refresh-token");
  });

  it("retries a rejected access token once with a fresh token", async () => {
    account.expires_at = Math.floor(Date.now() / 1000) + 3600;
    fetchMock
      .mockResolvedValueOnce(Response.json({}, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ access_token: "new-access-token", expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({ kind: "calendar#events" }));
    expect(await checkGoogleCalendarConnection("user-1")).toMatchObject({ requiresReconnect: false });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not loop when Google also rejects the refreshed token", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: "new-access-token", expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({}, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ access_token: "another-access-token", expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({}, { status: 401 }));
    expect(await checkGoogleCalendarConnection("user-1")).toMatchObject({ requiresReconnect: true });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not call Calendar before consent is granted", async () => {
    account.scope = "openid email profile";
    expect(await checkGoogleCalendarConnection("user-1")).toMatchObject({ hasCalendarScope: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
