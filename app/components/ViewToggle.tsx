"use client";

export type ViewMode = "week" | "month";

interface ViewToggleProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export function ViewToggle({ currentView, onViewChange }: ViewToggleProps) {
  return (
    <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
      <button
        onClick={() => onViewChange("week")}
        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
          currentView === "week"
            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        }`}
      >
        Week
      </button>
      <button
        onClick={() => onViewChange("month")}
        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
          currentView === "month"
            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        }`}
      >
        Month
      </button>
    </div>
  );
}
