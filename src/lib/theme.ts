import "server-only";
import { cookies } from "next/headers";

export type ThemeMode = "system" | "light" | "dark";

export async function getTheme(): Promise<ThemeMode> {
  const store = await cookies();
  const value = store.get("prompt-tool-theme")?.value;
  return value === "light" || value === "dark" ? value : "system";
}
