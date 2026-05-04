/**
 * ImportFromAgencyModal — 把翻譯社填回來的 Excel 寫回 DB。
 *
 * 流程：
 *   1. 選檔（.xlsx），用 SheetJS 解析。
 *   2. 每個 sheet 名 = target locale code；每個 row 用 Key 配對到專案 key。
 *   3. 計算 diff：新增（原值空白）/ 修改（值有變）/ 不變。
 *   4. 顯示 diff 預覽，使用者確認後 batchUpdate 寫入 DB。
 */

import { useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LocaleFlag } from "@/components/LocaleFlag";
import { findPreset } from "@/lib/localePresets";
import {
  ArrowRight,
  Building2,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  parseAgencyWorkbook,
  type ParsedWorkbook,
} from "@/lib/agencyXlsx";

function localeChineseName(code: string) {
  const preset = findPreset(code);
  return preset?.name ?? code;
}

export interface AgencyImportLocale {
  code: string;
}

export interface AgencyImportKey {
  id: number;
  keyPath: string;
  /** localeCode → 目前 DB 值 */
  translations: Record<string, { value: string | null }>;
}

interface ImportRow {
  keyPath: string;
  localeCode: string;
  oldValue: string;
  newValue: string;
  /** create / update / nochange / skipped(不存在的 key) */
  action: "create" | "update" | "nochange" | "skipped";
  keyId?: number;
}

export interface ImportFromAgencyModalProps {
  open: boolean;
  onClose: () => void;
  locales: AgencyImportLocale[];
  keys: AgencyImportKey[];
  pending: boolean;
  onSubmit: (
    updates: Array<{ keyId: number; localeCode: string; value: string }>
  ) => Promise<void>;
}

export default function ImportFromAgencyModal({
  open,
  onClose,
  locales,
  keys,
  pending,
  onSubmit,
}: ImportFromAgencyModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
  const [filename, setFilename] = useState<string>("");

  const localeCodeSet = useMemo(
    () => new Set(locales.map((l) => l.code)),
    [locales]
  );

  // 計算 diff
  const diff = useMemo<ImportRow[]>(() => {
    if (!parsed) return [];
    const keyByPath = new Map<string, AgencyImportKey>();
    for (const k of keys) keyByPath.set(k.keyPath, k);

    const rows: ImportRow[] = [];
    for (const sheet of parsed.sheets) {
      for (const r of sheet.rows) {
        const k = keyByPath.get(r.keyPath);
        if (!k) {
          rows.push({
            keyPath: r.keyPath,
            localeCode: sheet.localeCode,
            oldValue: "",
            newValue: r.targetValue,
            action: "skipped",
          });
          continue;
        }
        const oldValue = k.translations[sheet.localeCode]?.value ?? "";
        if (oldValue === r.targetValue) {
          rows.push({
            keyPath: r.keyPath,
            localeCode: sheet.localeCode,
            oldValue,
            newValue: r.targetValue,
            action: "nochange",
            keyId: k.id,
          });
        } else if (!oldValue) {
          rows.push({
            keyPath: r.keyPath,
            localeCode: sheet.localeCode,
            oldValue,
            newValue: r.targetValue,
            action: "create",
            keyId: k.id,
          });
        } else {
          rows.push({
            keyPath: r.keyPath,
            localeCode: sheet.localeCode,
            oldValue,
            newValue: r.targetValue,
            action: "update",
            keyId: k.id,
          });
        }
      }
    }
    return rows;
  }, [parsed, keys]);

  const stats = useMemo(() => {
    let create = 0;
    let update = 0;
    let nochange = 0;
    let skipped = 0;
    for (const r of diff) {
      if (r.action === "create") create++;
      else if (r.action === "update") update++;
      else if (r.action === "nochange") nochange++;
      else skipped++;
    }
    return { create, update, nochange, skipped };
  }, [diff]);

  function reset() {
    setParsed(null);
    setFilename("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setFilename(file.name);
    try {
      const wb = await parseAgencyWorkbook(file, localeCodeSet);
      setParsed(wb);
      if (wb.warnings.length > 0) {
        for (const w of wb.warnings) toast.warning(w);
      }
    } catch (err: any) {
      toast.error(`解析失敗：${err?.message ?? err}`);
      setParsed(null);
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirm() {
    const updates = diff
      .filter((r) => r.action === "create" || r.action === "update")
      .map((r) => ({
        keyId: r.keyId!,
        localeCode: r.localeCode,
        value: r.newValue,
      }));
    if (updates.length === 0) {
      toast.info("沒有需要寫入的變更");
      return;
    }
    await onSubmit(updates);
    reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            匯入翻譯社 Excel
          </DialogTitle>
          <DialogDescription>
            匯入翻譯社填回來的 .xlsx；先看 diff 預覽，按確認才寫入 DB。
          </DialogDescription>
        </DialogHeader>

        {!parsed ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              選擇翻譯社填好的 .xlsx
            </p>
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
            >
              {parsing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  解析中…
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  選擇檔案
                </>
              )}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFileChosen}
              className="hidden"
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            {/* Stats bar */}
            <div className="flex items-center gap-2 text-xs px-1">
              <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />
              <code className="font-mono text-muted-foreground truncate max-w-[240px]">
                {filename}
              </code>
              <div className="flex-1" />
              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/15">
                新增 {stats.create}
              </Badge>
              <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30 hover:bg-blue-500/15">
                修改 {stats.update}
              </Badge>
              <Badge variant="secondary">不變 {stats.nochange}</Badge>
              {stats.skipped > 0 && (
                <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 hover:bg-rose-500/15">
                  略過 {stats.skipped}
                </Badge>
              )}
              <button
                type="button"
                onClick={reset}
                className="text-xs text-muted-foreground hover:underline ml-2"
              >
                重新選檔
              </button>
            </div>

            {/* Diff list */}
            <div className="flex-1 min-h-0 overflow-y-auto border rounded-md divide-y">
              {diff.length === 0 ? (
                <p className="text-sm text-muted-foreground p-6 text-center">
                  這個檔沒有可寫入的內容
                </p>
              ) : (
                diff.map((r, i) => <DiffRow key={i} row={r} />)
              )}
            </div>

            {stats.skipped > 0 && (
              <p className="text-[11px] text-muted-foreground px-1">
                「略過」表示 Excel 裡的 keyPath 在這個專案找不到對應的 key（可能是別的專案、或已被刪除）— 不會被寫入。
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              !parsed ||
              pending ||
              stats.create + stats.update === 0
            }
          >
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                寫入中…
              </>
            ) : (
              `寫入 ${stats.create + stats.update} 筆變更`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DiffRow({ row }: { row: ImportRow }) {
  const action = row.action;
  const pillCls =
    action === "create"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30"
      : action === "update"
        ? "bg-blue-500/15 text-blue-700 dark:text-blue-300 ring-blue-500/30"
        : action === "skipped"
          ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-rose-500/30"
          : "bg-muted text-muted-foreground ring-border";
  const label =
    action === "create"
      ? "新增"
      : action === "update"
        ? "修改"
        : action === "skipped"
          ? "略過"
          : "不變";

  return (
    <div className="flex items-start gap-3 px-3 py-2 hover:bg-muted/30">
      <span
        className={`shrink-0 mt-0.5 inline-flex h-5 px-2 items-center rounded-full text-[10px] font-semibold ring-1 ${pillCls}`}
      >
        {label}
      </span>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 text-xs">
          <code className="font-mono break-all bg-card px-1.5 py-0.5 rounded text-foreground/80">
            {row.keyPath}
          </code>
          <LocaleFlag code={row.localeCode} size="xs" />
          <span className="font-mono text-[10px] text-muted-foreground">
            {localeChineseName(row.localeCode)}
          </span>
        </div>
        {action !== "nochange" && action !== "skipped" && (
          <div className="flex items-start gap-2 text-xs flex-wrap">
            {row.oldValue && (
              <>
                <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-300 line-through break-all">
                  {row.oldValue}
                </span>
                <ArrowRight className="h-3 w-3 text-muted-foreground mt-1 shrink-0" />
              </>
            )}
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 break-all">
              {row.newValue || "(空)"}
            </span>
          </div>
        )}
        {action === "skipped" && (
          <p className="text-[11px] text-muted-foreground">
            此專案找不到此 keyPath
          </p>
        )}
        {action === "nochange" && (
          <p className="text-[11px] text-muted-foreground">值跟 DB 一樣，不會寫入</p>
        )}
      </div>
    </div>
  );
}
