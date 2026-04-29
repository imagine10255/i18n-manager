import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronRight, ChevronDown, Save, Loader2 } from "lucide-react";
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
    return allKeys.filter(
      (k) => k.keyPath.toLowerCase().includes(searchTerm.toLowerCase())
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
              description: isLeaf ? (key.description ?? undefined) : undefined,
              isFolder: !isLeaf,
              isExpanded: false,
              children: [],
              level: i,
              lastModified: trans?.updatedAt,
              lastModifiedBy: undefined,
            };
            map.set(currentPath, node);

            if (i > 0) {
              const parentPath = currentPath.substring(0, currentPath.lastIndexOf("."));
              const parent = map.get(parentPath);
              if (parent) {
                parent.children.push(node);
              }
            }
          }
        }
      }

      // 返回根節點
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

  // 直接使用 treeData_computed，不需要 state 同步

  // 切換展開/收起
  const toggleExpand = useCallback((node: TreeNode) => {
    if (!node.isFolder) return;
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(node.fullPath)) {
        next.delete(node.fullPath);
      } else {
        next.add(node.fullPath);
      }
      return next;
    });
  }, []);

  // 全部展開
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

  // 全部收起
  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  // 扁平化樹狀結構用於虛擬滾動
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

  // 虛擬滾動
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flatList.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // 獲取翻譯值
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

  const getTranslationValues = (keyId: number) => {
    const result: Record<string, string> = {};
    for (const locale of locales) {
      const val = getTranslationValue(keyId, locale.code);
      result[locale.code] = val || "";
    }
    return result;
  };

  // 編輯單元格
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

  // 打開 Modal 編輯
  const handleOpenEditModal = (keyId: number, keyPath: string) => {
    setEditingKeyId(keyId);
    setEditingKeyPath(keyPath);
  };

  // 從 Modal 保存
  const handleSaveFromModal = (updates: Record<string, string>) => {
    if (!editingKeyId) return;
    for (const [localeCode, value] of Object.entries(updates)) {
      handleCellChange(editingKeyId, localeCode, value);
    }
  };

  // 批次保存
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
      // Ctrl+S 或 Cmd+S：保存
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        // 先嘗試在 Modal 中保存
        if (modalSaveRef.current) {
          modalSaveRef.current();
        } else if (pendingUpdates.size > 0) {
          handleSave();
        }
      }
      // Ctrl+A 或 Cmd+A：全部展開（當焦點不在輸入框時）
      if ((e.ctrlKey || e.metaKey) && e.key === "a" && e.target === document.body) {
        e.preventDefault();
        expandAll();
      }
      // Ctrl+Z 或 Cmd+Z：全部收起（當焦點不在輸入框時）
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.target === document.body) {
        e.preventDefault();
        collapseAll();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingUpdates.size, expandAll, collapseAll]);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 h-full">
        {/* 工具欄 */}
        <Card className="p-4">
          <div className="flex gap-2 items-center flex-wrap">
            {/* 專案選擇 */}
            <Select
              value={selectedProject?.toString() ?? ""}
              onValueChange={(v) => {
                setSelectedProject(v ? parseInt(v) : null);
                setSelectedVersion(null);
              }}
            >
              <SelectTrigger className="w-48">
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

            {/* 版本選擇（可選） */}
            {selectedProject && versions.length > 0 && (
              <Select value={selectedVersion?.toString() ?? ""} onValueChange={(v) => setSelectedVersion(v ? parseInt(v) : null)}>
                <SelectTrigger className="w-48">
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
            )}

            {/* 新增專案按鈕 */}
            <Button
              onClick={() => setShowCreateProjectModal(true)}
              variant="outline"
              size="sm"
            >
              + 新增專案
            </Button>

            {/* 搜尋 */}
            <Input
              placeholder="搜尋 Key..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 min-w-64"
            />

            {/* 新增 Key 按鈕 */}
            <Button
              onClick={() => setShowCreateKeyModal(true)}
              disabled={!selectedProject}
              variant="outline"
              size="sm"
            >
              + 新增 Key
            </Button>

            {/* 展開/收起按鈕 */}
            <Button
              onClick={expandAll}
              disabled={rootKeysQuery.isLoading || !selectedProject}
              variant="outline"
              size="sm"
            >
              全部展開
            </Button>
            <Button
              onClick={collapseAll}
              disabled={expandedPaths.size === 0 || !selectedProject}
              variant="outline"
              size="sm"
            >
              全部收起
            </Button>

            {/* 保存按鈕 */}
            <Button
              onClick={handleSave}
              disabled={pendingUpdates.size === 0 || batchUpdateMutation.isPending}
              className="gap-2"
            >
              {batchUpdateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  保存 ({pendingUpdates.size})
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* 表格標題 */}
        {selectedProject && (
          <div className="px-4 py-2 bg-muted/50 rounded-t-lg border-b">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <div className="w-6" />
              <div className="min-w-48">Key</div>
              <div className="text-xs text-muted-foreground ml-2">備註</div>
              <div className="flex-1 ml-4 font-semibold">語系對應</div>
              <div className="min-w-32 text-xs">修改日期</div>
              <div className="min-w-24 text-xs">異動者</div>
            </div>
          </div>
        )}

        {/* 樹狀列表 */}
        {!selectedProject ? (
          <Card className="p-8 text-center text-muted-foreground">
            請先選擇專案
          </Card>
        ) : rootKeysQuery.isLoading ? (
          <div className="space-y-2 px-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col flex-1 border rounded-b-lg bg-card">
            {/* 表格標題列 */}
            <div className="sticky top-0 z-10 bg-muted/50 border-b">
              <div className="px-4 py-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground border-b">
                <div className="w-6" />
                <div className="min-w-48">Key 名稱</div>
                <div className="text-xs max-w-32">備註</div>
                <div className="flex gap-1 ml-4 flex-1 min-w-0 font-semibold">語系對應</div>
                <div className="min-w-32">修改日期</div>
                <div className="min-w-24">異動者</div>
              </div>
              <div className="px-4 py-2 flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-6" />
                <div className="min-w-48" />
                <div className="text-xs max-w-32" />
                <div className="flex gap-1 ml-4 flex-1 min-w-0">
                  {locales.map((locale) => (
                    <div key={locale.code} className="flex-1 min-w-24 text-center text-xs">
                      {locale.code}
                    </div>
                  ))}
                </div>
                <div className="min-w-32" />
                <div className="min-w-24" />
              </div>
            </div>
            {/* 表格內容 */}
            <div
              ref={parentRef}
              className="flex-1 overflow-y-auto"
            >
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
                    className="border-b px-4 py-2 flex items-center gap-2 bg-background hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => {
                      if (!node.isFolder && node.keyId) {
                        handleOpenEditModal(node.keyId, node.fullPath);
                      } else {
                        toggleExpand(node);
                      }
                    }}
                  >
                    {/* 展開/收起按鈕 */}
                    {node.isFolder ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(node);
                        }}
                        className="flex-shrink-0 p-1 hover:bg-muted rounded"
                      >
                        {expandedPaths.has(node.fullPath) ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                    ) : (
                      <div className="w-6" />
                    )}

                    {/* Key 名稱 */}
                    <div
                      className="min-w-48 font-mono text-sm flex-shrink-0"
                      style={{ marginLeft: `${node.level * 12}px` }}
                    >
                      <span className="text-foreground font-medium">{node.keyPath}</span>
                    </div>

                    {/* 備註 */}
                    <div className="text-xs text-muted-foreground truncate max-w-32">
                      {node.description || "-"}
                    </div>

                    {/* 多語系編輯欄 */}
                    {!node.isFolder && node.keyId && (
                      <div className="flex gap-1 ml-4 flex-1 min-w-0">
                        {locales.map((locale) => (
                          <div key={locale.code} className="flex-1 min-w-24">
                            <input
                              type="text"
                              placeholder={locale.code}
                              value={getTranslationValue(node.keyId!, locale.code)}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleCellChange(node.keyId!, locale.code, e.target.value);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full px-2 py-1 text-xs border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary truncate"
                              title={`${locale.name} (${locale.code})`}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 修改日期 */}
                    <div className="min-w-32 text-xs text-muted-foreground flex-shrink-0">
                      {node.lastModified
                        ? new Date(node.lastModified).toLocaleDateString("zh-TW")
                        : "-"}
                    </div>

                    {/* 異動者 */}
                    <div className="min-w-24 text-xs text-muted-foreground flex-shrink-0 truncate">
                      {node.lastModifiedBy || "-"}
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        )}

        {/* 統計資訊 */}
        {selectedProject && (
          <div className="text-xs text-muted-foreground flex justify-between items-center px-4 py-2">
            <span>
              {searchTerm
                ? `搜尋結果: ${flatList.length} / ${allKeys.length} 個 Key`
                : `顯示 ${flatList.length} 個 Key`}
            </span>
            <span>待保存: {pendingUpdates.size} 項變更</span>
          </div>
        )}

        {/* 編輯模態對話框 */}
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

        {/* 版本選擇對話框 */}
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

        {/* 新增專案對話框 */}
        <CreateProjectModal
          isOpen={showCreateProjectModal}
          onClose={() => setShowCreateProjectModal(false)}
        />

        {/* 新增 Key 對話框 */}
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


