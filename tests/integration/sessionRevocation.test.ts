import { POST } from "@/app/api/user/revoke-sessions/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ prisma: { session: { deleteMany: jest.fn() } } }));

it("revokes only the authenticated user's sessions and denies unauthenticated callers", async () => {
  (auth as jest.Mock).mockResolvedValue({ user: { id: "current-user" } });
  expect((await POST()).status).toBe(200);
  expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "current-user" } });
  (prisma.session.deleteMany as jest.Mock).mockClear();
  (auth as jest.Mock).mockResolvedValue(null);
  expect((await POST()).status).toBe(401);
  expect(prisma.session.deleteMany).not.toHaveBeenCalled();
});
