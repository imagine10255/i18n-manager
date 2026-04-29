import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Shield, Users } from "lucide-react";
import { toast } from "sonner";

const ROLES = [
  { value: "admin", label: "Admin", desc: "完整管理權限" },
  { value: "editor", label: "Editor", desc: "可新增/編輯翻譯" },
  { value: "rd", label: "RD", desc: "唯讀，查看翻譯與歷程" },
  { value: "qa", label: "QA", desc: "唯讀，查看翻譯與歷程" },
] as const;

const ROLE_COLORS: Record<string, string> = {
  admin: "role-admin",
  editor: "role-editor",
  rd: "role-rd",
  qa: "role-qa",
};

export default function UserManager() {
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
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">使用者管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理團隊成員的系統角色與存取權限</p>
        </div>

        {/* Role legend */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ROLES.map((role) => (
            <div key={role.value} className="p-3 rounded-xl border border-border/60 bg-card">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[role.value]}`}>
                {role.label}
              </span>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{role.desc}</p>
            </div>
          ))}
        </div>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              團隊成員
              <Badge variant="secondary" className="ml-1">{users?.length ?? 0}</Badge>
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
                  return (
                    <div
                      key={user.id}
                      className="flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/30 transition-colors"
                    >
                      <Avatar className="h-9 w-9 shrink-0 ring-1 ring-border">
                        <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                          {user.name?.charAt(0).toUpperCase() ?? "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{user.name ?? "—"}</span>
                          {isSelf && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">你</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{user.email ?? "—"}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground hidden sm:block">
                          {new Date(user.lastSignedIn).toLocaleDateString("zh-TW")}
                        </span>
                        {isSelf ? (
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${ROLE_COLORS[user.role]}`}>
                            {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                          </span>
                        ) : (
                          <Select
                            value={user.role}
                            onValueChange={(role) =>
                              updateRoleMutation.mutate({
                                userId: user.id,
                                role: role as "admin" | "editor" | "rd" | "qa",
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-28 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.map((r) => (
                                <SelectItem key={r.value} value={r.value} className="text-xs">
                                  {r.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
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
      </div>
    </DashboardLayout>
  );
}
