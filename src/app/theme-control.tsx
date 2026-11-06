"use client";

import { useEffect, useState } from "react";
import type { ThemeMode } from "@/lib/theme";

export function ThemeControl({ initialTheme }: { initialTheme: ThemeMode }) {
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme === "system" ? "" : theme;
    document.cookie = `prompt-tool-theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [theme]);

  return (
    <label className="theme-control">
      <span>Theme</span>
      <select
        value={theme}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "system" || value === "light" || value === "dark") setTheme(value);
        }}
        aria-label="Color theme"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
