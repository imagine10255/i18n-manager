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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  ChevronDown,
  ChevronRight,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

type TranslationRow = {
  id: number;
  keyPath: string;
  description: string | null;
  tags: string | null;
  isDeleted: boolean;
  translations: Record<string, { value: string | null; isTranslated: boolean }>;
};

type TreeNode = {
  key: string;
  fullPath: string;
  children: Map<string, TreeNode>;
  rows: TranslationRow[];
};

function buildTree(rows: TranslationRow[]): TreeNode {
  const root: TreeNode = { key: "", fullPath: "", children: new Map(), rows: [] };

  for (const row of rows) {
    const parts = row.keyPath.split(".");
    let current = root;
    let pathSoFar = "";

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i] ?? "";
      pathSoFar = pathSoFar ? `${pathSoFar}.${part}` : part;
      if (!current.children.has(part)) {
        current.children.set(part, { key: part, fullPath: pathSoFar, children: new Map(), rows: [] });
      }
      current = current.children.get(part)!;
    }
    current.rows.push(row);
  }

  return root;
}

const FLAG_MAP: Record<string, string> = {
  "zh-TW": "🇹🇼", "zh-CN": "🇨🇳", "en": "🇺🇸", "ja": "🇯🇵",
  "ko": "🇰🇷", "fr": "🇫🇷", "de": "🇩🇪", "es": "🇪🇸",
};

export default function TranslationEditor() {
  const { data: currentUser } = trpc.auth.me.useQuery();
  const userRole = (currentUser as { role?: string })?.role ?? "rd";
  const canEdit = userRole === "admin" || userRole === "editor";

  const { data: locales } = trpc.locale.listActive.useQuery();
  const { data: keys, isLoading, refetch } = trpc.translationKey.listWithTranslations.useQuery({ projectId: 1 });
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const [filterLocale, setFilterLocale] = useState<string | null>(null);
  const [filterUntranslated, setFilterUntranslated] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAddKey, setShowAddKey] = useState(false);
  const [editingCell, setEditingCell] = useState<{ keyId: number; localeCode: string; currentValue: string } | null>(null);
  const [pendingEdits, setPendingEdits] = useState<Map<string, string>>(new Map());
  const [newKeyForm, setNewKeyForm] = useState({ keyPath: "", description: "" });

  const createKeyMutation = trpc.translationKey.create.useMutation({
    onSuccess: () => {
      toast.success("Key 已新增");
      utils.translationKey.listWithTranslations.invalidate();
      setShowAddKey(false);
      setNewKeyForm({ keyPath: "", description: "" });
    },
    onError: (e: any) => toast.error(`新增失敗：${e.message}`),
  });

  const deleteKeyMutation = trpc.translationKey.delete.useMutation({
    onSuccess: () => {
      toast.success("Key 已刪除");
      utils.translationKey.listWithTranslations.invalidate();
      utils.stats.getProjectStats.invalidate();
    },
    onError: (e: any) => toast.error(`刪除失敗：${e.message}`),
  });

  const updateValueMutation = trpc.translation.updateValue.useMutation({
    onSuccess: () => {
      utils.translationKey.listWithTranslations.invalidate();
      utils.stats.getProjectStats.invalidate();
    },
    onError: (e: any) => toast.error(`儲存失敗：${e.message}`),
  });

  const batchUpdateMutation = trpc.translation.batchUpdate.useMutation({
    onSuccess: () => {
      toast.success("翻譯已儲存");
      utils.translationKey.listWithTranslations.invalidate();
      utils.stats.getProjectStats.invalidate();
      setPendingEdits(new Map());
      setEditingCell(null);
    },
    onError: (e: any) => toast.error(`儲存失敗：${e.message}`),
  });

  const filteredRows = useMemo(() => {
    if (!keys) return [];
    return keys.filter((row) => {
      if (search && !row.keyPath.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterLocale && filterUntranslated) {
        return !row.translations[filterLocale]?.isTranslated;
      }
      return true;
    });
  }, [keys, search, filterLocale, filterUntranslated]);

  const tree = useMemo(() => buildTree(filteredRows), [filteredRows]);

  const toggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const expandAll = () => {
    const paths = new Set<string>();
    const collect = (node: TreeNode) => {
      if (node.children.size > 0) {
        paths.add(node.fullPath);
        node.children.forEach(collect);
      }
    };
    tree.children.forEach(collect);
    setExpanded(paths);
  };

  const collapseAll = () => setExpanded(new Set());

  const getCellValue = (keyId: number, localeCode: string, originalValue: string | null) => {
    const key = `${keyId}:${localeCode}`;
    return pendingEdits.has(key) ? pendingEdits.get(key)! : (originalValue ?? "");
  };

  const setCellValue = (keyId: number, localeCode: string, value: string) => {
    const key = `${keyId}:${localeCode}`;
    setPendingEdits((prev) => new Map(prev).set(key, value));
  };

  const saveAllPending = () => {
    if (pendingEdits.size === 0) return;
    const updates = Array.from(pendingEdits.entries()).map(([key, value]) => {
      const [keyId, localeCode] = key.split(":");
      return { keyId: parseInt(keyId!), localeCode: localeCode!, value };
    });
    batchUpdateMutation.mutate({ updates });
  };

  const hasPendingEdits = pendingEdits.size > 0;

  const activeLocales = locales ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">翻譯編輯器</h1>
            <p className="text-sm text-muted-foreground mt-1">
              管理所有翻譯 Key 與各語系對應值
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasPendingEdits && (
              <Button
                onClick={saveAllPending}
                disabled={batchUpdateMutation.isPending}
                size="sm"
                className="gap-2"
              >
                {batchUpdateMutation.isPending ? "儲存中..." : `儲存 ${pendingEdits.size} 項變更`}
              </Button>
            )}
            {hasPendingEdits && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPendingEdits(new Map())}
              >
                捨棄
              </Button>
            )}
            {canEdit && (
              <Button onClick={() => setShowAddKey(true)} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                新增 Key
              </Button>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48 max-w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋 Key 名稱..."
              className="pl-9 h-9 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterLocale ?? ""}
              onChange={(e) => setFilterLocale(e.target.value || null)}
              className="h-9 px-3 text-sm rounded-md border border-input bg-background text-foreground"
            >
              <option value="">所有語系</option>
              {activeLocales.map((l) => (
                <option key={l.code} value={l.code}>
                  {FLAG_MAP[l.code] ?? "🌐"} {l.nativeName}
                </option>
              ))}
            </select>

            {filterLocale && (
              <button
                onClick={() => setFilterUntranslated((v) => !v)}
                className={`flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm transition-colors ${
                  filterUntranslated
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input hover:bg-secondary"
                }`}
              >
                <Filter className="h-3.5 w-3.5" />
                未翻譯
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <Button variant="ghost" size="sm" onClick={expandAll} className="text-xs h-8">
              展開全部
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll} className="text-xs h-8">
              收合全部
            </Button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{filteredRows.length} 個 Key</span>
          {hasPendingEdits && (
            <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
              {pendingEdits.size} 項未儲存
            </Badge>
          )}
        </div>

        {/* Editor table */}
        <Card className="border-border/60 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {search ? "找不到符合的 Key" : "尚無翻譯 Key"}
              </p>
              {canEdit && !search && (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowAddKey(true)}>
                  <Plus className="h-4 w-4 mr-1" /> 新增第一個 Key
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-elegant">
              {/* Table header */}
              <div className="flex items-center border-b bg-secondary/30 sticky top-0 z-10 min-w-max">
                <div className="w-72 shrink-0 px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Key Path
                </div>
                {activeLocales.map((locale) => (
                  <div
                    key={locale.code}
                    className="flex-1 min-w-48 px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    <span className="mr-1.5">{FLAG_MAP[locale.code] ?? "🌐"}</span>
                    {locale.nativeName}
                    <span className="ml-1.5 font-mono text-[10px] opacity-60">{locale.code}</span>
                  </div>
                ))}
                {canEdit && <div className="w-16 shrink-0" />}
              </div>

              {/* Tree rows */}
              <TreeNodeRenderer
                node={tree}
                depth={0}
                expanded={expanded}
                toggleExpand={toggleExpand}
                locales={activeLocales}
                canEdit={canEdit}
                getCellValue={getCellValue}
                setCellValue={setCellValue}
                pendingEdits={pendingEdits}
                onDeleteKey={(id, path) => {
                  if (confirm(`確定要刪除 Key「${path}」嗎？`)) {
                    deleteKeyMutation.mutate({ id });
                  }
                }}
                onSaveCell={(keyId, localeCode, value) => {
                  updateValueMutation.mutate({ keyId, localeCode, value });
                  setPendingEdits((prev) => {
                    const next = new Map(prev);
                    next.delete(`${keyId}:${localeCode}`);
                    return next;
                  });
                }}
              />
            </div>
          )}
        </Card>
      </div>

      {/* Add Key Dialog */}
      <Dialog open={showAddKey} onOpenChange={setShowAddKey}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新增翻譯 Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="keyPath" className="text-xs">
                Key Path <span className="text-destructive">*</span>
              </Label>
              <Input
                id="keyPath"
                value={newKeyForm.keyPath}
                onChange={(e) => setNewKeyForm((f) => ({ ...f, keyPath: e.target.value }))}
                placeholder="home.header.title"
                className="mt-1 font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                使用點號分隔層級，例如 <code className="bg-secondary px-1 rounded">home.header.title</code>
              </p>
            </div>
            <div>
              <Label htmlFor="description" className="text-xs">說明（選填）</Label>
              <Input
                id="description"
                value={newKeyForm.description}
                onChange={(e) => setNewKeyForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="首頁標題文字"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddKey(false); setNewKeyForm({ keyPath: "", description: "" }); }}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (!newKeyForm.keyPath.trim()) { toast.error("請輸入 Key Path"); return; }
                createKeyMutation.mutate({ projectId: 1, keyPath: newKeyForm.keyPath.trim(), description: newKeyForm.description || undefined });
              }}
              disabled={createKeyMutation.isPending}
            >
              {createKeyMutation.isPending ? "新增中..." : "新增"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

// ─── Tree Node Renderer ───────────────────────────────────────────────────────

type TreeNodeRendererProps = {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  toggleExpand: (path: string) => void;
  locales: { code: string; nativeName: string }[];
  canEdit: boolean;
  getCellValue: (keyId: number, localeCode: string, originalValue: string | null) => string;
  setCellValue: (keyId: number, localeCode: string, value: string) => void;
  pendingEdits: Map<string, string>;
  onDeleteKey: (id: number, path: string) => void;
  onSaveCell: (keyId: number, localeCode: string, value: string) => void;
};

function TreeNodeRenderer({
  node,
  depth,
  expanded,
  toggleExpand,
  locales,
  canEdit,
  getCellValue,
  setCellValue,
  pendingEdits,
  onDeleteKey,
  onSaveCell,
}: TreeNodeRendererProps) {
  const children = Array.from(node.children.entries());

  return (
    <>
      {/* Group header */}
      {node.key && (
        <div
          className="flex items-center border-b border-border/30 hover:bg-secondary/20 cursor-pointer group min-w-max"
          style={{ paddingLeft: `${depth * 20 + 12}px` }}
          onClick={() => toggleExpand(node.fullPath)}
        >
          <div className="w-72 shrink-0 flex items-center gap-2 py-2.5 pr-4">
            <span className="text-muted-foreground/60">
              {expanded.has(node.fullPath) ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="font-mono text-xs font-semibold text-foreground/70 bg-secondary px-2 py-0.5 rounded">
              {node.key}
            </span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {countRows(node)}
            </Badge>
          </div>
          {locales.map((l) => (
            <div key={l.code} className="flex-1 min-w-48 px-4 py-2.5" />
          ))}
          {canEdit && <div className="w-16 shrink-0" />}
        </div>
      )}

      {/* Children (expanded or root) */}
      {(node.key === "" || expanded.has(node.fullPath)) && (
        <>
          {children.map(([key, child]) => (
            <TreeNodeRenderer
              key={child.fullPath}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggleExpand={toggleExpand}
              locales={locales}
              canEdit={canEdit}
              getCellValue={getCellValue}
              setCellValue={setCellValue}
              pendingEdits={pendingEdits}
              onDeleteKey={onDeleteKey}
              onSaveCell={onSaveCell}
            />
          ))}

          {/* Leaf rows */}
          {node.rows.map((row) => (
            <TranslationRow
              key={row.id}
              row={row}
              depth={node.key === "" ? depth : depth + 1}
              locales={locales}
              canEdit={canEdit}
              getCellValue={getCellValue}
              setCellValue={setCellValue}
              pendingEdits={pendingEdits}
              onDeleteKey={onDeleteKey}
              onSaveCell={onSaveCell}
            />
          ))}
        </>
      )}
    </>
  );
}

function countRows(node: TreeNode): number {
  let count = node.rows.length;
  node.children.forEach((child) => { count += countRows(child); });
  return count;
}

// ─── Translation Row ──────────────────────────────────────────────────────────

type TranslationRowProps = {
  row: TranslationRow;
  depth: number;
  locales: { code: string; nativeName: string }[];
  canEdit: boolean;
  getCellValue: (keyId: number, localeCode: string, originalValue: string | null) => string;
  setCellValue: (keyId: number, localeCode: string, value: string) => void;
  pendingEdits: Map<string, string>;
  onDeleteKey: (id: number, path: string) => void;
  onSaveCell: (keyId: number, localeCode: string, value: string) => void;
};

function TranslationRow({
  row,
  depth,
  locales,
  canEdit,
  getCellValue,
  setCellValue,
  pendingEdits,
  onDeleteKey,
  onSaveCell,
}: TranslationRowProps) {
  const [editingLocale, setEditingLocale] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const leafKey = row.keyPath.split(".").pop() ?? row.keyPath;

  const startEdit = (localeCode: string, currentValue: string | null) => {
    setEditingLocale(localeCode);
    setEditValue(getCellValue(row.id, localeCode, currentValue ?? null));
  };

  const commitEdit = (localeCode: string) => {
    if (editValue !== getCellValue(row.id, localeCode, row.translations[localeCode]?.value ?? null)) {
      setCellValue(row.id, localeCode, editValue);
    }
    setEditingLocale(null);
  };

  return (
    <div className="flex items-stretch border-b border-border/20 hover:bg-secondary/10 group min-w-max">
      {/* Key column */}
      <div
        className="w-72 shrink-0 flex items-center gap-2 px-4 py-2.5"
        style={{ paddingLeft: `${depth * 20 + 16}px` }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs text-foreground/80 truncate">{leafKey}</span>
          </div>
          {row.description && (
            <p className="text-[10px] text-muted-foreground truncate mt-0.5">{row.description}</p>
          )}
        </div>
      </div>

      {/* Translation cells */}
      {locales.map((locale) => {
        const t = row.translations[locale.code];
        const displayValue = getCellValue(row.id, locale.code, t?.value ?? null);
        const isPending = pendingEdits.has(`${row.id}:${locale.code}`);
        const isEditing = editingLocale === locale.code;

        return (
          <div
            key={locale.code}
            className={`flex-1 min-w-48 px-3 py-2 relative ${
              isEditing ? "bg-primary/5 ring-1 ring-inset ring-primary/30" : ""
            }`}
          >
            {isEditing ? (
              <Textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => commitEdit(locale.code)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    commitEdit(locale.code);
                  }
                  if (e.key === "Escape") {
                    setEditingLocale(null);
                  }
                }}
                className="text-xs min-h-[60px] resize-none border-0 bg-transparent p-0 focus-visible:ring-0 shadow-none"
                autoFocus
              />
            ) : (
              <div
                className={`text-xs leading-relaxed min-h-[1.5rem] cursor-text ${
                  canEdit ? "hover:bg-secondary/50 rounded px-1 -mx-1" : ""
                } ${
                  !displayValue
                    ? "text-muted-foreground/40 italic"
                    : isPending
                    ? "text-amber-700"
                    : t?.isTranslated
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
                onClick={() => { if (canEdit) startEdit(locale.code, t?.value ?? null); }}
              >
                {displayValue || (canEdit ? "點擊輸入翻譯..." : "—")}
                {isPending && (
                  <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle" />
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Actions */}
      {canEdit && (
        <div className="w-16 shrink-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => onDeleteKey(row.id, row.keyPath)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
