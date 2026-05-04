/**
 * agencyXlsx — 翻譯社用的 Excel 匯出 / 匯入工具。
 *
 * 結構（依使用者問卷確認）：
 *   • 一個 workbook
 *   • 每個 target locale 一個 sheet，sheet name = locale code（e.g. "en"、"ja"）
 *   • 每個 sheet 欄位：
 *        Key | <source code> | <target code> | Description | Status
 *   • 第一列 header 凍結；source 欄填灰色背景提示翻譯社「不要動」；
 *     target 欄是翻譯社要填的。
 *
 * 匯入時：每個 sheet 對到一個 target locale；以 `Key` 欄為主鍵跟 DB 配對；
 * 只把「target 欄非空」的行視為要寫入；完成後回傳 diff 給 UI 預覽。
 */

import * as XLSX from "xlsx";

export interface ExportRow {
  /** 完整 key path，e.g. `common.button.confirm` */
  keyPath: string;
  /** 源語系的目前值 */
  sourceValue: string;
  /** target 語系目前值（讓翻譯社知道 baseline） */
  targetValue: string;
  /** key 的說明（context）— 給翻譯師參考 */
  description?: string;
  /** target 是否已翻譯（提供「skip」用） */
  isTranslated: boolean;
}

export interface BuildWorkbookInput {
  /** 專案名稱，用來組檔名 */
  projectName: string;
  /** 源語系 code，e.g. `zh-TW` */
  sourceLocale: string;
  /** 源語系顯示名稱，e.g. `繁體中文` */
  sourceLocaleLabel: string;
  /** 要產生的 target sheet 列表 */
  targets: Array<{
    code: string;
    label: string; // e.g. `英文`
    rows: ExportRow[];
  }>;
  /** 是否只匯出 target 未翻譯的列 */
  onlyUntranslated?: boolean;
  /** 是否包含 description 欄 */
  includeDescription?: boolean;
}

/**
 * 建立 workbook 並回傳 ArrayBuffer。caller 負責下載。
 */
export function buildAgencyWorkbook(input: BuildWorkbookInput): {
  filename: string;
  buffer: ArrayBuffer;
} {
  const wb = XLSX.utils.book_new();

  for (const t of input.targets) {
    const filtered = input.onlyUntranslated
      ? t.rows.filter((r) => !r.isTranslated)
      : t.rows;

    const headerRow: string[] = [
      "Key",
      `${input.sourceLocaleLabel} (${input.sourceLocale}) — 源`,
      `${t.label} (${t.code}) — 翻譯填這欄`,
    ];
    if (input.includeDescription) headerRow.push("Description");
    headerRow.push("Status");

    const aoa: any[][] = [headerRow];
    for (const r of filtered) {
      const row: any[] = [r.keyPath, r.sourceValue, r.targetValue];
      if (input.includeDescription) row.push(r.description ?? "");
      row.push(r.isTranslated ? "translated" : "todo");
      aoa.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // 凍結首列、設定欄寬
    ws["!freeze"] = { xSplit: 1, ySplit: 1 } as any;
    ws["!cols"] = [
      { wch: 40 }, // Key
      { wch: 40 }, // Source
      { wch: 40 }, // Target
      ...(input.includeDescription ? [{ wch: 30 }] : []),
      { wch: 12 }, // Status
    ];

    XLSX.utils.book_append_sheet(wb, ws, t.code);
  }

  const buffer = XLSX.write(wb, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer;

  const today = new Date().toISOString().slice(0, 10);
  const safeName = input.projectName.replace(/[^A-Za-z0-9_\-]/g, "_");
  const filename = `${safeName}_translation_${today}.xlsx`;
  return { filename, buffer };
}

export interface ParsedSheet {
  /** locale code (sheet name) */
  localeCode: string;
  /** 解析出來的 row：{ keyPath, targetValue }；target 為空的會被略過。 */
  rows: Array<{ keyPath: string; targetValue: string }>;
  /** sheet 的源語系 code（從 header 自動讀；可能為 null） */
  sourceLocaleHint?: string | null;
  /** Sheet 中總共看到的列數（含被略過的空 target 列） */
  totalRowsSeen: number;
}

export interface ParsedWorkbook {
  sheets: ParsedSheet[];
  warnings: string[];
}

/**
 * 解析翻譯社填回來的 xlsx。容錯設計：
 *   • Sheet 名直接當 target locale code（理想格式）；如果不是 locale code，會被
 *     當 warning 略過。
 *   • Header 用 keyword 偵測：第一欄含「Key」、第三欄含 sheet name 或「target」
 *     即視為 target value 欄。
 *   • Target 為空字串的列直接跳過（避免清空既有翻譯）。
 */
export async function parseAgencyWorkbook(
  file: File,
  knownLocaleCodes: Set<string>
): Promise<ParsedWorkbook> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  const out: ParsedWorkbook = { sheets: [], warnings: [] };

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<any[]>(ws, {
      header: 1,
      defval: "",
      blankrows: false,
    });
    if (aoa.length < 2) {
      out.warnings.push(`Sheet「${sheetName}」沒有資料，已略過`);
      continue;
    }

    const localeCode = sheetName.trim();
    if (!knownLocaleCodes.has(localeCode)) {
      out.warnings.push(
        `Sheet「${sheetName}」名稱不是已啟用的 locale code，已略過`
      );
      continue;
    }

    const header = (aoa[0] as any[]).map((c) =>
      String(c ?? "").toLowerCase().trim()
    );

    // 找 Key 欄、target 欄。預設 Key=col 0, target=col 2。
    let keyCol = header.findIndex((h) => h === "key" || h === "keypath");
    if (keyCol < 0) keyCol = 0;

    let targetCol = -1;
    for (let i = 0; i < header.length; i++) {
      const h = header[i];
      if (
        h.includes(localeCode.toLowerCase()) ||
        h.includes("target") ||
        h.includes("翻譯填這欄")
      ) {
        targetCol = i;
        break;
      }
    }
    // 預設 target = col 2 (Key=0, Source=1, Target=2)
    if (targetCol < 0) targetCol = 2;

    const rows: ParsedSheet["rows"] = [];
    let totalSeen = 0;
    for (let i = 1; i < aoa.length; i++) {
      const r = aoa[i] as any[];
      const keyPath = String(r[keyCol] ?? "").trim();
      const targetValue = String(r[targetCol] ?? "");
      if (!keyPath) continue;
      totalSeen++;
      if (!targetValue) continue; // 空白 target 略過，避免清空現有翻譯
      rows.push({ keyPath, targetValue });
    }

    out.sheets.push({
      localeCode,
      rows,
      sourceLocaleHint: null,
      totalRowsSeen: totalSeen,
    });
  }

  if (out.sheets.length === 0) {
    out.warnings.push("這個檔案沒有任何可匯入的 sheet");
  }
  return out;
}
