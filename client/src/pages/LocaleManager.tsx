import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { Globe, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { LocaleFlag } from "@/components/LocaleFlag";
import { LOCALE_PRESETS, type LocalePreset } from "@/lib/localePresets";

type CodeStyle = "long" | "short";

export default function LocaleManager() {
  const { } = useAuth();
  const { data: user } = trpc.auth.me.useQuery();
  const userRole = (user as { role?: string })?.role ?? "rd";
  const isAdmin = userRole === "admin";

  const { data: locales, isLoading } = trpc.locale.list.useQuery();
  const utils = trpc.useUtils();

  const createMutation = trpc.locale.create.useMutation({
    onSuccess: () => {
      toast.success("語系新增成功");
      utils.locale.list.invalidate();
      utils.locale.listActive.invalidate();
      setShowAdd(false);
      resetForm();
    },
    onError: (e) => toast.error(`新增失敗：${e.message}`),
  });

  const updateMutation = trpc.locale.update.useMutation({
    onSuccess: () => {
      toast.success("語系已更新");
      utils.locale.list.invalidate();
      utils.locale.listActive.invalidate();
    },
    onError: (e) => toast.error(`更新失敗：${e.message}`),
  });

  const deleteMutation = trpc.locale.delete.useMutation({
    onSuccess: () => {
      toast.success("語系已刪除");
      utils.locale.list.invalidate();
      utils.locale.listActive.invalidate();
    },
    onError: (e) => toast.error(`刪除失敗：${e.message}`),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [codeStyle, setCodeStyle] = useState<CodeStyle>("long");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    code: "",
    name: "",
    nativeName: "",
    sortOrder: 0,
  });

  const resetForm = () => {
    setForm({ code: "", name: "", nativeName: "", sortOrder: 0 });
    setSearch("");
  };

  const handlePreset = (preset: LocalePreset) => {
    const code = codeStyle === "short" ? preset.shortCode : preset.code;
    setForm({
      code,
      name: preset.name,
      nativeName: preset.nativeName,
      sortOrder: 0,
    });
  };

  const handleSubmit = () => {
    if (!form.code || !form.name || !form.nativeName) {
      toast.error("請填寫所有必填欄位");
      return;
    }
    createMutation.mutate(form);
  };

  const existingCodes = useMemo(
    () => new Set(locales?.map((l) => l.code) ?? []),
    [locales]
  );

  // Group presets by region, filtered by search & dedup with existing
  const groupedPresets = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = LOCALE_PRESETS.filter((p) => {
      const codeForCheck = codeStyle === "short" ? p.shortCode : p.code;
      if (existingCodes.has(codeForCheck)) return false;
      if (!q) return true;
      return (
        p.code.toLowerCase().includes(q) ||
        p.shortCode.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.nativeName.toLowerCase().includes(q) ||
        p.region.toLowerCase().includes(q)
      );
    });
    const groups = new Map<string, LocalePreset[]>();
    for (const p of filtered) {
      const arr = groups.get(p.region) ?? [];
      arr.push(p);
      groups.set(p.region, arr);
    }
    return Array.from(groups.entries());
  }, [search, codeStyle, existingCodes]);

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">語系管理</h1>
            <p className="text-sm text-muted-foreground mt-1">
              管理系統支援的翻譯語系
            </p>
          </div>
          {isAdmin && (
            <Button
              onClick={() => setShowAdd(true)}
              size="sm"
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              新增語系
            </Button>
          )}
        </div>

        <Card className="border-border/60 hover-lift">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              已設定語系
              <Badge variant="secondary" className="ml-1">
                {locales?.length ?? 0}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-14 bg-secondary/50 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            ) : locales && locales.length > 0 ? (
              <div className="space-y-2">
                {locales.map((locale) => (
                  <div
                    key={locale.id}
                    className="flex items-center gap-4 p-3 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors group"
                  >
                    <LocaleFlag code={locale.code} size="lg" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {locale.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {locale.nativeName}
                        </span>
                        <code className="text-xs font-mono bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
                          {locale.code}
                        </code>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isAdmin ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {locale.isActive ? "啟用" : "停用"}
                          </span>
                          <Switch
                            checked={locale.isActive}
                            onCheckedChange={(checked) =>
                              updateMutation.mutate({
                                id: locale.id,
                                isActive: checked,
                              })
                            }
                          />
                        </div>
                      ) : (
                        <Badge
                          variant={locale.isActive ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {locale.isActive ? "啟用" : "停用"}
                        </Badge>
                      )}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (
                              confirm(
                                `確定要刪除語系 ${locale.name}（${locale.code}）嗎？`
                              )
                            ) {
                              deleteMutation.mutate({ id: locale.id });
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Globe className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">尚未設定任何語系</p>
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => setShowAdd(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" /> 新增第一個語系
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Locale Dialog */}
        <Dialog open={showAdd} onOpenChange={(o) => { setShowAdd(o); if (!o) resetForm(); }}>
          <DialogContent className="!max-w-3xl w-[min(92vw,820px)]">
            <DialogHeader>
              <DialogTitle>新增語系</DialogTitle>
            </DialogHeader>

            <div className="space-y-5 py-2">
              {/* Quick pick header — search + code style toggle */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70 pointer-events-none" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜尋語系（中文 / 母語 / 代碼 / 區域）"
                    className="pl-9 h-9"
                  />
                </div>
                <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setCodeStyle("long")}
                    className={`h-7 px-3 rounded-md transition-colors ${
                      codeStyle === "long"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="BCP-47 帶區域：zh-TW、ja-JP、en-US"
                  >
                    區域碼
                    <span className="ml-1 font-mono text-[10px] text-muted-foreground/70">
                      ja-JP
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodeStyle("short")}
                    className={`h-7 px-3 rounded-md transition-colors ${
                      codeStyle === "short"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="兩字短碼：tw、jp、us"
                  >
                    短碼
                    <span className="ml-1 font-mono text-[10px] text-muted-foreground/70">
                      jp
                    </span>
                  </button>
                </div>
              </div>

              {/* Quick picker — grouped by region */}
              <div className="rounded-lg border border-border/60 bg-muted/20 max-h-[280px] overflow-y-auto scrollbar-elegant">
                {groupedPresets.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    {search ? "找不到符合條件的語系" : "全部都已加過了"}
                  </div>
                ) : (
                  <div className="p-2 space-y-3">
                    {groupedPresets.map(([region, items]) => (
                      <div key={region}>
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-semibold px-1.5 mb-1.5">
                          {region}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                          {items.map((preset) => {
                            const codeForCheck =
                              codeStyle === "short"
                                ? preset.shortCode
                                : preset.code;
                            const selected = form.code === codeForCheck;
                            return (
                              <button
                                key={preset.code}
                                type="button"
                                onClick={() => handlePreset(preset)}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-colors ${
                                  selected
                                    ? "border-primary bg-primary/10"
                                    : "border-border/60 hover:border-primary/50 hover:bg-card"
                                }`}
                              >
                                <LocaleFlag code={preset.code} size="md" />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium truncate">
                                    {preset.name}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground font-mono truncate">
                                    {codeForCheck}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Manual entry / refinement */}
              <div className="rounded-lg border border-border/60 p-4 space-y-3 bg-card">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  <span>送出前可微調</span>
                  {form.code && (
                    <LocaleFlag code={form.code} size="sm" />
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="code" className="text-xs">
                      語系代碼 *
                    </Label>
                    <Input
                      id="code"
                      value={form.code}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, code: e.target.value }))
                      }
                      placeholder={codeStyle === "short" ? "tw" : "zh-TW"}
                      className="mt-1 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="sortOrder" className="text-xs">
                      排序
                    </Label>
                    <Input
                      id="sortOrder"
                      type="number"
                      value={form.sortOrder}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          sortOrder: parseInt(e.target.value) || 0,
                        }))
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="name" className="text-xs">
                      中文名稱 *
                    </Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, name: e.target.value }))
                      }
                      placeholder="繁體中文"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="nativeName" className="text-xs">
                      母語名稱 *
                    </Label>
                    <Input
                      id="nativeName"
                      value={form.nativeName}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          nativeName: e.target.value,
                        }))
                      }
                      placeholder="繁體中文"
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAdd(false);
                  resetForm();
                }}
              >
                取消
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "新增中..." : "新增語系"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
