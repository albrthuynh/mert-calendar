"use client";

interface ImportantDayLabelProps {
  children: string;
  className?: string;
  hasBackground?: boolean;
}

/** Centered pill like calendar apps: blue dot + uppercase label on translucent backdrop. */
export function ImportantDayLabel({ children, className = "", hasBackground }: ImportantDayLabelProps) {
  return (
    <span
      title={children}
      className={`flex w-full max-w-full items-center justify-center gap-1.5 rounded-md px-2 py-1
        ${hasBackground ? "bg-transparent" : "bg-white/20 backdrop-blur-[2px] dark:bg-slate-900/15"}
        ${className}`}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full bg-blue-500 dark:bg-blue-400"
        aria-hidden
      />
      <span className={`min-w-0 max-h-[2lh] overflow-y-auto whitespace-normal break-words text-center text-[14px] font-medium uppercase leading-tight tracking-wide [overflow-wrap:anywhere] scrollbar-thin ${
        hasBackground
          ? "text-gray-900 dark:text-white"
          : "text-gray-700 dark:text-gray-300"
      }`}>
        {children}
      </span>
    </span>
  );
}
