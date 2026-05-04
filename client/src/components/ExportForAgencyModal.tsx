/**
 * ExportForAgencyModal — 匯出翻譯社用的 Excel。
 *
 * 流程：
 *   1. 使用者選「源語系」（翻譯社的參考欄）與「target 語系」（翻譯社要填的欄）。
 *   2. 可選「只匯出未翻譯」或「整份」，是否帶 description。
 *   3. 按確認 → 用 SheetJS 組 workbook，每個 target 一個 sheet，下載 .xlsx。
 */

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { LocaleFlag } from "@/components/LocaleFlag";
import { findPreset } from "@/lib/localePresets";
import { Building2, FileSpreadsheet, Languages } from "lucide-react";
import { toast } from "sonner";
import {
  buildAgencyWorkbook,
  type ExportRow,
} from "@/lib/agencyXlsx";

function localeChineseName(locale: { code: string; name?: string; nativeName?: string }) {
  const preset = findPreset(locale.code);
  if (preset) return preset.name;
  return locale.name || locale.nativeName || locale.code;
}

function downloadBuffer(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface AgencyExportLocale {
  code: string;
  name: string;
  nativeName?: string;
}

export interface AgencyExportKey {
  id: number;
  keyPath: string;
  description?: string | null;
  /** localeCode → { value, isTranslated } */
  translations: Record<
    string,
    { value: string | null; isTranslated: boolean }
  >;
}

export interface ExportForAgencyModalProps {
  open: boolean;
  onClose: () => void;
  projectName: string;
  locales: AgencyExportLocale[];
  /** 已套用搜尋 / 版本篩選後的 keys（與目前畫面一致） */
  keys: AgencyExportKey[];
}

export default function ExportForAgencyModal({
  open,
  onClose,
  projectName,
  locales,
  keys,
}: ExportForAgencyModalProps) {
  const [sourceLocale, setSourceLocale] = useState<string>("zh-TW");
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());
  const [onlyUntranslated, setOnlyUntranslated] = useState(false);
  const [includeDescription, setIncludeDescription] = useState(true);

  // 預設源語系：優先 zh-TW、否則第一個
  useEffect(() => {
    if (!open) return;
    const def = locales.find((l) => l.code === "zh-TW") ?? locales[0];
    if (def) setSourceLocale(def.code);
  }, [open, locales]);

  // 預設 targets = 全部除了 source
  useEffect(() => {
    if (!open) return;
    const next = new Set(
      locales.filter((l) => l.code !== sourceLocale).map((l) => l.code)
    );
    setSelectedTargets(next);
  }, [open, sourceLocale, locales]);

  const targetLocales = useMemo(
    () => locales.filter((l) => l.code !== sourceLocale),
    [locales, sourceLocale]
  );

  function toggleTarget(code: string, checked: boolean) {
    setSelectedTargets((prev) => {
      const next = new Set(prev);
      if (checked) next.add(code);
      else next.delete(code);
      return next;
    });
  }

  function selectAllTargets(check: boolean) {
    if (check) {
      setSelectedTargets(new Set(targetLocales.map((l) => l.code)));
    } else {
      setSelectedTargets(new Set());
    }
  }

  // 估算每個 target 會匯出幾筆
  const targetCounts = useMemo(() => {
    const m = new Map<string, { total: number; untranslated: number }>();
    for (const t of targetLocales) {
      let untrans = 0;
      for (const k of keys) {
        const cell = k.translations[t.code];
        if (!cell?.isTranslated) untrans++;
      }
      m.set(t.code, { total: keys.length, untranslated: untrans });
    }
    return m;
  }, [keys, targetLocales]);

  function handleExport() {
    if (selectedTargets.size === 0) {
      toast.error("至少選一個 target 語系");
      return;
    }
    const sourceLocaleObj = locales.find((l) => l.code === sourceLocale);
    if (!sourceLocaleObj) {
      toast.error("請先選擇源語系");
      return;
    }

    const targets = Array.from(selectedTargets).map((tcode) => {
      const t = targetLocales.find((x) => x.code === tcode)!;
      const rows: ExportRow[] = keys.map((k) => ({
        keyPath: k.keyPath,
        sourceValue: k.translations[sourceLocale]?.value ?? "",
        targetValue: k.translations[t.code]?.value ?? "",
        description: k.description ?? undefined,
        isTranslated: !!k.translations[t.code]?.isTranslated,
      }));
      return {
        code: t.code,
        label: localeChineseName(t),
        rows,
      };
    });

    try {
      const { filename, buffer } = buildAgencyWorkbook({
        projectName,
        sourceLocale,
        sourceLocaleLabel: localeChineseName(sourceLocaleObj),
        targets,
        onlyUntranslated,
        includeDescription,
      });
      downloadBuffer(buffer, filename);
      toast.success(`已匯出 ${selectedTargets.size} 個語系的 ${filename}`);
      onClose();
    } catch (e: any) {
      toast.error(`匯出失敗：${e?.message ?? e}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            匯出翻譯社 Excel
          </DialogTitle>
          <DialogDescription>
            產一個 .xlsx，每個 target 語系一個 sheet。源語系的值會放在每個 sheet 的「源」欄供翻譯社參考。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 源語系 */}
          <div className="grid grid-cols-[100px_1fr] items-center gap-3">
            <Label className="m-0">源語系</Label>
            <Select value={sourceLocale} onValueChange={setSourceLocale}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="選擇源語系…" />
              </SelectTrigger>
              <SelectContent>
                {locales.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    <span className="flex items-center gap-2">
                      <LocaleFlag code={l.code} size="sm" />
                      <span className="font-medium">
                        {localeChineseName(l)}
                      </span>
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {l.code}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Target 多選 */}
          <div className="grid grid-cols-[100px_1fr] items-start gap-3">
            <Label className="m-0 pt-1.5">Target 語系</Label>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Languages className="h-3.5 w-3.5 text-muted-foreground" />
                <Badge variant="secondary" className="text-[10px]">
                  已選 {selectedTargets.size} / {targetLocales.length}
                </Badge>
                <div className="flex-1" />
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => selectAllTargets(true)}
                >
                  全選
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:underline"
                  onClick={() => selectAllTargets(false)}
                >
                  全不選
                </button>
              </div>
              <div className="border rounded-md max-h-44 overflow-y-auto divide-y">
                {targetLocales.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3">
                    沒有可選的 target 語系（先去語系管理啟用）
                  </p>
                ) : (
                  targetLocales.map((l) => {
                    const counts = targetCounts.get(l.code) ?? {
                      total: 0,
                      untranslated: 0,
                    };
                    const willExport = onlyUntranslated
                      ? counts.untranslated
                      : counts.total;
                    return (
                      <label
                        key={l.code}
                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={selectedTargets.has(l.code)}
                          onCheckedChange={(v) =>
                            toggleTarget(l.code, v === true)
                          }
                        />
                        <LocaleFlag code={l.code} size="sm" />
                        <span className="font-medium flex-1 truncate">
                          {localeChineseName(l)}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {l.code}
                        </span>
                        <span className="text-[11px] text-muted-foreground tabular-nums w-20 text-right">
                          匯 {willExport} / 共 {counts.total}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* 選項 */}
          <div className="grid grid-cols-[100px_1fr] items-start gap-3">
            <Label className="m-0 pt-0.5">選項</Label>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={onlyUntranslated}
                  onCheckedChange={(v) => setOnlyUntranslated(v === true)}
                />
                <span>只匯出 target 未翻譯的列</span>
                <span className="text-[11px] text-muted-foreground">
                  （已翻譯的會跳過，翻譯社拿到的檔比較精）
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={includeDescription}
                  onCheckedChange={(v) => setIncludeDescription(v === true)}
                />
                <span>含 Description（key 說明）欄</span>
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={handleExport}
            disabled={selectedTargets.size === 0 || keys.length === 0}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
            匯出 .xlsx
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
