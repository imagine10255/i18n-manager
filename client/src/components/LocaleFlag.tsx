import { cn } from "@/lib/utils";
import { findPreset } from "@/lib/localePresets";

/**
 * Round country-flag icon. Uses the `flag-icons` CSS library loaded from
 * jsDelivr in `index.html` — `.fi.fis.fi-{cc}` paints a 1:1 square SVG flag
 * as the element's background. We force a literal pixel size + `aspect-ratio`
 * so the library's em-based width can't bleed through and produce an
 * elliptical result, then clip to a circle with `rounded-full`.
 */

const SIZE_PX: Record<NonNullable<LocaleFlagProps["size"]>, number> = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
  xl: 40,
};

export type LocaleFlagProps = {
  /** BCP-47 / language / short code — anything `findPreset` understands. */
  code: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  title?: string;
};

function countryFor(code: string): string | null {
  const preset = findPreset(code);
  if (preset?.shortCode) return preset.shortCode.toLowerCase();
  const parts = code.split(/[-_]/);
  if (parts.length > 1 && /^[A-Za-z]{2}$/.test(parts[1])) {
    return parts[1].toLowerCase();
  }
  if (/^[A-Za-z]{2}$/.test(parts[0])) return parts[0].toLowerCase();
  return null;
}

export function LocaleFlag({
  code,
  size = "sm",
  className,
  title,
}: LocaleFlagProps) {
  const cc = countryFor(code);
  const ariaLabel = title ?? code;
  const px = SIZE_PX[size];

  if (!cc) {
    return (
      <span
        role="img"
        aria-label={ariaLabel}
        title={ariaLabel}
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground/70 text-[10px] shrink-0 ring-1 ring-black/10 dark:ring-white/15 align-middle",
          className
        )}
        style={{
          width: `${px}px`,
          height: `${px}px`,
          minWidth: `${px}px`,
          minHeight: `${px}px`,
        }}
      >
        🌐
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(
        `fi fis fi-${cc}`,
        "rounded-full ring-1 ring-black/10 dark:ring-white/15 shrink-0 inline-block align-middle",
        className
      )}
      // Force literal pixel dimensions + 1:1 aspect — the flag-icons library
      // sets `width: 1em` on `.fis` which can stretch differently across font
      // contexts; explicit width+height (matching) guarantees a circle.
      style={{
        width: `${px}px`,
        height: `${px}px`,
        minWidth: `${px}px`,
        minHeight: `${px}px`,
        aspectRatio: "1 / 1",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    />
  );
}
