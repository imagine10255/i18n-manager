/**
 * 模板字典管理頁。靈感來自 Apifox 的「模型/Schema」：跨專案共用的 i18n 詞條集。
 *
 * 單一面板版本：
 *   • Header 上方一條 toolbar：模板選擇下拉、新增模板、刪除模板、新增 Key、搜尋
 *   • 下方就是當前模板的 keys × locales 直編表格（onBlur commit）
 *
 * 編輯模板裡的值 → 所有 reference 過此 key 的專案 key 立即同步。
 */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Library, Plus, Search, Trash2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { LocaleFlag } from "@/components/LocaleFlag";

export default function TemplateManager() {
  const { } = useAuth();
  const { data: user } = trpc.auth.me.useQuery();
  const role = (user as { role?: string })?.role ?? "rd";
  const canEdit = role === "admin" || role === "editor";
  const isAdmin = role === "admin";

  const utils = trpc.useUtils();

  const { data: templates, isLoading: tplLoading } = trpc.template.list.useQuery();
  const { data: locales } = trpc.locale.listActive.useQuery();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // 預設選第一個模板（在 list 載入後）
  useEffect(() => {
    if (!selectedId && templates && templates.length > 0) {
      setSelectedId(templates[0].id);
    }
    // 若選的模板被刪掉了，自動 fallback
    if (
      selectedId &&
      templates &&
      !templates.some((t: any) => t.id === selectedId)
    ) {
      setSelectedId(templates[0]?.id ?? null);
    }
  }, [templates, selectedId]);

  const createTemplate = trpc.template.create.useMutation({
    onSuccess: ({ id }) => {
      toast.success("模板已建立");
      utils.template.list.invalidate();
      setSelectedId(id);
      setShowCreate(false);
      setTName("");
      setTDesc("");
    },
    onError: (e) => toast.error(`建立失敗：${e.message}`),
  });
  const deleteTemplate = trpc.template.delete.useMutation({
    onSuccess: () => {
      toast.success("模板已刪除");
      utils.template.list.invalidate();
      setSelectedId(null);
    },
    onError: (e) => toast.error(`刪除失敗：${e.message}`),
  });

  // ── New-template dialog state ─────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [tName, setTName] = useState("");
  const [tDesc, setTDesc] = useState("");

  const selectedTpl = useMemo(
    () => templates?.find((t: any) => t.id === selectedId) ?? null,
    [templates, selectedId]
  );

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto space-y-3">
        <Card>
          {/* ── Toolbar ──────────────────────────────────────────────────── */}
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <Library className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium mr-1">模板字典</span>

              <Select
                value={selectedId ? String(selectedId) : ""}
                onValueChange={(v) => setSelectedId(Number(v))}
                disabled={!templates || templates.length === 0}
              >
                <SelectTrigger className="h-8 w-[220px]">
                  <SelectValue
                    placeholder={
                      tplLoading
                        ? "載入中…"
                        : templates && templates.length === 0
                          ? "尚未建立任何模板"
                          : "選擇模板…"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(templates ?? []).map((t: any) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      <span className="flex items-center gap-2">
                        <span>{t.name}</span>
                        {!t.isActive && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] py-0"
                          >
                            停用
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedTpl?.description && (
                <span
                  className="text-xs text-muted-foreground truncate max-w-[320px]"
                  title={selectedTpl.description}
                >
                  — {selectedTpl.description}
                </span>
              )}

              <div className="flex-1" />

              {canEdit && (
                <Button size="sm" onClick={() => setShowCreate(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> 新增模板
                </Button>
              )}
              {isAdmin && selectedId != null && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (
                      confirm(
                        "刪除模板會解除所有專案 key 的引用（保留當前值），確定刪除？"
                      )
                    ) {
                      deleteTemplate.mutate({ id: selectedId });
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> 刪除模板
                </Button>
              )}
            </div>
          </CardHeader>

          {/* ── Detail (keys × locales table) ────────────────────────────── */}
          {selectedId ? (
            <TemplateDetail
              templateId={selectedId}
              locales={locales ?? []}
              canEdit={canEdit}
            />
          ) : (
            <CardContent className="py-16 text-center text-muted-foreground">
              <Library className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {templates && templates.length === 0
                  ? "尚未建立任何模板"
                  : "請選擇一個模板"}
              </p>
              {canEdit && templates && templates.length === 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setShowCreate(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> 建立第一個模板
                </Button>
              )}
            </CardContent>
          )}
        </Card>
      </div>

      {/* ── New-template dialog ────────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增模板字典</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="t-name">名稱</Label>
              <Input
                id="t-name"
                value={tName}
                onChange={(e) => setTName(e.target.value)}
                placeholder="例如：common-buttons"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-desc">說明（選填）</Label>
              <Textarea
                id="t-desc"
                value={tDesc}
                onChange={(e) => setTDesc(e.target.value)}
                placeholder="此模板的用途、適用情境…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (!tName.trim()) {
                  toast.error("名稱不可為空");
                  return;
                }
                createTemplate.mutate({
                  name: tName.trim(),
                  description: tDesc.trim() || undefined,
                });
              }}
              disabled={createTemplate.isPending}
            >
              建立
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 模板細節：keys + 多語系值表格（單一 Card 內）
// ────────────────────────────────────────────────────────────────────────────
function TemplateDetail({
  templateId,
  locales,
  canEdit,
}: {
  templateId: number;
  locales: Array<{ id: number; code: string; name: string; nativeName: string }>;
  canEdit: boolean;
}) {
  const utils = trpc.useUtils();
  const { data: keys, isLoading } = trpc.template.listKeysWithTranslations.useQuery({
    templateId,
  });

  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return keys ?? [];
    return (keys ?? []).filter(
      (k: any) =>
        k.keyPath.toLowerCase().includes(q) ||
        (k.description ?? "").toLowerCase().includes(q)
    );
  }, [keys, search]);

  const createKey = trpc.template.createKey.useMutation({
    onSuccess: () => {
      toast.success("Key 已新增");
      utils.template.listKeysWithTranslations.invalidate({ templateId });
    },
    onError: (e) => toast.error(`新增失敗：${e.message}`),
  });
  const deleteKey = trpc.template.deleteKey.useMutation({
    onSuccess: () => {
      toast.success("Key 已刪除（引用此 key 的專案 key 已落地當前值）");
      utils.template.listKeysWithTranslations.invalidate({ templateId });
    },
  });
  const upsertValue = trpc.template.upsertValue.useMutation({
    onSuccess: () => {
      utils.template.listKeysWithTranslations.invalidate({ templateId });
    },
    onError: (e) => toast.error(`儲存失敗：${e.message}`),
  });

  const [showAddKey, setShowAddKey] = useState(false);
  const [newKeyPath, setNewKeyPath] = useState("");
  const [newKeyDesc, setNewKeyDesc] = useState("");

  return (
    <>
      <CardContent className="p-0">
        {/* Sub-toolbar：搜尋 + 新增 Key */}
        <div className="px-4 pt-3 pb-3 flex items-center gap-2 border-b">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋 key 或說明…"
              className="pl-7 h-8 text-xs"
            />
          </div>
          <div className="flex-1" />
          {canEdit && (
            <Button size="sm" onClick={() => setShowAddKey(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> 新增 Key
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <p className="text-xs text-muted-foreground p-6">載入中…</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <KeyRound className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">
                {keys && keys.length === 0
                  ? "此模板尚未有任何 key"
                  : "沒有符合的 key"}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs">
                <tr>
                  <th className="text-left px-3 py-2 w-[260px] sticky left-0 bg-muted/40">
                    Key
                  </th>
                  {locales.map((l) => (
                    <th key={l.code} className="text-left px-3 py-2 min-w-[180px]">
                      <div className="flex items-center gap-1.5">
                        <LocaleFlag code={l.code} size="sm" />
                        <span className="font-medium">{l.name}</span>
                        <code className="text-[10px] text-muted-foreground">
                          {l.code}
                        </code>
                      </div>
                    </th>
                  ))}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((k: any) => (
                  <tr
                    key={k.id}
                    className="border-t border-border/40 hover:bg-muted/20"
                  >
                    <td className="px-3 py-2 sticky left-0 bg-background">
                      <div className="flex items-center gap-1.5">
                        <KeyRound className="h-3 w-3 opacity-50" />
                        <code className="text-xs">{k.keyPath}</code>
                      </div>
                      {k.description && (
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                          {k.description}
                        </p>
                      )}
                    </td>
                    {locales.map((l) => (
                      <td key={l.code} className="px-2 py-1">
                        <TemplateValueCell
                          initial={k.translations[l.code]?.value ?? ""}
                          disabled={!canEdit}
                          onCommit={(v) =>
                            upsertValue.mutate({
                              templateKeyId: k.id,
                              localeCode: l.code,
                              value: v,
                            })
                          }
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (
                              confirm(
                                `刪除 key「${k.keyPath}」？引用此 key 的專案 key 會落地當前值並解除引用。`
                              )
                            ) {
                              deleteKey.mutate({ id: k.id });
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </CardContent>

      {/* New key dialog */}
      <Dialog open={showAddKey} onOpenChange={setShowAddKey}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增模板 Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="k-path">Key Path</Label>
              <Input
                id="k-path"
                value={newKeyPath}
                onChange={(e) => setNewKeyPath(e.target.value)}
                placeholder="例如：common.button.confirm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="k-desc">說明（選填）</Label>
              <Textarea
                id="k-desc"
                value={newKeyDesc}
                onChange={(e) => setNewKeyDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddKey(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (!newKeyPath.trim()) {
                  toast.error("Key path 不可為空");
                  return;
                }
                createKey.mutate(
                  {
                    templateId,
                    keyPath: newKeyPath.trim(),
                    description: newKeyDesc.trim() || undefined,
                  },
                  {
                    onSuccess: () => {
                      setShowAddKey(false);
                      setNewKeyPath("");
                      setNewKeyDesc("");
                    },
                  }
                );
              }}
              disabled={createKey.isPending}
            >
              建立
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Inline-edit cell with onBlur commit. Mirrors the pattern in
 * TranslationEditorOptimized so behavior feels consistent.
 */
function TemplateValueCell({
  initial,
  disabled,
  onCommit,
}: {
  initial: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const [val, setVal] = useState(initial);
  useEffect(() => setVal(initial), [initial]);
  return (
    <Input
      value={val}
      disabled={disabled}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        if (val !== initial) onCommit(val);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setVal(initial);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="h-8 text-xs"
      placeholder={disabled ? "—" : "輸入翻譯…"}
    />
  );
}
