import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Library, Link2, Loader2, Unlink } from "lucide-react";
import { LocaleFlag } from "./LocaleFlag";
import LinkSharedKeyPopover from "./LinkTemplateKeyPopover";
import { findPreset } from "@/lib/localePresets";

interface Locale {
  id: number;
  code: string;
  name: string;
  nativeName?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface TranslationEditModalProps {
  isOpen: boolean;
  keyPath: string;
  keyId: number;
  locales: Locale[];
  translations: Record<string, string>;
  onClose: () => void;
  onSave: (updates: Record<string, string>) => void;
  isSaving?: boolean;
  onSaveRef?: React.MutableRefObject<(() => void) | null>;
  /** 此 key 已引用的 sharedKeyId（沒引用 = null/undefined） */
  sharedKeyId?: number | null;
  /** 已引用時的公版 keyPath，用來顯示 */
  sharedKeyPath?: string | null;
  /** 解除引用（caller 提供 — 通常是 unlinkSharedMutation） */
  onUnlinkShared?: () => void;
  canEdit?: boolean;
}

const LOCALE_FLAGS: Record<string, string> = {
  "zh-TW": "🇹🇼",
  "zh-CN": "🇨🇳",
  en: "🇺🇸",
  "en-US": "🇺🇸",
  ja: "🇯🇵",
  ko: "🇰🇷",
  fr: "🇫🇷",
  de: "🇩🇪",
  es: "🇪🇸",
  pt: "🇵🇹",
  ru: "🇷🇺",
  vi: "🇻🇳",
  th: "🇹🇭",
  id: "🇮🇩",
  it: "🇮🇹",
  nl: "🇳🇱",
  pl: "🇵🇱",
  tr: "🇹🇷",
  ar: "🇸🇦",
};

export default function TranslationEditModal({
  isOpen,
  keyPath,
  keyId,
  locales,
  translations,
  onClose,
  onSave,
  isSaving = false,
  onSaveRef,
  sharedKeyId,
  sharedKeyPath,
  onUnlinkShared,
  canEdit = true,
}: TranslationEditModalProps) {
  const isLinked = sharedKeyId != null;
  const [editValues, setEditValues] = React.useState<Record<string, string>>(
    translations
  );
  const latestHandleSaveRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    setEditValues(translations);
  }, [translations, isOpen]);

  const handleSave = React.useCallback(() => {
    onSave(editValues);
    onClose();
  }, [onSave, editValues, onClose]);

  latestHandleSaveRef.current = handleSave;

  React.useEffect(() => {
    if (onSaveRef) {
      onSaveRef.current = isOpen
        ? () => latestHandleSaveRef.current?.()
        : null;
    }
  }, [isOpen, onSaveRef]);

  const changedCodes = React.useMemo(
    () =>
      Object.entries(editValues)
        .filter(([code, value]) => value !== translations[code])
        .map(([code]) => code),
    [editValues, translations]
  );
  const hasChanges = changedCodes.length > 0;

  // Filled stats
  const filledCount = locales.filter((l) => (editValues[l.code] ?? "").trim()).length;

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (hasChanges && latestHandleSaveRef.current) {
          latestHandleSaveRef.current();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, hasChanges]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="!max-w-6xl w-[min(96vw,1200px)] max-h-[88vh] overflow-hidden flex flex-col p-0 gap-0"
      >
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-border/60 bg-muted/30">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                Key
              </div>
              <DialogTitle className="font-mono text-base font-semibold break-all leading-snug">
                {keyPath}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2 shrink-0 mt-1">
              <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-card border border-border/70 text-xs">
                <CheckCircle2
                  className={`h-3.5 w-3.5 ${
                    filledCount === locales.length
                      ? "text-emerald-500"
                      : "text-muted-foreground"
                  }`}
                />
                <span className="tabular-nums font-medium">
                  {filledCount} / {locales.length}
                </span>
                <span className="text-muted-foreground">已填</span>
              </span>
              {hasChanges && (
                <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-300 text-xs font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  {changedCodes.length} 項待保存
                </span>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* 公版引用狀態 banner */}
        {isLinked ? (
          <div className="px-6 py-2.5 border-b border-border/60 bg-primary/[0.04] flex items-center gap-2 text-xs">
            <Library className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-foreground/90">
              已引用公版字典：
            </span>
            <code className="font-mono font-medium break-all flex-1 min-w-0">
              {sharedKeyPath ?? `#${sharedKeyId}`}
            </code>
            <span
              className="inline-flex items-center gap-0.5 shrink-0 px-1.5 py-0 rounded text-[10px] font-medium bg-primary/15 text-primary border border-primary/30"
              title="此 Key 引用自公版字典；編輯值會同步到所有引用此 key 的專案"
            >
              公版
            </span>
            {canEdit && onUnlinkShared && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive hover:bg-destructive/10 ml-1"
                onClick={() => {
                  if (
                    confirm(
                      `解除「${keyPath}」的公版引用？目前的值會被保留至專案內，後續公版字典更動將不再同步至此 key。`
                    )
                  ) {
                    onUnlinkShared();
                    onClose();
                  }
                }}
              >
                <Unlink className="h-3.5 w-3.5 mr-1" />
                解除引用
              </Button>
            )}
          </div>
        ) : (
          canEdit && (
            <div className="px-6 py-2.5 border-b border-border/60 bg-muted/30 flex items-center gap-2 text-xs">
              <Library className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground flex-1">
                未引用公版字典 — 點右側可以從公版選一條 key 引用上來，多個專案就能共用
              </span>
              <LinkSharedKeyPopover
                projectKeyId={keyId}
                keyPath={keyPath}
                linkedSharedKeyId={null}
                onLinked={onClose}
              />
              <span className="text-[11px] text-muted-foreground">
                引用公版
              </span>
            </div>
          )
        )}

        {/* Locale grid (scrolls) */}
        <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-elegant">
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {locales.map((locale) => {
              const value = editValues[locale.code] ?? "";
              const original = translations[locale.code] ?? "";
              const changed = value !== original;
              const filled = !!value.trim();
              return (
                <div
                  key={locale.code}
                  className={`rounded-lg border p-3 transition-colors ${
                    changed
                      ? "border-amber-500/50 bg-amber-500/[0.04]"
                      : "border-border/70 bg-card"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Label className="flex items-center gap-2 cursor-pointer">
                      <LocaleFlag code={locale.code} size="md" />
                      <span className="text-sm font-medium truncate">
                        {locale.name || findPreset(locale.code)?.name || locale.nativeName}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {locale.code}
                      </span>
                    </Label>
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 rounded-full ${
                        changed
                          ? "bg-amber-500 animate-pulse"
                          : filled
                            ? "bg-emerald-500"
                            : "bg-border"
                      }`}
                    />
                  </div>

                  <Textarea
                    value={value}
                    onChange={(e) =>
                      setEditValues((prev) => ({
                        ...prev,
                        [locale.code]: e.target.value,
                      }))
                    }
                    placeholder={`輸入 ${locale.name} 翻譯…`}
                    className={`min-h-[88px] text-sm resize-vertical bg-input border ${
                      changed ? "border-amber-500/50" : "border-border"
                    } focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 transition-colors`}
                  />

                  {changed && original && (
                    <div className="mt-2 text-[11px] text-muted-foreground border-l-2 border-amber-500/40 pl-2 line-clamp-2">
                      原文：{original}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-3 border-t border-border/60 bg-muted/20 flex items-center justify-between sm:justify-between gap-2">
          <div className="hidden sm:block text-xs text-muted-foreground">
            ⌘<kbd className="font-mono px-1">S</kbd> 保存 · Esc 取消
          </div>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={onClose} disabled={isSaving}>
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="gap-2 min-w-[120px]"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  保存中…
                </>
              ) : (
                `保存${hasChanges ? ` (${changedCodes.length})` : ""}`
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
