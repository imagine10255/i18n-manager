import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, RefreshCw } from "lucide-react";

/**
 * Suggest a version number in `YY.MM.W.N` format:
 *   YY  = year, last 2 digits
 *   MM  = month (1–12, no padding)
 *   W   = week of the month (ceil(day / 7), so 1–5)
 *   N   = iteration count for this YY.MM.W prefix in existing versions (default 1)
 */
function suggestNextVersionNumber(
  existing: Array<{ versionNumber: string }>,
  now: Date = new Date()
): string {
  const yy = String(now.getFullYear() % 100).padStart(2, "0");
  const mm = String(now.getMonth() + 1);
  const w = String(Math.ceil(now.getDate() / 7));
  const prefix = `${yy}.${mm}.${w}.`;
  const used = existing
    .map((v) => v.versionNumber)
    .filter((s) => s.startsWith(prefix))
    .map((s) => parseInt(s.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n));
  const next = used.length === 0 ? 1 : Math.max(...used) + 1;
  return `${prefix}${next}`;
}

interface VersionSelectModalProps {
  isOpen: boolean;
  projectId?: number;
  existingVersions: Array<{ id: number; versionNumber: string }>;
  /**
   * Called when the user confirms. Receives both the version id (for binding
   * translations to the version) and the human version number (for toasts).
   */
  onConfirm: (versionId: number, versionNumber: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
  onVersionCreated?: () => void;
}

export default function VersionSelectModal({
  isOpen,
  projectId,
  existingVersions,
  onConfirm,
  onCancel,
  isLoading = false,
  onVersionCreated,
}: VersionSelectModalProps) {
  const [mode, setMode] = useState<"select" | "new">("select");
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [newVersionNumber, setNewVersionNumber] = useState("");
  const utils = trpc.useUtils();

  const suggested = useMemo(
    () => suggestNextVersionNumber(existingVersions),
    [existingVersions, isOpen]
  );

  // Pre-fill on open: prefer "select" mode (with the newest version pre-picked)
  // when there are existing versions; otherwise drop into "new" mode with the
  // auto-suggested version number. Reset everything on close.
  useEffect(() => {
    if (isOpen) {
      // Auto-route mode based on whether existing versions are available —
      // only on first open while still at our reset defaults.
      if (existingVersions.length === 0 && mode === "select") {
        setMode("new");
      }

      if (mode === "new" && !newVersionNumber) {
        setNewVersionNumber(suggested);
      }
      if (
        mode === "select" &&
        !selectedVersionId &&
        existingVersions.length > 0
      ) {
        setSelectedVersionId(existingVersions[0].id.toString());
      }
    } else {
      setNewVersionNumber("");
      setSelectedVersionId("");
      // Reset to the preferred default — will auto-flip to "new" on next open
      // if there are no existing versions.
      setMode("select");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode, suggested, existingVersions]);

  const createVersionMutation = trpc.translationVersion.create.useMutation({
    onSuccess: () => {
      toast.success("版本建立成功");
      if (projectId) {
        utils.translationVersion.listByProject.invalidate({ projectId });
      }
      onVersionCreated?.();
      setNewVersionNumber("");
    },
    onError: (error) => {
      toast.error(`版本建立失敗: ${error.message}`);
    },
  });

  const handleConfirm = async () => {
    if (mode === "select") {
      const selected = existingVersions.find(
        (v) => v.id.toString() === selectedVersionId
      );
      if (selected) {
        onConfirm(selected.id, selected.versionNumber);
      }
    } else {
      if (newVersionNumber.trim() && projectId) {
        const result = await createVersionMutation.mutateAsync({
          projectId,
          versionNumber: newVersionNumber.trim(),
          description: "",
        });
        onConfirm(result.id, newVersionNumber.trim());
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>選擇或建立版本號</DialogTitle>
          <DialogDescription>
            選擇現有版本號或建立新版本號來標識此次匯出
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 模式選擇 */}
          <div className="flex gap-4">
            <Button
              variant={mode === "select" ? "default" : "outline"}
              onClick={() => setMode("select")}
              className="flex-1"
            >
              選擇現有版本
            </Button>
            <Button
              variant={mode === "new" ? "default" : "outline"}
              onClick={() => setMode("new")}
              className="flex-1"
            >
              建立新版本
            </Button>
          </div>

          {/* 選擇現有版本 */}
          {mode === "select" && (
            <div className="space-y-2">
              <Label>版本號</Label>
              {existingVersions.length > 0 ? (
                <Select value={selectedVersionId} onValueChange={setSelectedVersionId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="選擇版本..." />
                  </SelectTrigger>
                  <SelectContent>
                    {existingVersions.map((version) => (
                      <SelectItem key={version.id} value={version.id.toString()}>
                        {version.versionNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-sm text-muted-foreground p-2 border rounded bg-muted/50">
                  尚無現有版本，請建立新版本
                </div>
              )}
            </div>
          )}

          {/* 建立新版本 */}
          {mode === "new" && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                版本號
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary font-semibold">
                  <Sparkles className="h-3 w-3" />
                  自動建議
                </span>
              </Label>
              <div className="relative">
                <Input
                  placeholder="例如：26.4.5.1"
                  value={newVersionNumber}
                  onChange={(e) => setNewVersionNumber(e.target.value)}
                  className="pr-9 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setNewVersionNumber(suggested)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="重新產生建議版本號"
                  aria-label="重新產生版本號"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                格式{" "}
                <code className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">
                  YY.MM.W.N
                </code>
                ：年（後兩位）· 月 · 該月第幾週 · 同週第幾版。可手動修改。
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isLoading || createVersionMutation.isPending}>
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              isLoading ||
              createVersionMutation.isPending ||
              (mode === "select" && !selectedVersionId) ||
              (mode === "new" && !newVersionNumber.trim())
            }
          >
            確認
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
