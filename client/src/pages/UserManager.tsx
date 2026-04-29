import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import {
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Shield,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const ROLES = [
  { value: "admin", label: "Admin", desc: "完整管理權限" },
  { value: "editor", label: "Editor", desc: "可新增/編輯翻譯" },
  { value: "rd", label: "RD", desc: "唯讀，查看翻譯與歷程" },
  { value: "qa", label: "QA", desc: "唯讀，查看翻譯與歷程" },
] as const;

type Role = (typeof ROLES)[number]["value"];

const ROLE_COLORS: Record<string, string> = {
  admin: "role-admin",
  editor: "role-editor",
  rd: "role-rd",
  qa: "role-qa",
};

type UserForm = {
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  password: string;
};

const EMPTY_FORM: UserForm = {
  name: "",
  email: "",
  role: "rd",
  isActive: true,
  password: "",
};

export default function UserManager() {
  const { } = useAuth();
  const { data: currentUser } = trpc.auth.me.useQuery();
  const userRole = (currentUser as { role?: string })?.role ?? "rd";
  const isAdmin = userRole === "admin";

  const { data: users, isLoading } = trpc.user.list.useQuery(undefined, {
    enabled: isAdmin,
  });

  const utils = trpc.useUtils();
  const updateRoleMutation = trpc.user.updateRole.useMutation({
    onSuccess: () => {
      toast.success("角色已更新");
      utils.user.list.invalidate();
    },
    onError: (e: any) => toast.error(`更新失敗：${e.message}`),
  });

  const updateMutation = trpc.user.update.useMutation({
    onSuccess: () => {
      toast.success("使用者已更新");
      utils.user.list.invalidate();
      utils.user.listBasic.invalidate();
      setEditing(null);
    },
    onError: (e: any) => toast.error(`更新失敗：${e.message}`),
  });

  const deleteMutation = trpc.user.delete.useMutation({
    onSuccess: () => {
      toast.success("使用者已刪除");
      utils.user.list.invalidate();
      utils.user.listBasic.invalidate();
      setDeleting(null);
    },
    onError: (e: any) => toast.error(`刪除失敗：${e.message}`),
  });

  // ── Add user state ──
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<UserForm>(EMPTY_FORM);

  const createUserMutation = trpc.user.create.useMutation({
    onSuccess: () => {
      toast.success("使用者已新增");
      utils.user.list.invalidate();
      utils.user.listBasic.invalidate();
      setShowAdd(false);
      setAddForm(EMPTY_FORM);
    },
    onError: (e: any) => toast.error(`新增失敗：${e.message}`),
  });

  const handleSubmitNewUser = () => {
    if (!addForm.name.trim()) {
      toast.error("請輸入名稱");
      return;
    }
    if (!addForm.email.trim()) {
      toast.error("請輸入 Email — 用於登入");
      return;
    }
    if (addForm.password && addForm.password.length < 6) {
      toast.error("密碼至少 6 個字");
      return;
    }
    createUserMutation.mutate({
      name: addForm.name.trim(),
      email: addForm.email.trim(),
      role: addForm.role,
      isActive: addForm.isActive,
      password: addForm.password || undefined,
    });
  };

  // ── Edit user state ──
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<UserForm>(EMPTY_FORM);

  useEffect(() => {
    if (editing) {
      setEditForm({
        name: editing.name ?? "",
        email: editing.email ?? "",
        role: editing.role,
        isActive: !!editing.isActive,
        password: "", // never pre-fill — only set when admin types one
      });
    }
  }, [editing]);

  const handleSubmitEdit = () => {
    if (!editing) return;
    if (!editForm.name.trim()) {
      toast.error("名稱不能空");
      return;
    }
    if (!editForm.email.trim()) {
      toast.error("Email 不能空 — 用於登入");
      return;
    }
    if (editForm.password && editForm.password.length < 6) {
      toast.error("密碼至少 6 個字");
      return;
    }
    updateMutation.mutate({
      id: editing.id,
      name: editForm.name.trim(),
      email: editForm.email.trim(),
      role: editForm.role,
      isActive: editForm.isActive,
      password: editForm.password || undefined,
    });
  };

  // ── Delete state ──
  const [deleting, setDeleting] = useState<any | null>(null);

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
            <h1 className="text-2xl font-semibold tracking-tight">使用者管理</h1>
            <p className="text-sm text-muted-foreground mt-1">
              管理團隊成員的系統角色與存取權限
            </p>
          </div>
          <Button
            onClick={() => setShowAdd(true)}
            size="sm"
            className="gap-2 shrink-0"
          >
            <Plus className="h-4 w-4" />
            新增使用者
          </Button>
        </div>

        {/* Role legend */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ROLES.map((role) => (
            <div
              key={role.value}
              className="p-3 rounded-xl border border-border/60 bg-card"
            >
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[role.value]}`}
              >
                {role.label}
              </span>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                {role.desc}
              </p>
            </div>
          ))}
        </div>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              團隊成員
              <Badge variant="secondary" className="ml-1">
                {users?.length ?? 0}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-3">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-8 w-28" />
                  </div>
                ))}
              </div>
            ) : users && users.length > 0 ? (
              <div className="space-y-1">
                {users.map((user: any) => {
                  const isSelf = user.id === (currentUser as { id?: number })?.id;
                  const inactive = !user.isActive;
                  return (
                    <div
                      key={user.id}
                      className={`flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/30 transition-colors group ${inactive ? "opacity-60" : ""}`}
                    >
                      <Avatar className="h-9 w-9 shrink-0 ring-1 ring-border">
                        <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                          {user.name?.charAt(0).toUpperCase() ?? "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            {user.name ?? "—"}
                          </span>
                          {isSelf && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0"
                            >
                              你
                            </Badge>
                          )}
                          {inactive && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-700 dark:text-amber-300"
                            >
                              停用
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {user.email ?? "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {/* Active switch */}
                        <Switch
                          checked={!!user.isActive}
                          disabled={isSelf}
                          onCheckedChange={(checked) =>
                            updateMutation.mutate({
                              id: user.id,
                              isActive: checked,
                            })
                          }
                          title={isSelf ? "不能停用自己" : user.isActive ? "已啟用" : "已停用"}
                        />
                        <span className="hidden sm:block w-24 text-right text-xs text-muted-foreground tabular-nums">
                          {new Date(user.lastSignedIn).toLocaleDateString("zh-TW")}
                        </span>
                        <div className="w-28 shrink-0 flex justify-end">
                          {isSelf ? (
                            <span
                              className={`inline-flex h-8 items-center justify-center w-full px-2.5 rounded-md text-xs font-medium ${ROLE_COLORS[user.role]}`}
                            >
                              {user.role.charAt(0).toUpperCase() +
                                user.role.slice(1)}
                            </span>
                          ) : (
                            <Select
                              value={user.role}
                              onValueChange={(role) =>
                                updateRoleMutation.mutate({
                                  userId: user.id,
                                  role: role as Role,
                                })
                              }
                            >
                              <SelectTrigger className="h-8 w-full text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLES.map((r) => (
                                  <SelectItem
                                    key={r.value}
                                    value={r.value}
                                    className="text-xs"
                                  >
                                    {r.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        {/* Row actions */}
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
                              onClick={() => setEditing(user)}
                              className="cursor-pointer"
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              編輯
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleting(user)}
                              disabled={isSelf}
                              className="cursor-pointer text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              刪除帳號
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">尚無使用者資料</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Add user dialog ── */}
        <Dialog
          open={showAdd}
          onOpenChange={(open) => {
            setShowAdd(open);
            if (!open) setAddForm(EMPTY_FORM);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>新增使用者</DialogTitle>
              <DialogDescription>
                建立一筆使用者紀錄並指派角色。系統會自動產生內部識別碼。
              </DialogDescription>
            </DialogHeader>

            <UserFormFields
              form={addForm}
              onChange={(patch) => setAddForm((f) => ({ ...f, ...patch }))}
              isCreating
            />

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowAdd(false)}
                disabled={createUserMutation.isPending}
              >
                取消
              </Button>
              <Button
                onClick={handleSubmitNewUser}
                disabled={createUserMutation.isPending || !addForm.name.trim()}
                className="gap-2"
              >
                {createUserMutation.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    新增中…
                  </>
                ) : (
                  "新增"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Edit user dialog ── */}
        <Dialog
          open={editing !== null}
          onOpenChange={(open) => !open && setEditing(null)}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>編輯使用者</DialogTitle>
              <DialogDescription>
                {editing?.name ?? ""} · {editing?.email ?? "—"}
              </DialogDescription>
            </DialogHeader>

            <UserFormFields
              form={editForm}
              onChange={(patch) => setEditForm((f) => ({ ...f, ...patch }))}
              isCreating={false}
            />

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditing(null)}
                disabled={updateMutation.isPending}
              >
                取消
              </Button>
              <Button
                onClick={handleSubmitEdit}
                disabled={updateMutation.isPending || !editForm.name.trim()}
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

        {/* ── Delete confirmation ── */}
        <AlertDialog
          open={deleting !== null}
          onOpenChange={(open) => !open && setDeleting(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-destructive" />
                確定刪除此帳號？
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-sm text-muted-foreground space-y-2">
                  <div>
                    將永久刪除使用者{" "}
                    <span className="font-medium text-foreground">
                      {deleting?.name ?? deleting?.email ?? "—"}
                    </span>
                    （
                    <code className="font-mono text-xs">
                      {deleting?.email ?? `#${deleting?.id}`}
                    </code>
                    ）。
                  </div>
                  <div className="text-xs text-muted-foreground/80">
                    歷史紀錄會保留（不會被連帶刪除），但此後無法登入此帳號。
                    若只是要暫時停用，請改用啟用切換。
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  if (deleting) deleteMutation.mutate({ id: deleting.id });
                }}
                disabled={deleteMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    刪除中…
                  </>
                ) : (
                  "確認刪除"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}

/** Shared name / email / role / active / password fields for both add & edit dialogs. */
function UserFormFields({
  form,
  onChange,
  isCreating,
}: {
  form: UserForm;
  onChange: (patch: Partial<UserForm>) => void;
  isCreating: boolean;
}) {
  return (
    <div className="space-y-4 py-2">
      <div>
        <Label htmlFor="user-name" className="text-xs">
          名稱 *
        </Label>
        <Input
          id="user-name"
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="例如：王小明"
          className="mt-1"
          autoFocus={isCreating}
        />
      </div>
      <div>
        <Label htmlFor="user-email" className="text-xs">
          Email * <span className="text-muted-foreground/70">（用於登入）</span>
        </Label>
        <Input
          id="user-email"
          type="email"
          value={form.email}
          onChange={(e) => onChange({ email: e.target.value })}
          placeholder="user@example.com"
          className="mt-1"
          required
        />
      </div>
      <div>
        <Label className="text-xs">角色</Label>
        <Select
          value={form.role}
          onValueChange={(v) => onChange({ role: v as Role })}
        >
          <SelectTrigger className="mt-1 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${ROLE_COLORS[r.value]}`}
                  >
                    {r.label}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {r.desc}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
        <div>
          <Label className="text-xs cursor-pointer">啟用此帳號</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            停用後使用者無法登入，歷程不受影響
          </p>
        </div>
        <Switch
          checked={form.isActive}
          onCheckedChange={(v) => onChange({ isActive: !!v })}
        />
      </div>
      <div>
        <Label htmlFor="user-password" className="text-xs">
          密碼{isCreating ? "（選填，可空白以後再設）" : "（留空則不變更）"}
        </Label>
        <Input
          id="user-password"
          type="password"
          value={form.password}
          onChange={(e) => onChange({ password: e.target.value })}
          placeholder={isCreating ? "至少 6 個字" : "輸入新密碼即更新"}
          className="mt-1 font-mono"
          autoComplete="new-password"
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          密碼以 scrypt 雜湊存放，明文不會進入資料庫
        </p>
      </div>
    </div>
  );
}
