import { NextRequest } from "next/server";
import { GET, PUT } from "@/app/api/user/calendar-settings/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: jest.fn(), update: jest.fn() } } }));

function appearanceRequest(body: unknown) {
  return new NextRequest("http://localhost/api/user/calendar-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  (auth as jest.Mock).mockResolvedValue({ user: { id: "current-user" } });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "current-user", calendarColor: "#4285f4" });
  (prisma.user.update as jest.Mock).mockResolvedValue({ calendarColor: "#aabbcc", calendarBackgroundUrl: null, calendarTopLeftUrl: null });
});

it("requires authentication to read or change appearance", async () => {
  (auth as jest.Mock).mockResolvedValue(null);
  expect((await GET()).status).toBe(401);
  expect((await PUT(appearanceRequest({ calendarColor: "#123456" }))).status).toBe(401);
  expect(prisma.user.update).not.toHaveBeenCalled();
});

it("returns the saved calendar color", async () => {
  expect(await (await GET()).json()).toMatchObject({ calendarColor: "#4285f4" });
  expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "current-user" } }));
});

it("only saves to the authenticated account and preserves omitted images", async () => {
  const response = await PUT(appearanceRequest({ calendarColor: "#AABBCC", userId: "another-user" }));
  expect(response.status).toBe(200);
  expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: "current-user" },
    data: { calendarColor: "#aabbcc", calendarBackgroundUrl: undefined, calendarTopLeftUrl: undefined },
  }));
});

it.each([null, [], { calendarColor: "red" }, { backgroundUrl: "javascript:alert(1)" }])("rejects invalid appearance payloads: %j", async (body) => {
  expect((await PUT(appearanceRequest(body))).status).toBe(400);
  expect(prisma.user.update).not.toHaveBeenCalled();
});

it("allows returning to the theme's default calendar color", async () => {
  await PUT(appearanceRequest({ calendarColor: null }));
  expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ calendarColor: null }) }));
});
