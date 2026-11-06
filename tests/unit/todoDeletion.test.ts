/** @jest-environment jsdom */
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { TodoItem } from "@/app/components/TodoItem";
import { deleteTodo, fetchTodosForRange, invalidateCalendarDataCache } from "@/lib/calendarDataCache";
import type { Todo } from "@/types/calendar";

jest.mock("@/app/components/TodoFormModal", () => ({ TodoFormModal: () => null }));

const todo: Todo = {
  id: "todo-1", title: "Homework", description: null, taskDate: "2026-11-05T00:00:00Z",
  dueDate: null, completed: false, order: 0,
};

function TodoList() {
  const [todos, setTodos] = useState([todo]);
  return createElement("div", null, todos.map((item) => createElement(TodoItem, {
    key: item.id, todo: item, onToggle: jest.fn(), onEdit: jest.fn(), onUpdate: jest.fn(),
    onDelete: async (id: string) => {
      await deleteTodo(id);
      setTodos((currentTodos) => currentTodos.filter((currentTodo) => currentTodo.id !== id));
    },
  })));
}

describe("to-do deletion", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let fetchMock: jest.Mock;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    invalidateCalendarDataCache();
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root.render(createElement(TodoList)));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
  });

  it("waits for confirmation and clears cached lists after deleting", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [todo] });
    await fetchTodosForRange("start", "end");
    let finishDelete!: (response: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { finishDelete = resolve; }));
    const deleteButton = container.querySelector<HTMLButtonElement>('[aria-label="Delete to-do"]')!;
    await act(async () => deleteButton.click());
    expect(deleteButton.disabled).toBe(true);
    expect(container.textContent).toContain(todo.title);
    await act(async () => finishDelete({ ok: true, status: 200 }));
    expect(container.textContent).not.toContain(todo.title);
    expect(fetchMock).toHaveBeenCalledWith("/api/todos/todo-1", { method: "DELETE" });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    expect(await fetchTodosForRange("start", "end")).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([401, 429, 500])("keeps the item and shows the server error on HTTP %s", async (status) => {
    fetchMock.mockResolvedValue({ ok: false, status, json: async () => ({ error: "Please try again" }) });
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Delete to-do"]')!.click());
    expect(container.textContent).toContain(todo.title);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Please try again");
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Delete to-do"]')!.disabled).toBe(false);
  });

  it("allows retrying a network failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network unavailable"));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Delete to-do"]')!.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Network unavailable");
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Delete to-do"]')!.click());
    expect(container.textContent).not.toContain(todo.title);
  });

  it("removes an item that was already deleted elsewhere", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Delete to-do"]')!.click());
    expect(container.textContent).not.toContain(todo.title);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
