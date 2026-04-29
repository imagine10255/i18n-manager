import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
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
 *
 * `surface="sidebar"` switches the trigger button to use sidebar tokens so the
 * hover state is dark-on-dark rather than the regular ghost variant which
 * shows as a near-white pill in light mode and obscures the icon.
 */
export function ThemeToggle({
  align = "end",
  side = "bottom",
  surface = "default",
}: {
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  surface?: "default" | "sidebar";
}) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());
  /**
   * Source of truth for which icon to show — derived from the *actual*
   * `<html>` `dark` class rather than recomputing from theme + matchMedia
   * on each render. Pre-React the inline script in index.html already set
   * the class, so reading from the DOM avoids any "icon drift" on the
   * Login page (where the toggle is mounted before any user interaction).
   */
  const [effectivelyDark, setEffectivelyDark] = useState<boolean>(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    applyTheme(theme);
    if (theme === "system") {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, theme);
    }
    // Mirror whatever applyTheme just decided
    setEffectivelyDark(document.documentElement.classList.contains("dark"));
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      applyTheme("system");
      setEffectivelyDark(
        document.documentElement.classList.contains("dark")
      );
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  const items: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "淺色", icon: Sun },
    { value: "dark", label: "深色", icon: Moon },
    { value: "system", label: "跟隨系統", icon: Monitor },
  ];

  // Hover/text colors are surface-aware so the trigger reads correctly in both
  // the light page chrome AND the always-dark sidebar.
  const triggerCls =
    surface === "sidebar"
      ? "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent focus-visible:bg-sidebar-accent"
      : "text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:bg-muted";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="切換外觀"
          aria-label="切換外觀模式"
          className={`h-8 w-8 relative inline-flex items-center justify-center rounded-md transition-colors focus:outline-none ${triggerCls}`}
        >
          {/* Cross-fade sun/moon */}
          <Sun
            className={`h-4 w-4 absolute transition-all ${
              effectivelyDark
                ? "opacity-0 rotate-90 scale-50"
                : "opacity-100 rotate-0 scale-100"
            }`}
          />
          <Moon
            className={`h-4 w-4 absolute transition-all ${
              effectivelyDark
                ? "opacity-100 rotate-0 scale-100"
                : "opacity-0 -rotate-90 scale-50"
            }`}
          />
        </button>
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
