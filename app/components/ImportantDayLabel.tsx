"use client";

interface ImportantDayLabelProps {
  children: string;
  className?: string;
}

/** Centered pill like calendar apps: blue dot + uppercase label on translucent backdrop. */
export function ImportantDayLabel({ children, className = "" }: ImportantDayLabelProps) {
  return (
    <span
      title={children}
      className={`flex w-full max-w-full items-center justify-center gap-1.5 rounded-md px-2 py-1
        bg-white/70 backdrop-blur-sm dark:bg-slate-900/45
        ${className}`}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full bg-blue-500 dark:bg-blue-400"
        aria-hidden
      />
      <span className="min-w-0 truncate text-center text-[14px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {children}
      </span>
    </span>
  );
}
