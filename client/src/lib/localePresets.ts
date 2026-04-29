/**
 * Common locale presets — used by the LocaleManager's "quick add" picker.
 *
 * Each entry exposes both:
 *   - `shortCode`: the ISO 639-1 / ISO 3166 two-letter form (e.g. "tw", "cn")
 *   - `code`:      the BCP-47 / browser-style form (e.g. "zh-TW", "zh-CN")
 *
 * The user can pick either form and still tweak the result.
 */

export type LocalePreset = {
  /** BCP-47 code (zh-TW, en-US, …) */
  code: string;
  /** Short two-letter alias (tw, cn, en, …) — useful when the user wants compact codes */
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
  { code: "zh-TW", shortCode: "tw", name: "繁體中文", nativeName: "繁體中文", region: "東亞" },
  { code: "zh-CN", shortCode: "cn", name: "簡體中文", nativeName: "简体中文", region: "東亞" },
  { code: "zh-HK", shortCode: "hk", name: "香港繁體", nativeName: "香港繁體", region: "東亞" },
  { code: "ja",    shortCode: "jp", name: "日文",     nativeName: "日本語",     region: "東亞" },
  { code: "ko",    shortCode: "kr", name: "韓文",     nativeName: "한국어",     region: "東亞" },

  // 東南亞
  { code: "vi",    shortCode: "vn", name: "越南文",   nativeName: "Tiếng Việt", region: "東南亞" },
  { code: "th",    shortCode: "th", name: "泰文",     nativeName: "ภาษาไทย",    region: "東南亞" },
  { code: "id",    shortCode: "id", name: "印尼文",   nativeName: "Bahasa Indonesia", region: "東南亞" },
  { code: "ms",    shortCode: "my", name: "馬來文",   nativeName: "Bahasa Melayu", region: "東南亞" },
  { code: "tl",    shortCode: "ph", name: "他加祿文", nativeName: "Tagalog",     region: "東南亞" },

  // 南亞
  { code: "hi",    shortCode: "in", name: "印地文",   nativeName: "हिन्दी",      region: "南亞" },
  { code: "bn",    shortCode: "bd", name: "孟加拉文", nativeName: "বাংলা",        region: "南亞" },
  { code: "ur",    shortCode: "pk", name: "烏爾都文", nativeName: "اردو",        region: "南亞" },

  // 中東
  { code: "ar",    shortCode: "sa", name: "阿拉伯文", nativeName: "العربية",     region: "中東" },
  { code: "he",    shortCode: "il", name: "希伯來文", nativeName: "עברית",       region: "中東" },
  { code: "fa",    shortCode: "ir", name: "波斯文",   nativeName: "فارسی",       region: "中東" },
  { code: "tr",    shortCode: "tr", name: "土耳其文", nativeName: "Türkçe",      region: "中東" },

  // 歐洲
  { code: "en",    shortCode: "us", name: "英文",     nativeName: "English",     region: "歐洲" },
  { code: "en-GB", shortCode: "gb", name: "英式英文", nativeName: "British English", region: "歐洲" },
  { code: "fr",    shortCode: "fr", name: "法文",     nativeName: "Français",    region: "歐洲" },
  { code: "de",    shortCode: "de", name: "德文",     nativeName: "Deutsch",     region: "歐洲" },
  { code: "es",    shortCode: "es", name: "西班牙文", nativeName: "Español",     region: "歐洲" },
  { code: "it",    shortCode: "it", name: "義大利文", nativeName: "Italiano",    region: "歐洲" },
  { code: "pt",    shortCode: "pt", name: "葡萄牙文", nativeName: "Português",   region: "歐洲" },
  { code: "ru",    shortCode: "ru", name: "俄文",     nativeName: "Русский",     region: "歐洲" },
  { code: "nl",    shortCode: "nl", name: "荷蘭文",   nativeName: "Nederlands",  region: "歐洲" },
  { code: "pl",    shortCode: "pl", name: "波蘭文",   nativeName: "Polski",      region: "歐洲" },
  { code: "sv",    shortCode: "se", name: "瑞典文",   nativeName: "Svenska",     region: "歐洲" },
  { code: "no",    shortCode: "no", name: "挪威文",   nativeName: "Norsk",       region: "歐洲" },
  { code: "da",    shortCode: "dk", name: "丹麥文",   nativeName: "Dansk",       region: "歐洲" },
  { code: "fi",    shortCode: "fi", name: "芬蘭文",   nativeName: "Suomi",       region: "歐洲" },
  { code: "cs",    shortCode: "cz", name: "捷克文",   nativeName: "Čeština",     region: "歐洲" },
  { code: "el",    shortCode: "gr", name: "希臘文",   nativeName: "Ελληνικά",    region: "歐洲" },
  { code: "hu",    shortCode: "hu", name: "匈牙利文", nativeName: "Magyar",      region: "歐洲" },
  { code: "ro",    shortCode: "ro", name: "羅馬尼亞文", nativeName: "Română",    region: "歐洲" },
  { code: "uk",    shortCode: "ua", name: "烏克蘭文", nativeName: "Українська",  region: "歐洲" },

  // 美洲
  { code: "pt-BR", shortCode: "br", name: "巴西葡語", nativeName: "Português (BR)", region: "美洲" },
  { code: "es-MX", shortCode: "mx", name: "墨西哥西語", nativeName: "Español (MX)", region: "美洲" },
  { code: "fr-CA", shortCode: "ca", name: "加拿大法語", nativeName: "Français (CA)", region: "美洲" },
];

export function findPreset(code: string): LocalePreset | undefined {
  const k = code.toLowerCase();
  return LOCALE_PRESETS.find(
    (p) => p.code.toLowerCase() === k || p.shortCode.toLowerCase() === k
  );
}
