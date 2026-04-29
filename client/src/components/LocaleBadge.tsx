import { cn } from "@/lib/utils";

/**
 * Round, color-coded locale badge — replaces emoji flags so we have a
 * consistent visual across platforms (no rectangular emoji on Windows etc.)
 * and so it pairs nicely with a Chinese name on the right.
 */

const SIZE_CLASSES: Record<NonNullable<LocaleBadgeProps["size"]>, string> = {
  xs: "h-4 w-4 text-[8px]",
  sm: "h-5 w-5 text-[9px]",
  md: "h-6 w-6 text-[10px]",
  lg: "h-8 w-8 text-xs",
};

export type LocaleBadgeProps = {
  code: string;
  /** Override the abbreviation shown inside the circle (defaults to derived from `code`) */
  abbrev?: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
};

/**
 * Stable hash → HSL hue (so the same locale code always gets the same color
 * across renders and reloads).
 */
function hashHue(code: string): number {
  let h = 0;
  for (let i = 0; i < code.length; i++) {
    h = (h * 31 + code.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

/** Hand-tuned hues for the most common locales — keeps brand-ish colors. */
const FIXED_HUES: Record<string, number> = {
  "zh-TW": 0, // red
  "zh-CN": 0, // red
  zh: 0,
  tw: 0,
  cn: 0,
  en: 220, // blue
  "en-US": 220,
  "en-GB": 230,
  ja: 350,
  jp: 350,
  ko: 250,
  kr: 250,
  fr: 230,
  de: 45,
  es: 35,
  pt: 25,
  ru: 350,
  vi: 145,
  th: 280,
  id: 200,
  it: 130,
  nl: 25,
  pl: 0,
  tr: 0,
  ar: 130,
  hi: 25,
  he: 220,
};

function abbrevFor(code: string): string {
  // Prefer the region part if present: "zh-TW" → "TW", "en-US" → "US"
  const parts = code.split(/[-_]/);
  const tail = parts[parts.length - 1] ?? code;
  return tail.toUpperCase().slice(0, 2);
}

export function LocaleBadge({
  code,
  abbrev,
  size = "sm",
  className,
}: LocaleBadgeProps) {
  const hue =
    FIXED_HUES[code] ?? FIXED_HUES[code.toLowerCase()] ?? hashHue(code);
  const text = (abbrev ?? abbrevFor(code)).toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold tracking-tight text-white shrink-0 ring-1 ring-black/5 dark:ring-white/10 select-none",
        SIZE_CLASSES[size],
        className
      )}
      style={{
        background: `linear-gradient(135deg, hsl(${hue}, 70%, 55%), hsl(${(hue + 25) % 360}, 70%, 45%))`,
      }}
      title={code}
    >
      {text}
    </span>
  );
}
