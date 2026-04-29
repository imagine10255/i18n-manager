import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronRight,
  ChevronDown,
  Save,
  Loader2,
  Search,
  Plus,
  Maximize2,
  Minimize2,
  FolderTree,
  GitBranch,
  Languages,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import TranslationEditModal from "@/components/TranslationEditModal";
import VersionSelectModal from "@/components/VersionSelectModal";
import CreateProjectModal from "@/components/CreateProjectModal";
import CreateKeyModal from "@/components/CreateKeyModal";

interface TreeNode {
  id: string;
  keyPath: string;
  fullPath: string;
  keyId?: number;
  description?: string;
  isFolder: boolean;
  isExpanded: boolean;
  children: TreeNode[];
  level: number;
  lastModified?: Date;
  lastModifiedBy?: string;
}

// ────────────────────────────────────────────────────────────
// Layout constants — define once, reuse across header & rows
// ────────────────────────────────────────────────────────────
const ROW_HEIGHT = 56;
const KEY_COL = "min-w-[260px] flex-[0_0_280px]";
const META_COL = "hidden md:flex flex-[0_0_140px] min-w-[120px]";
const LOCALES_COL = "flex-1 min-w-0";

const LOCALE_FLAGS: Record<string, string> = {
  "zh-TW": "🇹🇼",
  "zh-CN": "🇨🇳",
  en: "🇺🇸",
  "en-US": "🇺🇸",
  ja: "🇯🇵",
  ko: "🇰🇷",
  fr: "🇫🇷",
  de: "🇩🇪",
  es: "🇪🇸",
  pt: "🇵🇹",
  ru: "🇷🇺",
  vi: "🇻🇳",
  th: "🇹🇭",
};

export default function TranslationEditorOptimized() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [editingKeyId, setEditingKeyId] = useState<number | null>(null);
  const [editingKeyPath, setEditingKeyPath] = useState("");
  const [pendingUpdates, setPendingUpdates] = useState<
    Map<string, { keyId: number; localeCode: string; value: string }>
  >(new Map());
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const modalSaveRef = useRef<(() => void) | null>(null);

  // 查詢資料
  const utils = trpc.useUtils();
  const localesQuery = trpc.locale.listActive.useQuery();
  const locales = localesQuery.data ?? [];

  // 查詢專案列表
  const projectsQuery = trpc.project.list.useQuery();
  const projects = projectsQuery.data ?? [];

  // 查詢版本列表
  const versionsQuery = trpc.translationVersion.listByProject.useQuery(
    { projectId: selectedProject ?? 0 },
    { enabled: !!selectedProject }
  );
  const versions = versionsQuery.data ?? [];

  // 初始載入：一次性載入所有 Key（全量）
  const rootKeysQuery = trpc.translationKey.listByProject.useQuery(
    { projectId: selectedProject ?? 0 },
    { enabled: !!selectedProject }
  );
  const allKeys = rootKeysQuery.data ?? [];

  // 搜尋篩選
  const rootKeys = useMemo(() => {
    if (!searchTerm) return allKeys;
    return allKeys.filter((k) =>
      k.keyPath.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allKeys, searchTerm]);

  // 使用 translationKey 的 listWithTranslations 來獲取所有翻譯（全量或按版本篩選）
  const translationsQuery = trpc.translationKey.listWithTranslations.useQuery(
    { projectId: selectedProject ?? 0, versionId: selectedVersion ?? undefined },
    { enabled: !!selectedProject }
  );
  const translations = translationsQuery.data ?? [];

  // 構建樹狀結構（一次性）
  const treeData_computed = useMemo(() => {
    const buildTree = (keys: typeof rootKeys): TreeNode[] => {
      const map = new Map<string, TreeNode>();

      for (const key of keys) {
        const parts = key.keyPath.split(".");
        let currentPath = "";

        for (let i = 0; i < parts.length; i++) {
          currentPath = i === 0 ? parts[i] : `${currentPath}.${parts[i]}`;
          const isLeaf = i === parts.length - 1;

          if (!map.has(currentPath)) {
            const trans = isLeaf
              ? translations.find((t: any) => t.id === key.id)
              : null;

            const node: TreeNode = {
              id: `node-${currentPath}`,
              keyPath: parts[i],
              fullPath: currentPath,
              keyId: isLeaf ? key.id : undefined,
              description: isLeaf ? key.description ?? undefined : undefined,
              isFolder: !isLeaf,
              isExpanded: false,
              children: [],
              level: i,
              lastModified: trans?.updatedAt,
              lastModifiedBy: undefined,
            };
            map.set(currentPath, node);

            if (i > 0) {
              const parentPath = currentPath.substring(
                0,
                currentPath.lastIndexOf(".")
              );
              const parent = map.get(parentPath);
              if (parent) {
                parent.children.push(node);
              }
            }
          }
        }
      }

      const roots: TreeNode[] = [];
      const entries = Array.from(map.entries());
      for (const [path, node] of entries) {
        if (!path.includes(".")) {
          roots.push(node);
        }
      }
      return roots.sort((a, b) => a.keyPath.localeCompare(b.keyPath));
    };

    return buildTree(rootKeys);
  }, [rootKeys, translations]);

  // count leaf descendants for folder badges
  const folderLeafCount = useMemo(() => {
    const counts = new Map<string, number>();
    const walk = (nodes: TreeNode[]): number => {
      let leaves = 0;
      for (const n of nodes) {
        if (n.isFolder) {
          const c = walk(n.children);
          counts.set(n.fullPath, c);
          leaves += c;
        } else {
          leaves += 1;
        }
      }
      return leaves;
    };
    walk(treeData_computed);
    return counts;
  }, [treeData_computed]);

  const toggleExpand = useCallback((node: TreeNode) => {
    if (!node.isFolder) return;
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(node.fullPath)) next.delete(node.fullPath);
      else next.add(node.fullPath);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allPaths = new Set<string>();
    const traverse = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.isFolder) {
          allPaths.add(node.fullPath);
          traverse(node.children);
        }
      }
    };
    traverse(treeData_computed);
    setExpandedPaths(allPaths);
  }, [treeData_computed]);

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  const flatList = useMemo(() => {
    const result: TreeNode[] = [];
    const traverse = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        result.push(node);
        if (node.isFolder && expandedPaths.has(node.fullPath)) {
          traverse(node.children);
        }
      }
    };
    traverse(treeData_computed);
    return result;
  }, [treeData_computed, expandedPaths]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flatList.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();

  const getTranslationValue = (keyId: number, localeCode: string) => {
    const key = `${keyId}:${localeCode}`;
    if (pendingUpdates.has(key)) {
      return pendingUpdates.get(key)!.value;
    }
    const trans = translations.find(
      (t: any) => t.id === keyId && t.translations?.[localeCode]
    );
    return trans?.translations?.[localeCode]?.value ?? "";
  };

  const isPending = (keyId: number, localeCode: string) =>
    pendingUpdates.has(`${keyId}:${localeCode}`);

  const getTranslationValues = (keyId: number) => {
    const result: Record<string, string> = {};
    for (const locale of locales) {
      const val = getTranslationValue(keyId, locale.code);
      result[locale.code] = val || "";
    }
    return result;
  };

  const handleCellChange = (keyId: number, localeCode: string, value: string) => {
    const key = `${keyId}:${localeCode}`;
    if (value.trim()) {
      setPendingUpdates((prev) => {
        const next = new Map(prev);
        next.set(key, { keyId, localeCode, value });
        return next;
      });
    } else {
      setPendingUpdates((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleOpenEditModal = (keyId: number, keyPath: string) => {
    setEditingKeyId(keyId);
    setEditingKeyPath(keyPath);
  };

  const handleSaveFromModal = (updates: Record<string, string>) => {
    if (!editingKeyId) return;
    for (const [localeCode, value] of Object.entries(updates)) {
      handleCellChange(editingKeyId, localeCode, value);
    }
  };

  const batchUpdateMutation = trpc.translation.batchUpdate.useMutation({
    onSuccess: () => {
      setPendingUpdates(new Map());
      toast.success("翻譯已保存");
      utils.translationKey.listWithTranslations.invalidate();
    },
    onError: (error) => {
      toast.error(`保存失敗: ${error.message}`);
    },
  });

  const handleSave = useCallback(() => {
    if (pendingUpdates.size === 0) return;
    setShowVersionModal(true);
  }, [pendingUpdates.size]);

  const handleVersionConfirm = async (versionNumber: string) => {
    if (pendingUpdates.size === 0 || !selectedProject) return;
    const updates = Array.from(pendingUpdates.values());
    const versionId = selectedVersion ?? undefined;
    await batchUpdateMutation.mutateAsync({ updates, versionId });
    toast.success(`已保存 ${updates.length} 項變更到版本 ${versionNumber}`);
    setPendingUpdates(new Map());
    setShowVersionModal(false);
  };

  const createKeyMutation = trpc.translationKey.create.useMutation({
    onSuccess: () => {
      toast.success("新 Key 建立成功");
      utils.translationKey.listByProject.invalidate();
      utils.translationKey.listWithTranslations.invalidate();
      setShowCreateKeyModal(false);
    },
    onError: (error) => {
      toast.error(`建立失敗: ${error.message}`);
    },
  });

  const handleCreateKey = async (keyPath: string, description: string) => {
    if (!selectedProject) return;
    await createKeyMutation.mutateAsync({
      projectId: selectedProject,
      keyPath,
      description: description || undefined,
    });
  };

  // 鍵盤快速鍵
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (modalSaveRef.current) modalSaveRef.current();
        else if (pendingUpdates.size > 0) handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "a" && e.target === document.body) {
        e.preventDefault();
        expandAll();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.target === document.body) {
        e.preventDefault();
        collapseAll();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingUpdates.size, expandAll, collapseAll, handleSave]);

  const totalLeafKeys = allKeys.length;
  const totalLocales = locales.length;
  const hasChanges = pendingUpdates.size > 0;

  // ────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-7rem)] gap-4 max-w-[1600px] mx-auto w-full">
        {/* ───────────── Toolbar ───────────── */}
        <div className="rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)] overflow-hidden">
          {/* Row 1 — Context: project / version / stats */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 flex-wrap">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              <FolderTree className="h-3.5 w-3.5" />
              專案
            </div>
            <Select
              value={selectedProject?.toString() ?? ""}
              onValueChange={(v) => {
                setSelectedProject(v ? parseInt(v) : null);
                setSelectedVersion(null);
              }}
            >
              <SelectTrigger className="w-44 h-9">
                <SelectValue placeholder="選擇專案..." />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedProject && versions.length > 0 && (
              <>
                <div className="h-5 w-px bg-border/70" />
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  <GitBranch className="h-3.5 w-3.5" />
                  版本
                </div>
                <Select
                  value={selectedVersion?.toString() ?? ""}
                  onValueChange={(v) =>
                    setSelectedVersion(v ? parseInt(v) : null)
                  }
                >
                  <SelectTrigger className="w-40 h-9">
                    <SelectValue placeholder="最新版本" />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map((version) => (
                      <SelectItem key={version.id} value={version.id.toString()}>
                        {version.versionNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            <Button
              onClick={() => setShowCreateProjectModal(true)}
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              新增專案
            </Button>

            {/* Stat pills — pushed right */}
            {selectedProject && (
              <div className="ml-auto flex items-center gap-2">
                <StatPill
                  icon={<KeyRound className="h-3 w-3" />}
                  label="Keys"
                  value={totalLeafKeys}
                />
                <StatPill
                  icon={<Languages className="h-3 w-3" />}
                  label="語系"
                  value={totalLocales}
                />
              </div>
            )}
          </div>

          {/* Row 2 — Filter + actions */}
          <div className="flex items-center gap-2 px-4 py-2.5 flex-wrap">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70 pointer-events-none" />
              <Input
                placeholder="搜尋 Key..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            <Button
              onClick={() => setShowCreateKeyModal(true)}
              disabled={!selectedProject}
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              新增 Key
            </Button>

            <div className="h-5 w-px bg-border/70 mx-0.5" />

            <Button
              onClick={expandAll}
              disabled={rootKeysQuery.isLoading || !selectedProject}
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5"
              title="展開全部 (⌘A)"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">展開</span>
            </Button>
            <Button
              onClick={collapseAll}
              disabled={expandedPaths.size === 0 || !selectedProject}
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5"
              title="收起全部 (⌘Z)"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">收起</span>
            </Button>

            <Button
              onClick={handleSave}
              disabled={!hasChanges || batchUpdateMutation.isPending}
              size="sm"
              className={`h-9 gap-1.5 min-w-[110px] transition-all ${
                hasChanges ? "shadow-[var(--shadow-glow)]" : ""
              }`}
              title="保存 (⌘S)"
            >
              {batchUpdateMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  保存中…
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  保存{hasChanges ? ` (${pendingUpdates.size})` : ""}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* ───────────── Main panel ───────────── */}
        {!selectedProject ? (
          <EmptyState
            title="請先選擇專案"
            description="從上方下拉選單挑一個專案，或建立新專案開始翻譯"
          />
        ) : rootKeysQuery.isLoading ? (
          <div className="flex-1 rounded-xl border border-border/60 bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border/50 bg-muted/40">
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="space-y-1 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-8 flex-1" />
                </div>
              ))}
            </div>
          </div>
        ) : flatList.length === 0 ? (
          <EmptyState
            title={searchTerm ? "找不到符合的 Key" : "目前沒有任何翻譯 Key"}
            description={
              searchTerm
                ? `「${searchTerm}」沒有匹配的結果，試試其他關鍵字`
                : "點擊「新增 Key」開始建立第一個翻譯條目"
            }
          />
        ) : (
          <div className="flex-1 rounded-xl border border-border/60 bg-card overflow-hidden flex flex-col shadow-[var(--shadow-card)]">
            {/* Sticky header */}
            <div className="sticky top-0 z-10 bg-muted/40 border-b border-border/60 backdrop-blur-sm">
              <div className="flex items-center gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <div className="w-5 shrink-0" />
                <div className={KEY_COL}>Key</div>
                <div className={LOCALES_COL}>
                  <div className="flex gap-2">
                    {locales.map((locale) => (
                      <div
                        key={locale.code}
                        className="flex-1 min-w-[140px] flex items-center gap-1.5"
                      >
                        <span className="text-sm leading-none">
                          {LOCALE_FLAGS[locale.code] ?? "🌐"}
                        </span>
                        <span className="font-mono text-[11px] tracking-tight normal-case">
                          {locale.code}
                        </span>
                        <span className="text-muted-foreground/70 normal-case truncate">
                          · {locale.nativeName}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={`${META_COL} justify-end`}>修改紀錄</div>
              </div>
            </div>

            {/* Virtualized rows */}
            <div ref={parentRef} className="flex-1 overflow-y-auto scrollbar-elegant">
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: "100%",
                  position: "relative",
                }}
              >
                {virtualItems.map((virtualItem) => {
                  const node = flatList[virtualItem.index];
                  if (!node) return null;
                  return (
                    <div
                      key={virtualItem.key}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      {node.isFolder ? (
                        <FolderRow
                          node={node}
                          isExpanded={expandedPaths.has(node.fullPath)}
                          onToggle={() => toggleExpand(node)}
                          leafCount={folderLeafCount.get(node.fullPath) ?? 0}
                        />
                      ) : (
                        <LeafRow
                          node={node}
                          locales={locales}
                          getValue={getTranslationValue}
                          isPending={isPending}
                          onChange={handleCellChange}
                          onOpenModal={handleOpenEditModal}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ───────────── Bottom stats bar ───────────── */}
        {selectedProject && flatList.length > 0 && (
          <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="tabular-nums">
                {searchTerm
                  ? `搜尋結果 · ${flatList.length} / ${allKeys.length}`
                  : `共 ${flatList.length} 個項目`}
              </span>
              <span className="hidden sm:inline text-muted-foreground/60">·</span>
              <span className="hidden sm:inline">
                ⌘<kbd className="font-mono">S</kbd> 保存 · ⌘
                <kbd className="font-mono">A</kbd> 展開 · ⌘
                <kbd className="font-mono">Z</kbd> 收起
              </span>
            </div>
            <div className="flex items-center gap-2">
              {hasChanges ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  {pendingUpdates.size} 項待保存
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  已同步
                </span>
              )}
            </div>
          </div>
        )}

        {/* Modals */}
        <TranslationEditModal
          isOpen={editingKeyId !== null}
          keyPath={editingKeyPath}
          keyId={editingKeyId ?? 0}
          locales={locales}
          translations={editingKeyId ? getTranslationValues(editingKeyId) : {}}
          onClose={() => setEditingKeyId(null)}
          onSave={handleSaveFromModal}
          isSaving={batchUpdateMutation.isPending}
          onSaveRef={modalSaveRef}
        />
        <VersionSelectModal
          isOpen={showVersionModal}
          projectId={selectedProject ?? undefined}
          existingVersions={versions}
          onConfirm={handleVersionConfirm}
          onCancel={() => setShowVersionModal(false)}
          isLoading={batchUpdateMutation.isPending}
          onVersionCreated={() => {
            utils.translationVersion.listByProject.invalidate();
          }}
        />
        <CreateProjectModal
          isOpen={showCreateProjectModal}
          onClose={() => setShowCreateProjectModal(false)}
        />
        <CreateKeyModal
          isOpen={showCreateKeyModal}
          onConfirm={handleCreateKey}
          onCancel={() => setShowCreateKeyModal(false)}
          isLoading={createKeyMutation.isPending}
        />
      </div>
    </DashboardLayout>
  );
}

// ──────────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────────

function StatPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-muted text-foreground border border-border/60 text-xs">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex-1 rounded-xl border border-dashed border-border bg-card/50 flex items-center justify-center p-12">
      <div className="text-center max-w-sm">
        <div
          className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "var(--gradient-primary)" }}
        >
          <FolderTree className="h-7 w-7 text-white" strokeWidth={2} />
        </div>
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

function FolderRow({
  node,
  isExpanded,
  onToggle,
  leafCount,
}: {
  node: TreeNode;
  isExpanded: boolean;
  onToggle: () => void;
  leafCount: number;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full h-full flex items-center gap-3 px-4 text-left transition-colors border-b border-border/60 bg-muted/20 hover:bg-muted/50 group/folder"
      style={{ paddingLeft: `${16 + node.level * 16}px` }}
    >
      <span className="shrink-0 w-5 flex items-center justify-center text-muted-foreground group-hover/folder:text-foreground transition-colors">
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </span>
      <div className={`${KEY_COL} flex items-center gap-2 min-w-0`}>
        <FolderTree
          className={`h-4 w-4 shrink-0 ${isExpanded ? "text-primary" : "text-muted-foreground/70"}`}
        />
        <span className="font-mono text-sm font-semibold tracking-tight truncate">
          {node.keyPath}
        </span>
      </div>
      <div className={`${LOCALES_COL} flex items-center`}>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-background border border-border text-[11px] text-muted-foreground tabular-nums">
          <KeyRound className="h-2.5 w-2.5" />
          {leafCount}
        </span>
      </div>
      <div className={`${META_COL} text-xs text-muted-foreground/60 italic justify-end`}>
        群組
      </div>
    </button>
  );
}

function LeafRow({
  node,
  locales,
  getValue,
  isPending,
  onChange,
  onOpenModal,
}: {
  node: TreeNode;
  locales: any[];
  getValue: (keyId: number, code: string) => string;
  isPending: (keyId: number, code: string) => boolean;
  onChange: (keyId: number, code: string, value: string) => void;
  onOpenModal: (keyId: number, keyPath: string) => void;
}) {
  if (!node.keyId) return null;

  const lastModifiedStr = node.lastModified
    ? new Date(node.lastModified).toLocaleDateString("zh-TW", {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div
      className="group/row w-full h-full flex items-center gap-3 px-4 border-b border-border/60 hover:bg-muted/30 transition-colors relative"
      style={{ paddingLeft: `${16 + node.level * 16}px` }}
    >
      {/* Active accent bar on hover */}
      <span
        aria-hidden
        className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full bg-primary opacity-0 group-hover/row:opacity-60 transition-opacity"
      />

      <span className="shrink-0 w-5" />

      {/* Key + description */}
      <button
        type="button"
        onClick={() => onOpenModal(node.keyId!, node.fullPath)}
        className={`${KEY_COL} text-left min-w-0 flex flex-col justify-center group/key`}
        title="點擊以詳細編輯"
      >
        <span className="font-mono text-sm font-medium truncate group-hover/key:text-primary transition-colors">
          {node.keyPath}
        </span>
        {node.description && (
          <span className="text-[11px] text-muted-foreground truncate mt-0.5">
            {node.description}
          </span>
        )}
      </button>

      {/* Locale inputs */}
      <div className={`${LOCALES_COL} flex gap-2`}>
        {locales.map((locale) => {
          const val = getValue(node.keyId!, locale.code);
          const pending = isPending(node.keyId!, locale.code);
          const filled = !!val.trim();
          return (
            <div
              key={locale.code}
              className="flex-1 min-w-[140px] relative"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                placeholder={`${locale.code}…`}
                value={val}
                onChange={(e) =>
                  onChange(node.keyId!, locale.code, e.target.value)
                }
                onClick={(e) => e.stopPropagation()}
                className={`peer w-full h-9 pl-2.5 pr-7 text-sm rounded-md bg-input border transition-all
                  focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25
                  ${pending
                    ? "border-amber-500/60 bg-amber-500/5"
                    : filled
                      ? "border-border"
                      : "border-border/70 text-muted-foreground"}`}
                title={`${locale.name} (${locale.code})`}
              />
              {/* Status dot */}
              <span
                aria-hidden
                className={`absolute right-2.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full transition-all peer-focus:opacity-0 ${
                  pending
                    ? "bg-amber-500 animate-pulse"
                    : filled
                      ? "bg-emerald-500"
                      : "bg-border"
                }`}
              />
            </div>
          );
        })}
      </div>

      {/* Meta */}
      <div className={`${META_COL} flex-col items-end justify-center text-right`}>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {lastModifiedStr ?? "—"}
        </span>
        {node.lastModifiedBy && (
          <span className="text-[10px] text-muted-foreground/70 truncate max-w-full">
            {node.lastModifiedBy}
          </span>
        )}
      </div>
    </div>
  );
}
