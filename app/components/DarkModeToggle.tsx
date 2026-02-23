"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function DarkModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="w-14 h-7 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`relative flex items-center w-14 h-7 rounded-full p-0.5 transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        isDark ? "bg-gray-700" : "bg-gray-200"
      }`}
    >
      {/* Icons */}
      <Sun
        className={`absolute left-1.5 w-3.5 h-3.5 transition-opacity duration-200 ${
          isDark ? "opacity-30 text-gray-400" : "opacity-100 text-yellow-500"
        }`}
      />
      <Moon
        className={`absolute right-1.5 w-3.5 h-3.5 transition-opacity duration-200 ${
          isDark ? "opacity-100 text-blue-300" : "opacity-30 text-gray-400"
        }`}
      />

      {/* Sliding knob */}
      <span
        className={`absolute w-6 h-6 rounded-full shadow-sm transition-all duration-300 ${
          isDark
            ? "translate-x-7 bg-gray-900"
            : "translate-x-0 bg-white"
        }`}
      />
    </button>
  );
}
