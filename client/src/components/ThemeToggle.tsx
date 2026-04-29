import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const isDark = theme === "dark" || (theme === "system" && systemPrefersDark());
  root.classList.toggle("dark", isDark);
}

/**
 * Theme toggle dropdown — light / dark / system.
 *
 * Pairs with the inline script in `index.html` that applies the saved theme
 * before React mounts (so there's no flash of incorrect theme).
 */
export function ThemeToggle({
  align = "end",
  side = "bottom",
}: {
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
}) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());

  // Apply theme + persist
  useEffect(() => {
    applyTheme(theme);
    if (theme === "system") {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, theme);
    }
  }, [theme]);

  // React to OS preference changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  const effectivelyDark =
    theme === "dark" || (theme === "system" && systemPrefersDark());

  const items: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "淺色", icon: Sun },
    { value: "dark", label: "深色", icon: Moon },
    { value: "system", label: "跟隨系統", icon: Monitor },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 relative"
          title="切換外觀"
          aria-label="切換外觀模式"
        >
          {/* Cross-fade sun/moon */}
          <Sun
            className={`h-4 w-4 absolute transition-all ${
              effectivelyDark ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"
            }`}
          />
          <Moon
            className={`h-4 w-4 absolute transition-all ${
              effectivelyDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"
            }`}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-40">
        {items.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setThemeState(value)}
            className="cursor-pointer"
          >
            <Icon className="h-4 w-4 mr-2" />
            <span className="flex-1">{label}</span>
            {theme === value && (
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
