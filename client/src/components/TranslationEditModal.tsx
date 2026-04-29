import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Locale {
  id: number;
  code: string;
  name: string;
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
}

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
}: TranslationEditModalProps) {
  const [editValues, setEditValues] = React.useState<Record<string, string>>(translations);
  const latestHandleSaveRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    setEditValues(translations);
  }, [translations, isOpen]);

  const handleSave = React.useCallback(() => {
    onSave(editValues);
    onClose();
  }, [onSave, editValues, onClose]);

  // 保持 handleSave 的最新引用
  latestHandleSaveRef.current = handleSave;

  // 暴露 handleSave 給外部調用（用於鍵盤快速鍵）
  React.useEffect(() => {
    if (onSaveRef) {
      onSaveRef.current = isOpen ? () => latestHandleSaveRef.current?.() : null;
    }
  }, [isOpen, onSaveRef]);

  const hasChanges = Object.entries(editValues).some(
    ([locale, value]) => value !== translations[locale]
  );

  // 支援 Ctrl+S 在 Modal 內保存
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
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm text-muted-foreground break-all">
            {keyPath}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {locales.map((locale) => (
            <div key={locale.code} className="space-y-2">
              <Label className="flex items-center gap-2">
                <span className="font-semibold">{locale.name}</span>
                <span className="text-xs text-muted-foreground">({locale.code})</span>
              </Label>
              <Textarea
                value={editValues[locale.code] ?? ""}
                onChange={(e) =>
                  setEditValues((prev) => ({
                    ...prev,
                    [locale.code]: e.target.value,
                  }))
                }
                placeholder={`輸入 ${locale.name} 翻譯...`}
                className="min-h-24 font-mono text-sm resize-vertical"
              />
              {editValues[locale.code] !== translations[locale.code] && (
                <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                  原文：{translations[locale.code] || "（空）"}
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || isSaving} className="gap-2">
            {isSaving ? "保存中..." : "保存 (Ctrl+S)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
