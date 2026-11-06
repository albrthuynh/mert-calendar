import { NextRequest } from "next/server";
import { GET } from "@/app/api/todos/route";
import { DELETE } from "@/app/api/todos/[id]/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ prisma: { todo: {
  findMany: jest.fn(), findFirst: jest.fn(), delete: jest.fn(),
} } }));

const todo = { id: "todo-1", title: "Homework", userId: "todo-delete-user" };

function listTodos() {
  return GET(new NextRequest("http://localhost/api/todos?start=2026-11-01&end=2026-11-08"));
}

beforeEach(() => {
  jest.clearAllMocks();
  (auth as jest.Mock).mockResolvedValue({ user: { id: todo.userId } });
  (prisma.todo.findMany as jest.Mock).mockResolvedValue([todo]);
  (prisma.todo.findFirst as jest.Mock).mockResolvedValue(todo);
  (prisma.todo.delete as jest.Mock).mockResolvedValue(todo);
});

it("does not restore a todo deleted by another server instance", async () => {
  expect(await (await listTodos()).json()).toEqual([todo]);
  // A different instance updates the database without touching this process's cache.
  (prisma.todo.findMany as jest.Mock).mockResolvedValue([]);
  const response = await listTodos();
  expect(await response.json()).toEqual([]);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

it("deletes only a todo belonging to the authenticated user", async () => {
  const response = await DELETE(new NextRequest("http://localhost/api/todos/todo-1", { method: "DELETE" }), {
    params: Promise.resolve({ id: todo.id }),
  });
  expect(response.status).toBe(200);
  expect(prisma.todo.findFirst).toHaveBeenCalledWith({ where: { id: todo.id, userId: todo.userId } });
  expect(prisma.todo.delete).toHaveBeenCalledWith({ where: { id: todo.id } });
});

it("rejects unauthenticated deletes and todos the user does not own", async () => {
  const request = new NextRequest("http://localhost/api/todos/todo-1", { method: "DELETE" });
  const context = { params: Promise.resolve({ id: todo.id }) };
  (auth as jest.Mock).mockResolvedValueOnce(null);
  expect((await DELETE(request, context)).status).toBe(401);
  (prisma.todo.findFirst as jest.Mock).mockResolvedValueOnce(null);
  expect((await DELETE(request, context)).status).toBe(404);
  expect(prisma.todo.delete).not.toHaveBeenCalled();
});
