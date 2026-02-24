"use client";

import { useState, useRef, useEffect } from "react";
import { format, isPast, isToday } from "date-fns";
import { Trash2, Clock, Pencil } from "lucide-react";
import { Todo } from "@/types/calendar";
import { TodoFormModal } from "./TodoFormModal";

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, title: string) => void;
  variant?: "embedded" | "sidebar";
  onUpdate: (todo: Todo) => void;
}

export function TodoItem({
  todo,
  onToggle,
  onDelete,
  onEdit,
  variant = "embedded",
  onUpdate,
}: TodoItemProps) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const dueDate = todo.dueDate ? new Date(todo.dueDate) : null;
  const isOverdue =
    !todo.completed && dueDate !== null && isPast(dueDate) && !isToday(new Date(todo.taskDate));

  const commitEdit = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== todo.title) {
      onEdit(todo.id, trimmed);
    } else {
      setEditTitle(todo.title);
    }
    setEditing(false);
  };

  return (
    <div className="group flex items-start gap-1.5 px-1 py-0.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
      {/* Checkbox */}
      <button
        onClick={() => onToggle(todo.id, !todo.completed)}
        className="mt-0.5 shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors"
        style={{
          borderColor: todo.completed ? "#4285F4" : "#d1d5db",
          backgroundColor: todo.completed ? "#4285F4" : "transparent",
        }}
        aria-label={todo.completed ? "Mark incomplete" : "Mark complete"}
      >
        {todo.completed && (
          <svg
            className="w-2.5 h-2.5 text-white"
            fill="none"
            viewBox="0 0 10 10"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path d="M2 5l2.5 2.5L8 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Title + optional description */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") {
                setEditTitle(todo.title);
                setEditing(false);
              }
            }}
            className={`w-full bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-blue-400 rounded px-1 py-0.5 outline-none ${
              variant === "sidebar" ? "text-sm" : "text-xs"
            }`}
          />
        ) : (
          <>
            <span
              onDoubleClick={() => setEditing(true)}
              className={`block cursor-default select-none ${
                variant === "sidebar" ? "text-sm wrap-break-word" : "text-xs truncate"
              } ${
                todo.completed
                  ? "line-through text-gray-400 dark:text-gray-600"
                  : isOverdue
                  ? "text-red-600 dark:text-red-400"
                  : "text-gray-700 dark:text-gray-300"
              }`}
              title={todo.title}
            >
              {todo.title}
            </span>
            {variant === "sidebar" && todo.description && (
              <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500 whitespace-pre-wrap wrap-break-word max-h-12 overflow-hidden">
                {todo.description}
              </p>
            )}
          </>
        )}
      </div>

      {/* Due time badge (only if set) */}
      {!editing && dueDate && (
        <span
          className={`mt-0.5 flex items-center gap-0.5 text-xs shrink-0 tabular-nums ${
            isOverdue ? "text-red-500 dark:text-red-400" : "text-gray-400 dark:text-gray-500"
          }`}
        >
          <Clock className="w-2.5 h-2.5" />
          {format(dueDate, "h:mm a")}
        </span>
      )}

      {/* Edit details button (pencil) */}
      {!editing && (
        <button
          onClick={() => setShowDetailsModal(true)}
          className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 transition-all"
          aria-label="Edit to-do details"
        >
          <Pencil className="w-3 h-3" />
        </button>
      )}

      {/* Delete button */}
      <button
        onClick={() => onDelete(todo.id)}
        className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-all"
        aria-label="Delete"
      >
        <Trash2 className="w-3 h-3" />
      </button>

      {showDetailsModal && (
        <TodoFormModal
          initialDate={new Date(todo.taskDate)}
          todo={todo}
          onClose={() => setShowDetailsModal(false)}
          onSave={(updated) => {
            onUpdate(updated);
            setShowDetailsModal(false);
          }}
        />
      )}
    </div>
  );
}
