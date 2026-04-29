/**
 * Common locale presets — used by the LocaleManager's "quick add" picker.
 *
 * Three forms are tracked per locale so the UI can offer either format and
 * still match existing records that may use a different convention:
 *   - `code`:      BCP-47 form, language + region (e.g. "zh-TW", "ja-JP", "en-US")
 *   - `langCode`:  ISO 639-1 language only (e.g. "zh", "ja", "en")
 *   - `shortCode`: 2-letter alias used in some pipelines (e.g. "tw", "jp", "us")
 */

export type LocalePreset = {
  /** BCP-47 code (zh-TW, ja-JP, en-US, …) */
  code: string;
  /** Bare language code (ja, ko, zh, en…) — used to match legacy records */
  langCode: string;
  /** Short two-letter alias (tw, jp, kr, us…) */
  shortCode: string;
  /** Display name in Chinese (project-primary language) */
  name: string;
  /** Native name (in the language itself) */
  nativeName: string;
  /** Region group, used for grouping in the UI */
  region:
    | "東亞"
    | "東南亞"
    | "南亞"
    | "中東"
    | "歐洲"
    | "美洲"
    | "其他";
};

export const LOCALE_PRESETS: LocalePreset[] = [
  // 東亞
  { code: "zh-TW", langCode: "zh", shortCode: "tw", name: "繁體中文",   nativeName: "繁體中文",   region: "東亞" },
  { code: "zh-CN", langCode: "zh", shortCode: "cn", name: "簡體中文",   nativeName: "简体中文",   region: "東亞" },
  { code: "zh-HK", langCode: "zh", shortCode: "hk", name: "香港繁體",   nativeName: "香港繁體",   region: "東亞" },
  { code: "ja-JP", langCode: "ja", shortCode: "jp", name: "日文",       nativeName: "日本語",     region: "東亞" },
  { code: "ko-KR", langCode: "ko", shortCode: "kr", name: "韓文",       nativeName: "한국어",     region: "東亞" },

  // 東南亞
  { code: "vi-VN", langCode: "vi", shortCode: "vn", name: "越南文",     nativeName: "Tiếng Việt", region: "東南亞" },
  { code: "th-TH", langCode: "th", shortCode: "th", name: "泰文",       nativeName: "ภาษาไทย",    region: "東南亞" },
  { code: "id-ID", langCode: "id", shortCode: "id", name: "印尼文",     nativeName: "Bahasa Indonesia", region: "東南亞" },
  { code: "ms-MY", langCode: "ms", shortCode: "my", name: "馬來文",     nativeName: "Bahasa Melayu", region: "東南亞" },
  { code: "tl-PH", langCode: "tl", shortCode: "ph", name: "他加祿文",   nativeName: "Tagalog",     region: "東南亞" },

  // 南亞
  { code: "hi-IN", langCode: "hi", shortCode: "in", name: "印地文",     nativeName: "हिन्दी",      region: "南亞" },
  { code: "bn-BD", langCode: "bn", shortCode: "bd", name: "孟加拉文",   nativeName: "বাংলা",        region: "南亞" },
  { code: "ur-PK", langCode: "ur", shortCode: "pk", name: "烏爾都文",   nativeName: "اردو",        region: "南亞" },

  // 中東
  { code: "ar-SA", langCode: "ar", shortCode: "sa", name: "阿拉伯文",   nativeName: "العربية",     region: "中東" },
  { code: "he-IL", langCode: "he", shortCode: "il", name: "希伯來文",   nativeName: "עברית",       region: "中東" },
  { code: "fa-IR", langCode: "fa", shortCode: "ir", name: "波斯文",     nativeName: "فارسی",       region: "中東" },
  { code: "tr-TR", langCode: "tr", shortCode: "tr", name: "土耳其文",   nativeName: "Türkçe",      region: "中東" },

  // 歐洲
  { code: "en-US", langCode: "en", shortCode: "us", name: "英文（美）", nativeName: "English (US)", region: "歐洲" },
  { code: "en-GB", langCode: "en", shortCode: "gb", name: "英文（英）", nativeName: "English (UK)", region: "歐洲" },
  { code: "fr-FR", langCode: "fr", shortCode: "fr", name: "法文",       nativeName: "Français",    region: "歐洲" },
  { code: "de-DE", langCode: "de", shortCode: "de", name: "德文",       nativeName: "Deutsch",     region: "歐洲" },
  { code: "es-ES", langCode: "es", shortCode: "es", name: "西班牙文",   nativeName: "Español",     region: "歐洲" },
  { code: "it-IT", langCode: "it", shortCode: "it", name: "義大利文",   nativeName: "Italiano",    region: "歐洲" },
  { code: "pt-PT", langCode: "pt", shortCode: "pt", name: "葡萄牙文",   nativeName: "Português",   region: "歐洲" },
  { code: "ru-RU", langCode: "ru", shortCode: "ru", name: "俄文",       nativeName: "Русский",     region: "歐洲" },
  { code: "nl-NL", langCode: "nl", shortCode: "nl", name: "荷蘭文",     nativeName: "Nederlands",  region: "歐洲" },
  { code: "pl-PL", langCode: "pl", shortCode: "pl", name: "波蘭文",     nativeName: "Polski",      region: "歐洲" },
  { code: "sv-SE", langCode: "sv", shortCode: "se", name: "瑞典文",     nativeName: "Svenska",     region: "歐洲" },
  { code: "no-NO", langCode: "no", shortCode: "no", name: "挪威文",     nativeName: "Norsk",       region: "歐洲" },
  { code: "da-DK", langCode: "da", shortCode: "dk", name: "丹麥文",     nativeName: "Dansk",       region: "歐洲" },
  { code: "fi-FI", langCode: "fi", shortCode: "fi", name: "芬蘭文",     nativeName: "Suomi",       region: "歐洲" },
  { code: "cs-CZ", langCode: "cs", shortCode: "cz", name: "捷克文",     nativeName: "Čeština",     region: "歐洲" },
  { code: "el-GR", langCode: "el", shortCode: "gr", name: "希臘文",     nativeName: "Ελληνικά",    region: "歐洲" },
  { code: "hu-HU", langCode: "hu", shortCode: "hu", name: "匈牙利文",   nativeName: "Magyar",      region: "歐洲" },
  { code: "ro-RO", langCode: "ro", shortCode: "ro", name: "羅馬尼亞文", nativeName: "Română",      region: "歐洲" },
  { code: "uk-UA", langCode: "uk", shortCode: "ua", name: "烏克蘭文",   nativeName: "Українська",  region: "歐洲" },

  // 美洲
  { code: "pt-BR", langCode: "pt", shortCode: "br", name: "葡萄牙文（巴）", nativeName: "Português (BR)", region: "美洲" },
  { code: "es-MX", langCode: "es", shortCode: "mx", name: "西班牙文（墨）", nativeName: "Español (MX)",  region: "美洲" },
  { code: "fr-CA", langCode: "fr", shortCode: "ca", name: "法文（加）",     nativeName: "Français (CA)", region: "美洲" },
];

/**
 * Convert a 2-letter ISO country/region code to its emoji flag — works by
 * mapping each ASCII letter to the corresponding regional indicator codepoint.
 * Falls back to the globe emoji when the input isn't a valid pair.
 */
export function flagEmoji(twoLetter: string | undefined | null): string {
  if (!twoLetter || twoLetter.length !== 2) return "🌐";
  const upper = twoLetter.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "🌐";
  const A = "A".charCodeAt(0);
  const RI = 0x1f1e6;
  return String.fromCodePoint(
    RI + (upper.charCodeAt(0) - A),
    RI + (upper.charCodeAt(1) - A)
  );
}

/** Resolve an emoji flag for a locale code, using its preset (if any). */
export function flagFor(code: string): string {
  const p = findPreset(code);
  if (p) return flagEmoji(p.shortCode);
  // Last-resort heuristics: try parsing the BCP-47 region or 2-letter code
  const parts = code.split(/[-_]/);
  if (parts.length > 1) return flagEmoji(parts[1]);
  return flagEmoji(parts[0]);
}

/**
 * Look up a preset by any of its three forms (BCP-47 / language / short alias),
 * case-insensitively. Returns the most specific match — preferring exact `code`
 * matches over `langCode` matches over `shortCode` matches.
 */
export function findPreset(code: string): LocalePreset | undefined {
  const k = code.toLowerCase();
  // 1) exact BCP-47 match (e.g. "zh-TW")
  const exact = LOCALE_PRESETS.find((p) => p.code.toLowerCase() === k);
  if (exact) return exact;
  // 2) bare-language match (e.g. "ja" → "ja-JP") — prefer the first one
  const byLang = LOCALE_PRESETS.find((p) => p.langCode.toLowerCase() === k);
  if (byLang) return byLang;
  // 3) short alias (e.g. "jp" → "ja-JP")
  return LOCALE_PRESETS.find((p) => p.shortCode.toLowerCase() === k);
}
