import { useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import CreateProjectModal from "@/components/CreateProjectModal";
import ProjectSettingsModal from "@/components/ProjectSettingsModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  Folder,
  FolderOpen,
  Loader2,
  MoreVertical,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Shield,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

type ProjectRow = {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  allowedLocaleCodes: string | null;
  createdAt: string | Date;
};

/** 把 allowedLocaleCodes（JSON 字串陣列）轉成顯示文字 */
function describeAllowedLocales(raw: string | null): string {
  if (!raw) return "全部語系";
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return "全部語系";
    return `${parsed.length} 個指定語系`;
  } catch {
    return "全部語系";
  }
}

export default function ProjectManager() {
  const { user } = useAuth();
  const isAdmin = (user as { role?: string })?.role === "admin";

  const utils = trpc.useUtils();
  const projectsQuery = trpc.project.listAll.useQuery(undefined, {
    enabled: isAdmin,
  });

  const [showCreate, setShowCreate] = useState(false);
  const [settingsId, setSettingsId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<ProjectRow | null>(null);
  const [restoring, setRestoring] = useState<ProjectRow | null>(null);
  const [hardDeleting, setHardDeleting] = useState<ProjectRow | null>(null);
  const [hardConfirmText, setHardConfirmText] = useState("");
  const [search, setSearch] = useState("");

  const deleteMutation = trpc.project.delete.useMutation({
    onSuccess: () => {
      toast.success("專案已刪除");
      utils.project.invalidate();
    },
    onError: (e) => toast.error(`刪除失敗：${e.message}`),
    onSettled: () => setDeleting(null),
  });
  const restoreMutation = trpc.project.restore.useMutation({
    onSuccess: () => {
      toast.success("專案已復原");
      utils.project.invalidate();
    },
    onError: (e) => toast.error(`復原失敗：${e.message}`),
    onSettled: () => setRestoring(null),
  });
  const hardDeleteMutation = trpc.project.hardDelete.useMutation({
    onSuccess: () => {
      toast.success("專案及底下所有資料已永久刪除");
      utils.project.invalidate();
    },
    onError: (e) => toast.error(`永久刪除失敗：${e.message}`),
    onSettled: () => {
      setHardDeleting(null);
      setHardConfirmText("");
    },
  });

  const projects = (projectsQuery.data ?? []) as ProjectRow[];

  // 簡單前端 filter — 規模不大，不用打 API
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false)
    );
  }, [projects, search]);

  const activeCount = projects.filter((p) => p.isActive).length;
  const inactiveCount = projects.length - activeCount;

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground">此頁面僅限 Admin 存取</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="w-full space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">專案管理</h1>
            <p className="text-sm text-muted-foreground mt-1">
              管理所有翻譯專案，包含已停用 / 軟刪除的項目
            </p>
          </div>
          <Button
            onClick={() => setShowCreate(true)}
            size="sm"
            className="gap-2 shrink-0"
          >
            <Plus className="h-4 w-4" />
            新增專案
          </Button>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatTile
            icon={FolderOpen}
            label="啟用中"
            value={activeCount}
            tone="active"
          />
          <StatTile
            icon={Folder}
            label="已停用"
            value={inactiveCount}
            tone="inactive"
          />
          <StatTile
            icon={Folder}
            label="總計"
            value={projects.length}
            tone="muted"
          />
        </div>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4 space-y-0">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Folder className="h-4 w-4 text-primary" />
              專案列表
              <Badge variant="secondary" className="ml-1">
                {filtered.length}
              </Badge>
            </CardTitle>
            <div className="relative w-64 max-w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜尋名稱或描述…"
                className="h-8 pl-8 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            {projectsQuery.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-3">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-64" />
                    </div>
                    <Skeleton className="h-8 w-20" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center">
                <Folder className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {search.trim() ? "沒有符合的專案" : "尚未建立任何專案"}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map((project) => {
                  const inactive = !project.isActive;
                  return (
                    <div
                      key={project.id}
                      className={`flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/30 transition-colors group ${
                        inactive ? "opacity-60" : ""
                      }`}
                    >
                      <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 bg-primary/10 text-primary">
                        <Folder className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">
                            {project.name}
                          </span>
                          {inactive && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-700 dark:text-amber-300"
                            >
                              已停用
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 text-muted-foreground"
                          >
                            {describeAllowedLocales(project.allowedLocaleCodes)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {project.description?.trim() || "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="hidden sm:block w-24 text-right text-xs text-muted-foreground tabular-nums">
                          {new Date(project.createdAt).toLocaleDateString(
                            "zh-TW"
                          )}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-colors"
                              aria-label="更多動作"
                              title="更多動作"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              onClick={() => setSettingsId(project.id)}
                              className="cursor-pointer"
                            >
                              <Settings2 className="h-4 w-4 mr-2" />
                              專案設定
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {inactive ? (
                              <>
                                <DropdownMenuItem
                                  onClick={() => setRestoring(project)}
                                  className="cursor-pointer text-emerald-700 dark:text-emerald-400 focus:text-emerald-700"
                                >
                                  <RotateCcw className="h-4 w-4 mr-2" />
                                  復原
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    setHardConfirmText("");
                                    setHardDeleting(project);
                                  }}
                                  className="cursor-pointer text-destructive focus:text-destructive"
                                >
                                  <AlertTriangle className="h-4 w-4 mr-2" />
                                  永久刪除
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => setDeleting(project)}
                                className="cursor-pointer text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                刪除
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 新增專案 modal */}
      <CreateProjectModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
      />

      {/* 設定 modal — 只在有 settingsId 時 mount */}
      <ProjectSettingsModal
        open={settingsId !== null}
        projectId={settingsId}
        onClose={() => setSettingsId(null)}
      />

      {/* 刪除確認 */}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定要刪除此專案？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">
                    {deleting?.name}
                  </span>{" "}
                  將從一般使用者的列表隱藏。
                </div>
                <div>
                  這是<span className="font-medium">軟刪除</span>，底下的
                  translationKeys / translations / history / snapshots /
                  exports / versions 全部保留。之後可在此頁面點「復原」把它叫回來。
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
                e.preventDefault();
                if (!deleting) return;
                deleteMutation.mutate({ id: deleting.id });
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

      {/* 復原確認 */}
      <AlertDialog
        open={restoring !== null}
        onOpenChange={(o) => !o && setRestoring(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>復原此專案？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {restoring?.name}
                </span>{" "}
                會重新出現在編輯器與一般使用者的列表中。底下的翻譯資料本來就沒被刪掉，會立刻可用。
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoreMutation.isPending}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={restoreMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!restoring) return;
                restoreMutation.mutate({ id: restoring.id });
              }}
            >
              {restoreMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  復原中…
                </>
              ) : (
                "確定復原"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 永久刪除確認 — 比軟刪除更嚴格，必須輸入專案名稱 */}
      <AlertDialog
        open={hardDeleting !== null}
        onOpenChange={(o) => {
          if (!o) {
            setHardDeleting(null);
            setHardConfirmText("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              永久刪除此專案？
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div>
                  即將永久刪除{" "}
                  <span className="font-medium text-foreground">
                    {hardDeleting?.name}
                  </span>{" "}
                  以及底下所有相關資料：
                </div>
                <ul className="list-disc pl-5 space-y-0.5 text-xs">
                  <li>所有 translationKeys</li>
                  <li>所有 translations（多語系內容）</li>
                  <li>所有修改歷程 (translationHistory)</li>
                  <li>所有版本快照 (translationSnapshots)</li>
                  <li>所有版本紀錄 (translationVersions)</li>
                  <li>所有匯出紀錄 (translationExports)</li>
                </ul>
                <div className="text-destructive font-medium">
                  此動作無法復原。
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="hard-confirm" className="text-xs">
              請輸入專案名稱{" "}
              <span className="font-mono font-semibold text-foreground">
                {hardDeleting?.name}
              </span>{" "}
              以確認：
            </Label>
            <Input
              id="hard-confirm"
              value={hardConfirmText}
              onChange={(e) => setHardConfirmText(e.target.value)}
              placeholder={hardDeleting?.name ?? ""}
              autoComplete="off"
              disabled={hardDeleteMutation.isPending}
              className="font-mono text-sm"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={hardDeleteMutation.isPending}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={
                hardDeleteMutation.isPending ||
                hardConfirmText !== (hardDeleting?.name ?? "")
              }
              onClick={(e) => {
                e.preventDefault();
                if (!hardDeleting) return;
                if (hardConfirmText !== hardDeleting.name) return;
                hardDeleteMutation.mutate({ id: hardDeleting.id });
              }}
            >
              {hardDeleteMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  刪除中…
                </>
              ) : (
                "永久刪除"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  tone: "active" | "inactive" | "muted";
}) {
  const toneClass =
    tone === "active"
      ? "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10"
      : tone === "inactive"
        ? "text-amber-700 dark:text-amber-300 bg-amber-500/10"
        : "text-muted-foreground bg-muted";
  return (
    <div className="p-3 rounded-xl border border-border/60 bg-card flex items-center gap-3">
      <div
        className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${toneClass}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums leading-tight">
          {value}
        </p>
      </div>
    </div>
  );
}
