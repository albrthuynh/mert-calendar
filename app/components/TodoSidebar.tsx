"use client";

import { format, isSameDay } from "date-fns";
import { X, ListTodo } from "lucide-react";
import { Todo } from "@/types/calendar";
import { TodoItem } from "./TodoItem";
import { TodoFormModal } from "./TodoFormModal";
import { useState } from "react";

interface TodoSidebarProps {
  selectedDay: Date;
  todos: Todo[];
  onClose: () => void;
  onAdd: (todo: Todo) => void;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, title: string) => void;
}

export function TodoSidebar({
  selectedDay,
  todos,
  onClose,
  onAdd,
  onToggle,
  onDelete,
  onEdit,
}: TodoSidebarProps) {
  const [showModal, setShowModal] = useState(false);

  const dayTodos = todos.filter((t) =>
    isSameDay(new Date(t.taskDate), selectedDay)
  );
  const completedCount = dayTodos.filter((t) => t.completed).length;

  return (
    <div className="w-72 shrink-0 border-l border-gray-200 flex flex-col bg-white h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <ListTodo className="w-4 h-4 text-blue-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">
              To-Do List
            </p>
            <p className="text-xs text-gray-400">
              {format(selectedDay, "EEEE, MMMM d")}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 shrink-0"
          aria-label="Close sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Todo list */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {dayTodos.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {/* Progress */}
            {dayTodos.length > 1 && (
              <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{completedCount} of {dayTodos.length} done</span>
                  <span>{Math.round((completedCount / dayTodos.length) * 100)}%</span>
                </div>
                <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{
                      width: `${(completedCount / dayTodos.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
            {dayTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={onToggle}
                onDelete={onDelete}
                onEdit={onEdit}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <p className="text-sm text-gray-400">No tasks for this day</p>
            <p className="text-xs text-gray-300 mt-1">Click below to add one</p>
          </div>
        )}
      </div>

      {/* Add task button */}
      <div className="px-3 py-3 border-t border-gray-100 shrink-0">
        <button
          onClick={() => setShowModal(true)}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-blue-500 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
        >
          + Add Task
        </button>
      </div>

      {showModal && (
        <TodoFormModal
          initialDate={selectedDay}
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
