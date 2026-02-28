"use client";

import { useState, useCallback } from "react";
import { isSameDay, format } from "date-fns";
import { Plus, ChevronDown, ChevronUp } from "lucide-react";
import { Todo } from "@/types/calendar";
import { TodoItem } from "./TodoItem";
import { TodoFormModal } from "./TodoFormModal";

interface TodoSectionProps {
  day: Date;
  todos: Todo[];
  onAdd: (todo: Todo) => void;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, title: string) => void;
  onUpdate: (todo: Todo) => void;
  onMoveDay: (id: string, day: Date) => void;
}

const TODO_COLLAPSED_STORAGE_KEY = "albert-calendar-todo-collapsed";

function getStoredCollapsed(day: Date): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(TODO_COLLAPSED_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw) as Record<string, boolean>;
    return data[format(day, "yyyy-MM-dd")] ?? false;
  } catch {
    return false;
  }
}

function setStoredCollapsed(day: Date, collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(TODO_COLLAPSED_STORAGE_KEY);
    const data: Record<string, boolean> = raw ? JSON.parse(raw) : {};
    data[format(day, "yyyy-MM-dd")] = collapsed;
    localStorage.setItem(TODO_COLLAPSED_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function TodoSection({
  day,
  todos,
  onAdd,
  onToggle,
  onDelete,
  onEdit,
  onUpdate,
  onMoveDay,
}: TodoSectionProps) {
  const [collapsed, setCollapsed] = useState(() => getStoredCollapsed(day));
  const [showModal, setShowModal] = useState(false);

  const handleToggleCollapsed = useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      setStoredCollapsed(day, next);
      return next;
    });
  }, [day]);

  const dayTodos = todos.filter((t) => isSameDay(new Date(t.taskDate), day));
  const completedCount = dayTodos.filter((t) => t.completed).length;
  const hasAny = dayTodos.length > 0;

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    onMoveDay(id, day);
  };

  return (
    <div
      className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 w-full overflow-x-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Section header */}
      <div className="flex items-center px-1 py-0.5 gap-1">
        {hasAny && (
          <button
            onClick={handleToggleCollapsed}
            className="p-0.5 rounded text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label={collapsed ? "Expand todos" : "Collapse todos"}
          >
            {collapsed ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronUp className="w-3 h-3" />
            )}
          </button>
        )}
        {hasAny && (
          <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
            {completedCount}/{dayTodos.length}
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setShowModal(true)}
          className="p-0.5 rounded text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors"
          aria-label="Add to-do"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Todo list */}
      {!collapsed && hasAny && (
        <div className="px-1 pb-1 flex flex-col gap-0.5 max-h-36 overflow-y-auto overflow-x-hidden w-full">
          {dayTodos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={onToggle}
              onDelete={onDelete}
              onEdit={onEdit}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}

      {showModal && (
        <TodoFormModal
          initialDate={day}
          onClose={() => setShowModal(false)}
          onSave={(saved) => {
            onAdd(saved);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}
