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
import { Globe, GripVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
      // 改 code 會 cascade 更新 translations / shared_translations 等，
      // 翻譯資料一起重抓避免顯示舊 localeCode 的對應
      utils.translationKey.listWithTranslations.invalidate();
      utils.sharedKey.listWithTranslations.invalidate();
      utils.sharedKey.listAllFlat.invalidate();
      setEditing(null);
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

  const reorderMutation = trpc.locale.updateSortOrders.useMutation({
    onError: (e) => {
      toast.error(`排序失敗：${e.message}`);
      utils.locale.list.invalidate();
      utils.locale.listActive.invalidate();
    },
  });

  // HTML5 DnD state — index in the displayed order
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const handleReorder = (fromIdx: number, toIdx: number) => {
    if (!locales || fromIdx === toIdx) return;
    const arr = [...locales];
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    // Optimistic update — write to the cache immediately so the row jumps
    utils.locale.list.setData(undefined, arr as any);
    // Persist new sortOrders (10, 20, 30...) — leaves room for inserts
    reorderMutation.mutate({
      items: arr.map((l, i) => ({ id: l.id, sortOrder: (i + 1) * 10 })),
    });
  };

  const [showAdd, setShowAdd] = useState(false);
  const [codeStyle, setCodeStyle] = useState<CodeStyle>("long");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    code: "",
    name: "",
    nativeName: "",
    sortOrder: 0,
  });

  // 正在編輯哪一筆 locale（null = 沒在編）。展開來給 dialog 用。
  const [editing, setEditing] = useState<{
    id: number;
    originalCode: string;
    code: string;
    name: string;
    nativeName: string;
    sortOrder: number;
  } | null>(null);

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
      <div className="w-full space-y-6">
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
                {locales.map((locale, idx) => (
                  <div
                    key={locale.id}
                    draggable={isAdmin}
                    onDragStart={(e) => {
                      if (!isAdmin) return;
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", String(idx));
                      setDraggingIndex(idx);
                    }}
                    onDragOver={(e) => {
                      if (!isAdmin || draggingIndex === null) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (overIndex !== idx) setOverIndex(idx);
                    }}
                    onDragLeave={() => {
                      if (overIndex === idx) setOverIndex(null);
                    }}
                    onDrop={(e) => {
                      if (!isAdmin) return;
                      e.preventDefault();
                      if (
                        draggingIndex !== null &&
                        draggingIndex !== idx
                      ) {
                        handleReorder(draggingIndex, idx);
                      }
                      setDraggingIndex(null);
                      setOverIndex(null);
                    }}
                    onDragEnd={() => {
                      setDraggingIndex(null);
                      setOverIndex(null);
                    }}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors group ${
                      draggingIndex === idx
                        ? "opacity-40 border-primary/40"
                        : overIndex === idx && draggingIndex !== null
                          ? "border-primary/60 bg-primary/5"
                          : "border-border/60 hover:bg-muted/40"
                    }`}
                  >
                    {isAdmin && (
                      <span
                        className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-foreground/80 shrink-0 -ml-1"
                        title="拖曳以調整順序"
                        aria-label="拖曳排序握把"
                      >
                        <GripVertical className="h-4 w-4" />
                      </span>
                    )}
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
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="編輯語系"
                            onClick={() =>
                              setEditing({
                                id: locale.id,
                                originalCode: locale.code,
                                code: locale.code,
                                name: locale.name,
                                nativeName: locale.nativeName,
                                sortOrder: locale.sortOrder ?? 0,
                              })
                            }
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="刪除語系"
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
                        </>
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

        {/* Edit Locale Dialog — 改 code 會 cascade 更新所有 reference 字串的表 */}
        <Dialog
          open={editing !== null}
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
        >
          <DialogContent className="!max-w-md">
            <DialogHeader>
              <DialogTitle>編輯語系</DialogTitle>
            </DialogHeader>

            {editing && (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <LocaleFlag code={editing.code} size="md" />
                  <span>目前代碼：</span>
                  <code className="font-mono">{editing.originalCode}</code>
                </div>

                <div>
                  <Label htmlFor="edit-code" className="text-xs">
                    語系代碼 *
                  </Label>
                  <Input
                    id="edit-code"
                    value={editing.code}
                    onChange={(e) =>
                      setEditing((prev) =>
                        prev ? { ...prev, code: e.target.value } : prev
                      )
                    }
                    className="mt-1 font-mono text-sm"
                  />
                  {editing.code !== editing.originalCode && (
                    <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                      改代碼會同步更新所有翻譯的 localeCode（不會掉資料），但會稍久一點。
                    </p>
                  )}
                  {editing.code !== editing.originalCode &&
                    existingCodes.has(editing.code) && (
                      <p className="mt-1 text-[11px] text-destructive">
                        此語系代碼已被其他語系使用
                      </p>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="edit-name" className="text-xs">
                      中文名稱 *
                    </Label>
                    <Input
                      id="edit-name"
                      value={editing.name}
                      onChange={(e) =>
                        setEditing((prev) =>
                          prev ? { ...prev, name: e.target.value } : prev
                        )
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-nativeName" className="text-xs">
                      母語名稱 *
                    </Label>
                    <Input
                      id="edit-nativeName"
                      value={editing.nativeName}
                      onChange={(e) =>
                        setEditing((prev) =>
                          prev
                            ? { ...prev, nativeName: e.target.value }
                            : prev
                        )
                      }
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="edit-sortOrder" className="text-xs">
                    排序
                  </Label>
                  <Input
                    id="edit-sortOrder"
                    type="number"
                    value={editing.sortOrder}
                    onChange={(e) =>
                      setEditing((prev) =>
                        prev
                          ? {
                              ...prev,
                              sortOrder: parseInt(e.target.value) || 0,
                            }
                          : prev
                      )
                    }
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>
                取消
              </Button>
              <Button
                disabled={
                  !editing ||
                  !editing.code.trim() ||
                  !editing.name.trim() ||
                  !editing.nativeName.trim() ||
                  (editing.code !== editing.originalCode &&
                    existingCodes.has(editing.code)) ||
                  updateMutation.isPending
                }
                onClick={() => {
                  if (!editing) return;
                  updateMutation.mutate({
                    id: editing.id,
                    code:
                      editing.code !== editing.originalCode
                        ? editing.code.trim()
                        : undefined,
                    name: editing.name.trim(),
                    nativeName: editing.nativeName.trim(),
                    sortOrder: editing.sortOrder,
                  });
                }}
              >
                {updateMutation.isPending ? "儲存中..." : "儲存變更"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
