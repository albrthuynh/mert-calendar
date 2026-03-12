"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback(
    (t: Omit<Toast, "id" | "createdAt"> & { id?: string }) => {
      const id = t.id ?? `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== id));
      }, 8000);
    },
    []
  );

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 shadow-lg backdrop-blur px-4 py-3"
          >
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {t.title}
            </p>
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

