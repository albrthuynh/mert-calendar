"use client";

import {
  createContext,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type Toast = {
  id: string;
  title: string;
  message?: string;
  createdAt: number;
};

type ToastContextValue = {
  pushToast: (t: Omit<Toast, "id" | "createdAt"> & { id?: string }) => void;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const suppressedToastIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("dismissed-toast-ids");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      suppressedToastIdsRef.current = new Set(parsed.filter((x) => typeof x === "string"));
    } catch {
      // ignore malformed local state
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const dismissToast = useCallback((id: string) => {
    suppressedToastIdsRef.current.add(id);
    try {
      window.localStorage.setItem(
        "dismissed-toast-ids",
        JSON.stringify(Array.from(suppressedToastIdsRef.current))
      );
    } catch {
      // ignore storage write failures
    }
    removeToast(id);
  }, [removeToast]);

  const pushToast = useCallback(
    (t: Omit<Toast, "id" | "createdAt"> & { id?: string }) => {
      const id = t.id ?? `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      if (suppressedToastIdsRef.current.has(id)) return;
      const toast: Toast = {
        id,
        title: t.title,
        message: t.message,
        createdAt: Date.now(),
      };
      setToasts((prev) => {
        const next = [...prev.filter((x) => x.id !== id), toast];
        return next.slice(-3);
      });
    },
    []
  );

  const value = useMemo(
    () => ({ pushToast, dismissToast }),
    [pushToast, dismissToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 shadow-lg backdrop-blur px-4 py-3"
          >
            <div className="flex items-start gap-2">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex-1 min-w-0">
                {t.title}
              </p>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="text-xs leading-none px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Dismiss notification"
              >
                x
              </button>
            </div>
            {t.message && (
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                {t.message}
              </p>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
