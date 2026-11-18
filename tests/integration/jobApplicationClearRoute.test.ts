import { DELETE } from "@/app/api/job-applications/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: { jobApplication: { deleteMany: jest.fn() } },
}));

describe("clear job applications", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires authentication before deleting applications", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    expect((await DELETE()).status).toBe(401);
    expect(prisma.jobApplication.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes only applications owned by the signed-in user", async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: "applicant-1" } });
    (prisma.jobApplication.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });

    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(prisma.jobApplication.deleteMany).toHaveBeenCalledWith({
      where: { userId: "applicant-1" },
    });
  });
});
