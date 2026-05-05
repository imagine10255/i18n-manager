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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Settings2, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { LocaleFlag } from "./LocaleFlag";
import { findPreset } from "@/lib/localePresets";

interface ProjectSettingsModalProps {
  open: boolean;
  projectId: number | null;
  onClose: () => void;
}

function localeChineseName(locale: { code: string; name?: string | null; nativeName?: string | null }) {
  // 使用者在 DB 設定的 name 優先；沒填才退回 preset / nativeName / code
  return locale.name || findPreset(locale.code)?.name || locale.nativeName || locale.code;
}

export default function ProjectSettingsModal({
  open,
  projectId,
  onClose,
}: ProjectSettingsModalProps) {
  const utils = trpc.useUtils();
  const projectQuery = trpc.project.get.useQuery(
    { id: projectId ?? 0 },
    { enabled: open && projectId !== null }
  );
  const localesQuery = trpc.locale.list.useQuery();
  const updateMutation = trpc.project.update.useMutation({
    onSuccess: () => {
      toast.success("專案設定已更新");
      // 一次 invalidate 整個 project namespace（list / listAll / get 一起重抓）
      utils.project.invalidate();
      onClose();
    },
    onError: (e) => toast.error(`更新失敗：${e.message}`),
  });
  const deleteMutation = trpc.project.delete.useMutation({
    onSuccess: () => {
      toast.success("專案已刪除");
      utils.project.invalidate();
      onClose();
    },
    onError: (e) => toast.error(`刪除失敗：${e.message}`),
  });
  const [deleteOpen, setDeleteOpen] = useState(false);

  const project = projectQuery.data as any;
  const allLocales = (localesQuery.data ?? []) as any[];

  // Initial selection — empty array means "use all" (no whitelist)
  const initialSelection = useMemo<string[] | null>(() => {
    if (!project?.allowedLocaleCodes) return null;
    try {
      const parsed = JSON.parse(project.allowedLocaleCodes);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }, [project?.allowedLocaleCodes]);

  const [allMode, setAllMode] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Sync from server when the modal opens / project loads
  useEffect(() => {
    if (open && project) {
      setName(project.name ?? "");
      setDescription(project.description ?? "");
      if (initialSelection === null) {
        setAllMode(true);
        setSelected(new Set());
      } else {
        setAllMode(false);
        setSelected(new Set(initialSelection));
      }
    }
  }, [open, project, initialSelection]);

  const toggle = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleSave = () => {
    if (!projectId) return;
    if (!name.trim()) {
      toast.error("專案名稱不能為空");
      return;
    }
    updateMutation.mutate({
      id: projectId,
      name: name.trim(),
      description: description.trim() || undefined,
      allowedLocaleCodes: allMode ? null : Array.from(selected),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            專案設定
          </DialogTitle>
          <DialogDescription>
            {project?.name ? (
              <>
                <span className="font-medium text-foreground">{project.name}</span>
                <span className="ml-2">— 控制這個專案開放哪些語系</span>
              </>
            ) : (
              "控制這個專案開放哪些語系"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Project basics — name + description */}
          <div className="space-y-3">
            <div>
              <Label htmlFor="project-name" className="text-xs">
                專案名稱 *
              </Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：gameStream"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="project-desc" className="text-xs">
                描述（選填）
              </Label>
              <Textarea
                id="project-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="專案描述、用途、所屬團隊…"
                rows={2}
                className="mt-1"
              />
            </div>
          </div>

          {/* Locale whitelist */}
          <div className="pt-3 border-t border-border/60 space-y-3">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              可用語系
            </Label>
          {/* Mode toggle: all vs subset */}
          <div className="flex gap-2">
            <Button
              variant={allMode ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setAllMode(true)}
            >
              全部語系
            </Button>
            <Button
              variant={!allMode ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setAllMode(false)}
            >
              指定語系
            </Button>
          </div>

          {!allMode && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                勾選此專案要開放的語系
              </Label>
              <div className="rounded-lg border border-border/60 max-h-[320px] overflow-y-auto scrollbar-elegant divide-y divide-border/60">
                {allLocales.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    尚未設定任何語系
                  </div>
                ) : (
                  allLocales.map((locale: any) => {
                    const checked = selected.has(locale.code);
                    return (
                      <label
                        key={locale.id}
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                          checked ? "bg-primary/5" : "hover:bg-muted/40"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(locale.code)}
                          className="h-4 w-4 accent-primary"
                        />
                        <LocaleFlag code={locale.code} size="sm" />
                        <span className="text-sm font-medium">
                          {localeChineseName(locale)}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono ml-auto">
                          {locale.code}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              {!allMode && selected.size === 0 && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  目前沒勾選任何語系。儲存後此專案會被視為「無可用語系」。
                </p>
              )}
            </div>
          )}

          {allMode && (
            <p className="text-xs text-muted-foreground rounded-md bg-muted px-3 py-2">
              此專案會自動使用所有「啟用中」的語系。新增語系時也會自動納入。
            </p>
          )}
          </div>

          {/* Danger zone — 刪除專案（軟刪除：只是把 isActive 設成 false） */}
          {projectId !== null && (
            <div className="pt-3 border-t border-destructive/30 space-y-2">
              <Label className="text-xs uppercase tracking-wider text-destructive font-semibold">
                危險區
              </Label>
              <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                <div className="text-xs text-muted-foreground">
                  刪除後此專案會從列表隱藏，但歷史紀錄與翻譯資料保留，之後可再復原。
                </div>
                <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-1.5 shrink-0"
                      disabled={deleteMutation.isPending || updateMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      刪除專案
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>確定要刪除此專案？</AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-2 text-sm text-muted-foreground">
                          <div>
                            <span className="font-medium text-foreground">
                              {project?.name}
                            </span>{" "}
                            將從列表隱藏。
                          </div>
                          <div>
                            這是<span className="font-medium">軟刪除</span>，不會清除底下的
                            translationKeys / translations / history / snapshots /
                            exports / versions。之後若想復原，可由資料庫把
                            isActive 改回 true。
                          </div>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={deleteMutation.isPending}>
                        取消
                      </AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={deleteMutation.isPending}
                        onClick={(e) => {
                          // 阻止 Radix 預設的 close-on-action，等 mutation 完成再關
                          e.preventDefault();
                          if (!projectId) return;
                          deleteMutation.mutate(
                            { id: projectId },
                            { onSettled: () => setDeleteOpen(false) }
                          );
                        }}
                      >
                        {deleteMutation.isPending ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                            刪除中…
                          </>
                        ) : (
                          "確定刪除"
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={updateMutation.isPending}
          >
            取消
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || projectQuery.isLoading}
            className="gap-2"
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                儲存中…
              </>
            ) : (
              "儲存"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
