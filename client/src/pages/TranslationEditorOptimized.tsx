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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  X,
  Trash2,
  MoreVertical,
  Download,
  Upload,
  FileJson,
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
  lastModifiedBy?: number; // user id, resolved to name at render
}

// ────────────────────────────────────────────────────────────
// Import / export helpers (pure functions)
// ────────────────────────────────────────────────────────────
function buildNestedJson(
  pairs: Array<{ keyPath: string; value: string }>
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const { keyPath, value } of pairs) {
    if (!value) continue;
    const parts = keyPath.split(".");
    let cur: any = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (!cur[seg] || typeof cur[seg] !== "object") cur[seg] = {};
      cur = cur[seg];
    }
    cur[parts[parts.length - 1]] = value;
  }
  return result;
}

function flattenJson(
  obj: any,
  prefix = "",
  out: Record<string, string> = {}
): Record<string, string> {
  if (obj == null || typeof obj !== "object") return out;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      flattenJson(v, key, out);
    } else if (typeof v === "string") {
      out[key] = v;
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[key] = String(v);
    }
  }
  return out;
}

/** Recent edits show as relative time ("3 分鐘前"); older edits as a date. */
function formatRelativeOrDate(d: Date): string {
  const now = Date.now();
  const diffMs = now - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 0) return d.toLocaleDateString("zh-TW", { month: "short", day: "numeric" });
  if (sec < 60) return "剛剛";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} 天前`;
  return d.toLocaleDateString("zh-TW", { month: "short", day: "numeric" });
}

function downloadFile(filename: string, content: string, mime = "application/json") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ────────────────────────────────────────────────────────────
// Layout constants — define once, reuse across header & rows
// ────────────────────────────────────────────────────────────
const ROW_HEIGHT = 56;
const KEY_COL = "min-w-[260px] flex-[0_0_280px]";
const META_COL = "hidden md:flex flex-[0_0_160px] min-w-[120px]";
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
  const [openProjectIds, setOpenProjectIdsState] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem("i18n-editor-open-projects");
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr)
        ? arr.filter((x: any) => typeof x === "number")
        : [];
    } catch {
      return [];
    }
  });
  const setOpenProjectIds = useCallback(
    (updater: (prev: number[]) => number[]) => {
      setOpenProjectIdsState((prev) => {
        const next = updater(prev);
        try {
          localStorage.setItem(
            "i18n-editor-open-projects",
            JSON.stringify(next)
          );
        } catch {}
        return next;
      });
    },
    []
  );
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [onlyVersionKeys, setOnlyVersionKeys] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [editingKeyId, setEditingKeyId] = useState<number | null>(null);
  const [editingKeyPath, setEditingKeyPath] = useState("");
  const [pendingUpdates, setPendingUpdates] = useState<
    Map<string, { keyId: number; localeCode: string; value: string }>
  >(new Map());
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [deletingKey, setDeletingKey] = useState<{ id: number; path: string } | null>(null);
  const [importFile, setImportFile] = useState<{
    file: File;
    parsed: Record<string, string>;
    localeCode: string;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const modalSaveRef = useRef<(() => void) | null>(null);

  // 查詢資料
  const utils = trpc.useUtils();
  const localesQuery = trpc.locale.listActive.useQuery();
  const locales = localesQuery.data ?? [];

  // 查詢專案列表
  const projectsQuery = trpc.project.list.useQuery();
  const projects = projectsQuery.data ?? [];

  // 使用者目錄（id → name）— 用於顯示「最後修改者」
  const usersQuery = trpc.user.listBasic.useQuery();
  const userIdToName = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of (usersQuery.data ?? []) as any[]) {
      m.set(u.id, u.name || "");
    }
    return m;
  }, [usersQuery.data]);

  // ── Project tab strip sync ──
  // 1) Auto-add selected project to the tab strip
  useEffect(() => {
    if (selectedProject !== null) {
      setOpenProjectIds((prev) =>
        prev.includes(selectedProject) ? prev : [...prev, selectedProject]
      );
    }
  }, [selectedProject, setOpenProjectIds]);

  // 2) Reconcile against fetched project list (prune deleted / restore selection)
  useEffect(() => {
    if (projects.length === 0) return;
    const validIds = new Set(projects.map((p: any) => p.id));
    let validOpen: number[] = openProjectIds.filter((id) => validIds.has(id));
    if (validOpen.length !== openProjectIds.length) {
      setOpenProjectIds(() => validOpen);
    }
    if (selectedProject !== null && !validIds.has(selectedProject)) {
      setSelectedProject(null);
    }
    // Auto-select first open tab if none selected (e.g. on first mount with persisted tabs)
    if (selectedProject === null && validOpen.length > 0) {
      setSelectedProject(validOpen[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  const openTabsList = useMemo(() => {
    const map = new Map<number, any>(
      (projects as any[]).map((p) => [p.id, p])
    );
    return openProjectIds
      .map((id) => map.get(id))
      .filter(Boolean) as any[];
  }, [openProjectIds, projects]);

  const closableProjects = useMemo(
    () => (projects as any[]).filter((p) => !openProjectIds.includes(p.id)),
    [projects, openProjectIds]
  );

  const handleCloseTab = useCallback(
    (id: number) => {
      setOpenProjectIds((prev) => {
        const idx = prev.indexOf(id);
        const next = prev.filter((x) => x !== id);
        if (selectedProject === id) {
          // pick neighbor: prefer right, fall back to left, else null
          const neighbor =
            next[idx] ?? next[idx - 1] ?? next[next.length - 1] ?? null;
          setSelectedProject(neighbor);
          setSelectedVersion(null);
          setOnlyVersionKeys(false);
        }
        return next;
      });
    },
    [selectedProject, setOpenProjectIds]
  );

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

  // 使用 translationKey 的 listWithTranslations 來獲取所有翻譯（全量或按版本篩選）
  const translationsQuery = trpc.translationKey.listWithTranslations.useQuery(
    { projectId: selectedProject ?? 0, versionId: selectedVersion ?? undefined },
    { enabled: !!selectedProject }
  );
  const translations = translationsQuery.data ?? [];

  // 搜尋 + 版本範圍 篩選
  const rootKeys = useMemo(() => {
    let pool = allKeys;

    // 1) 「僅該版本 Key」 — 只保留該版本內出現過的 keyId
    if (onlyVersionKeys && selectedVersion !== null) {
      const versionKeyIds = new Set<number>(
        (translations as any[]).map((t) => t.id)
      );
      pool = pool.filter((k) => versionKeyIds.has(k.id));
    }

    // 2) 搜尋 — 比對 keyPath / description / 任一語系翻譯內容
    if (!searchTerm) return pool;
    const q = searchTerm.toLowerCase();
    const matchedKeyIds = new Set<number>();
    for (const t of translations as any[]) {
      const trans = t.translations as
        | Record<string, { value?: string }>
        | undefined;
      if (!trans) continue;
      for (const code of Object.keys(trans)) {
        const v = trans[code]?.value;
        if (v && v.toLowerCase().includes(q)) {
          matchedKeyIds.add(t.id);
          break;
        }
      }
    }
    return pool.filter(
      (k) =>
        k.keyPath.toLowerCase().includes(q) ||
        (k.description ?? "").toLowerCase().includes(q) ||
        matchedKeyIds.has(k.id)
    );
  }, [allKeys, translations, searchTerm, onlyVersionKeys, selectedVersion]);

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
              ? (translations.find((t: any) => t.id === key.id) as any)
              : null;

            // Find the most recent translation across all locales for this key
            // → this is the meaningful "last edited" timestamp / author for the row.
            let latestAt: Date | undefined;
            let latestBy: number | undefined;
            if (trans?.translations) {
              for (const code of Object.keys(trans.translations)) {
                const cell = trans.translations[code];
                if (cell?.updatedAt) {
                  const at = new Date(cell.updatedAt);
                  if (!latestAt || at > latestAt) {
                    latestAt = at;
                    latestBy = cell.updatedBy ?? undefined;
                  }
                }
              }
            }

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
              lastModified: latestAt ?? trans?.updatedAt,
              lastModifiedBy: latestBy,
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

  // When user is searching, auto-expand all folders so matches inside groups are visible
  const isSearching = searchTerm.trim().length > 0;
  const flatList = useMemo(() => {
    const result: TreeNode[] = [];
    const traverse = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        result.push(node);
        if (
          node.isFolder &&
          (isSearching || expandedPaths.has(node.fullPath))
        ) {
          traverse(node.children);
        }
      }
    };
    traverse(treeData_computed);
    return result;
  }, [treeData_computed, expandedPaths, isSearching]);

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

  const handleSave = useCallback(async () => {
    if (pendingUpdates.size === 0 || !selectedProject) return;
    // If a version is already selected (filtered), save directly to that
    // version without prompting again.
    if (selectedVersion !== null) {
      const updates = Array.from(pendingUpdates.values());
      await batchUpdateMutation.mutateAsync({
        updates,
        versionId: selectedVersion,
      });
      const v = versions.find((x) => x.id === selectedVersion);
      toast.success(
        `已保存 ${updates.length} 項變更到版本 ${v?.versionNumber ?? selectedVersion}`
      );
      setPendingUpdates(new Map());
      return;
    }
    // No version selected — ask the user which version to bind these changes to
    setShowVersionModal(true);
  }, [pendingUpdates, selectedProject, selectedVersion, versions, batchUpdateMutation]);

  const handleVersionConfirm = async (versionId: number, versionNumber: string) => {
    if (pendingUpdates.size === 0 || !selectedProject) return;
    const updates = Array.from(pendingUpdates.values());
    await batchUpdateMutation.mutateAsync({ updates, versionId });
    toast.success(`已保存 ${updates.length} 項變更到版本 ${versionNumber}`);
    setPendingUpdates(new Map());
    setShowVersionModal(false);
  };

  const deleteKeyMutation = trpc.translationKey.delete.useMutation({
    onSuccess: () => {
      toast.success("Key 已刪除");
      utils.translationKey.listByProject.invalidate();
      utils.translationKey.listWithTranslations.invalidate();
      setDeletingKey(null);
    },
    onError: (error) => {
      toast.error(`刪除失敗: ${error.message}`);
    },
  });

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

  // ────────────────────────────────────────────────────────
  // Export
  // ────────────────────────────────────────────────────────
  const buildLocalePairs = useCallback(
    (localeCode: string) => {
      const pairs: { keyPath: string; value: string }[] = [];
      for (const t of translations as any[]) {
        const k = allKeys.find((x: any) => x.id === t.id);
        if (!k) continue;
        const value = t.translations?.[localeCode]?.value;
        if (typeof value === "string" && value.length > 0) {
          pairs.push({ keyPath: k.keyPath, value });
        }
      }
      return pairs;
    },
    [allKeys, translations]
  );

  const handleExportLocale = useCallback(
    (localeCode: string) => {
      const pairs = buildLocalePairs(localeCode);
      const json = JSON.stringify(buildNestedJson(pairs), null, 2);
      downloadFile(`${localeCode}.json`, json);
      toast.success(`已匯出 ${localeCode}.json（${pairs.length} 個翻譯）`);
    },
    [buildLocalePairs]
  );

  const handleExportAll = useCallback(() => {
    if (locales.length === 0) return;
    locales.forEach((l, i) => {
      setTimeout(() => handleExportLocale(l.code), i * 250);
    });
  }, [locales, handleExportLocale]);

  // ────────────────────────────────────────────────────────
  // Import
  // ────────────────────────────────────────────────────────
  const [pendingImportLocale, setPendingImportLocale] = useState<string | null>(null);

  const handleImportTriggerFor = (localeCode: string) => {
    setPendingImportLocale(localeCode);
    importInputRef.current?.click();
  };

  const handleImportFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !pendingImportLocale) return;
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      const flat = flattenJson(obj);
      const count = Object.keys(flat).length;
      if (count === 0) {
        toast.error("檔案內沒有可匯入的翻譯");
        return;
      }
      setImportFile({ file, parsed: flat, localeCode: pendingImportLocale });
    } catch (err: any) {
      toast.error(`無法解析 JSON：${err?.message ?? "格式錯誤"}`);
    }
  };

  const handleConfirmImport = async () => {
    if (!importFile || !selectedProject) return;
    const { parsed, localeCode } = importFile;
    const existingByPath = new Map(allKeys.map((k: any) => [k.keyPath, k.id as number]));
    let createdCount = 0;
    let updatedCount = 0;
    const updates: { keyId: number; localeCode: string; value: string }[] = [];

    try {
      for (const [keyPath, value] of Object.entries(parsed)) {
        let keyId = existingByPath.get(keyPath);
        if (!keyId) {
          const created = await createKeyMutation.mutateAsync({
            projectId: selectedProject,
            keyPath,
          });
          keyId = (created as any).id as number;
          existingByPath.set(keyPath, keyId);
          createdCount++;
        }
        updates.push({ keyId: keyId!, localeCode, value });
        updatedCount++;
      }
      if (updates.length > 0) {
        await batchUpdateMutation.mutateAsync({
          updates,
          versionId: selectedVersion ?? undefined,
        });
      }
      toast.success(
        `匯入完成 · 新增 ${createdCount} 個 Key、寫入 ${updatedCount} 個 ${localeCode} 翻譯`
      );
      setImportFile(null);
    } catch (err: any) {
      toast.error(`匯入失敗：${err?.message ?? "未知錯誤"}`);
    }
  };

  // ────────────────────────────────────────────────────────
  // Delete
  // ────────────────────────────────────────────────────────
  const handleConfirmDelete = async () => {
    if (!deletingKey) return;
    await deleteKeyMutation.mutateAsync({ id: deletingKey.id });
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

  // Compute minimum row width so many-locale layouts can scroll horizontally
  // instead of squeezing inputs and clipping the meta column.
  // Layout: pl(16) + KEY(280) + gap(12) + locales*(120 + 8 gap, less last) + 12 + META(160) + 12 + KEBAB(32) + pr(16)
  const tableMinWidth = useMemo(() => {
    const base = 16 + 280 + 12 + 12 + 160 + 12 + 32 + 16; // 540
    const localesWidth =
      locales.length === 0
        ? 0
        : locales.length * 120 + (locales.length - 1) * 8;
    return base + localesWidth;
  }, [locales.length]);

  // ────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-7rem)] gap-4 max-w-[1600px] mx-auto w-full">
        {/* ───────────── Project tab strip ───────────── */}
        <div className="flex items-end gap-1 -mb-px overflow-x-auto scrollbar-elegant">
          {openTabsList.map((p) => (
            <ProjectTab
              key={p.id}
              name={p.name}
              active={selectedProject === p.id}
              onClick={() => {
                if (selectedProject !== p.id) {
                  setSelectedProject(p.id);
                  setSelectedVersion(null);
                  setOnlyVersionKeys(false);
                }
              }}
              onClose={() => handleCloseTab(p.id)}
            />
          ))}

          {/* "+" — open another project / new project */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors mb-0.5 ml-0.5"
                title="開啟專案"
                aria-label="開啟專案"
              >
                <Plus className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {closableProjects.length > 0 && (
                <>
                  <DropdownMenuLabel className="text-xs">
                    開啟現有專案
                  </DropdownMenuLabel>
                  {closableProjects.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => {
                        setSelectedProject(p.id);
                        setSelectedVersion(null);
                        setOnlyVersionKeys(false);
                      }}
                      className="cursor-pointer"
                    >
                      <FolderTree className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                      <span className="truncate">{p.name}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                onClick={() => setShowCreateProjectModal(true)}
                className="cursor-pointer text-primary focus:text-primary"
              >
                <Plus className="h-3.5 w-3.5 mr-2" />
                新建專案
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* ───────────── Toolbar ───────────── */}
        <div className="rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)] overflow-hidden">
          {/* Row 1 — Context: version / stats (hidden when no project chosen) */}
          {selectedProject && (
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 flex-wrap">
            {versions.length > 0 && (
              <>
                <div className="h-5 w-px bg-border/70" />
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  <GitBranch className="h-3.5 w-3.5" />
                  版本
                </div>
                <div className="relative flex items-center">
                  <Select
                    value={selectedVersion?.toString() ?? "__latest__"}
                    onValueChange={(v) =>
                      setSelectedVersion(v === "__latest__" ? null : parseInt(v))
                    }
                  >
                    <SelectTrigger className={`w-40 h-9 ${selectedVersion ? "pr-9" : ""}`}>
                      <SelectValue placeholder="最新版本" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__latest__">
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          最新版本
                        </span>
                      </SelectItem>
                      {versions.map((version) => (
                        <SelectItem key={version.id} value={version.id.toString()}>
                          {version.versionNumber}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedVersion !== null && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedVersion(null);
                        setOnlyVersionKeys(false);
                      }}
                      className="absolute right-7 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="清除選取，回到最新版本"
                      aria-label="清除版本選取"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Show only this version's keys */}
                <div
                  className={`flex items-center gap-2 px-2 h-9 rounded-md border transition-colors ${
                    selectedVersion !== null
                      ? "border-border/60 bg-muted/40"
                      : "border-transparent opacity-50"
                  }`}
                >
                  <Switch
                    id="only-version-keys"
                    checked={onlyVersionKeys && selectedVersion !== null}
                    disabled={selectedVersion === null}
                    onCheckedChange={(v) => setOnlyVersionKeys(!!v)}
                    className="data-[state=checked]:bg-primary"
                  />
                  <Label
                    htmlFor="only-version-keys"
                    className="text-xs cursor-pointer select-none"
                  >
                    僅該版本 Key
                  </Label>
                </div>
              </>
            )}

            {/* Stat pills — pushed right */}
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
          </div>
          )}

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

            {/* Import dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  disabled={!selectedProject || locales.length === 0}
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5"
                  title="匯入 JSON"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">匯入</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs">
                  選擇匯入到哪個語系
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {locales.map((l) => (
                  <DropdownMenuItem
                    key={l.code}
                    onClick={() => handleImportTriggerFor(l.code)}
                    className="cursor-pointer"
                  >
                    <span className="text-base mr-2 leading-none">
                      {LOCALE_FLAGS[l.code] ?? "🌐"}
                    </span>
                    <span className="font-mono text-xs">{l.code}</span>
                    <span className="text-muted-foreground ml-2 truncate">
                      · {l.nativeName}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Export dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  disabled={!selectedProject || locales.length === 0}
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5"
                  title="匯出 JSON"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">匯出</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  onClick={handleExportAll}
                  className="cursor-pointer font-medium"
                >
                  <FileJson className="h-4 w-4 mr-2 text-primary" />
                  全部語系（每個一檔）
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">單一語系</DropdownMenuLabel>
                {locales.map((l) => (
                  <DropdownMenuItem
                    key={l.code}
                    onClick={() => handleExportLocale(l.code)}
                    className="cursor-pointer"
                  >
                    <span className="text-base mr-2 leading-none">
                      {LOCALE_FLAGS[l.code] ?? "🌐"}
                    </span>
                    <span className="font-mono text-xs">{l.code}</span>
                    <span className="text-muted-foreground ml-2 truncate">
                      .json
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Hidden file input for import */}
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFileSelected}
              className="hidden"
            />

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
            {/* Single scroll container — header is sticky vertically, scrolls horizontally with rows */}
            <div ref={parentRef} className="flex-1 overflow-auto scrollbar-elegant">
            <div style={{ minWidth: `${tableMinWidth}px` }}>
            {/* Header */}
            <div className="sticky top-0 z-10 bg-muted/40 border-b border-border/60 backdrop-blur-sm">
              <div
                className="flex items-center gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                <div className={KEY_COL}>Key</div>
                <div className={LOCALES_COL}>
                  <div className="flex gap-2">
                    {locales.map((locale) => (
                      <div
                        key={locale.code}
                        className="flex-1 min-w-[120px] flex items-center gap-1.5"
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
                <div className={`${META_COL} justify-end`}>最後修改</div>
                <div className="shrink-0 w-8" aria-hidden />
              </div>
            </div>

            {/* Virtualized rows */}
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
                          onRequestDelete={(id, path) =>
                            setDeletingKey({ id, path })
                          }
                          userIdToName={userIdToName}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
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

        {/* Delete confirmation */}
        <AlertDialog
          open={deletingKey !== null}
          onOpenChange={(open) => !open && setDeletingKey(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-destructive" />
                確定刪除此 Key？
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-sm text-muted-foreground space-y-2">
                  <div>
                    將軟刪除 Key{" "}
                    <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                      {deletingKey?.path}
                    </code>{" "}
                    及其所有語系翻譯。
                  </div>
                  <div className="text-xs text-muted-foreground/80">
                    此動作會記錄在修改歷程中，必要時可由管理員復原。
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleConfirmDelete();
                }}
                disabled={deleteKeyMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteKeyMutation.isPending ? (
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

        {/* Import preview */}
        <AlertDialog
          open={importFile !== null}
          onOpenChange={(open) => !open && setImportFile(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" />
                匯入翻譯
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-sm text-muted-foreground space-y-3">
                  <div>
                    檔案：{" "}
                    <span className="font-medium text-foreground">
                      {importFile?.file.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>目標語系：</span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-mono text-xs">
                      {LOCALE_FLAGS[importFile?.localeCode ?? ""] ?? "🌐"}
                      {importFile?.localeCode}
                    </span>
                  </div>
                  {importFile && (
                    <div className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed">
                      將寫入{" "}
                      <span className="font-semibold tabular-nums">
                        {Object.keys(importFile.parsed).length}
                      </span>{" "}
                      個翻譯。檔案中存在但專案未有的 Key 會自動建立；
                      已存在的 Key 會更新對應語系的翻譯值。
                    </div>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleConfirmImport();
                }}
                disabled={
                  batchUpdateMutation.isPending || createKeyMutation.isPending
                }
              >
                {batchUpdateMutation.isPending || createKeyMutation.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    匯入中…
                  </>
                ) : (
                  "確認匯入"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}

// ──────────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────────

function ProjectTab({
  name,
  active,
  onClick,
  onClose,
}: {
  name: string;
  active: boolean;
  onClick: () => void;
  onClose: () => void;
}) {
  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`group/tab relative flex items-center gap-2 h-9 pl-3 pr-1.5 rounded-t-lg border border-b-0 cursor-pointer text-sm transition-colors max-w-[200px] ${
        active
          ? "bg-card text-foreground border-border"
          : "bg-muted/30 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute top-0 left-2 right-2 h-0.5 rounded-full"
          style={{ background: "var(--gradient-primary)" }}
        />
      )}
      <FolderTree
        className={`h-3.5 w-3.5 shrink-0 ${active ? "text-primary" : "text-muted-foreground/70"}`}
      />
      <span className="truncate">{name}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-background/60 transition opacity-0 group-hover/tab:opacity-100 focus:opacity-100"
        aria-label={`關閉 ${name}`}
        title="關閉專案頁籤"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

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
      className="relative w-full h-full flex items-center gap-3 px-4 text-left border-b border-border/60 bg-muted/70 hover:bg-muted transition-colors group/folder"
    >
      {/* Left primary accent bar to make folders pop */}
      <span
        aria-hidden
        className={`absolute left-0 top-0 bottom-0 w-[3px] ${
          isExpanded ? "bg-primary" : "bg-primary/40"
        }`}
      />
      {/* KEY column — indent is INSIDE this fixed-width column so locale columns always line up */}
      <div className={`${KEY_COL} flex items-center gap-2 min-w-0`}>
        {node.level > 0 && (
          <span aria-hidden className="shrink-0" style={{ width: `${node.level * 16}px` }} />
        )}
        <span className="shrink-0 w-5 flex items-center justify-center text-foreground/70 group-hover/folder:text-foreground transition-colors">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
        <FolderTree
          className={`h-4 w-4 shrink-0 ${isExpanded ? "text-primary" : "text-foreground/70"}`}
        />
        <span className="font-mono text-sm font-semibold tracking-tight truncate text-foreground">
          {node.keyPath}
        </span>
      </div>
      <div className={`${LOCALES_COL} flex items-center`}>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-card border border-border text-[11px] text-muted-foreground tabular-nums shadow-sm">
          <KeyRound className="h-2.5 w-2.5" />
          {leafCount}
        </span>
      </div>
      <div className={`${META_COL} text-[11px] uppercase tracking-wider text-muted-foreground/80 font-semibold justify-end`}>
        群組
      </div>
      <div className="shrink-0 w-8" aria-hidden />
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
  onRequestDelete,
  userIdToName,
}: {
  node: TreeNode;
  locales: any[];
  getValue: (keyId: number, code: string) => string;
  isPending: (keyId: number, code: string) => boolean;
  onChange: (keyId: number, code: string, value: string) => void;
  onOpenModal: (keyId: number, keyPath: string) => void;
  onRequestDelete: (keyId: number, keyPath: string) => void;
  userIdToName: Map<number, string>;
}) {
  if (!node.keyId) return null;

  const lastModified = node.lastModified ? new Date(node.lastModified) : null;
  const lastModifiedStr = lastModified ? formatRelativeOrDate(lastModified) : null;
  const lastModifiedFull = lastModified
    ? lastModified.toLocaleString("zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const editorName =
    node.lastModifiedBy != null
      ? userIdToName.get(node.lastModifiedBy) || `#${node.lastModifiedBy}`
      : null;

  return (
    <div
      className="group/row w-full h-full flex items-center gap-3 px-4 border-b border-border/60 hover:bg-muted/30 transition-colors relative"
    >
      {/* Active accent bar on hover */}
      <span
        aria-hidden
        className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full bg-primary opacity-0 group-hover/row:opacity-60 transition-opacity"
      />

      {/* Key column — indent inside this fixed-width column so locale columns always line up */}
      <button
        type="button"
        onClick={() => onOpenModal(node.keyId!, node.fullPath)}
        className={`${KEY_COL} text-left min-w-0 flex items-center gap-2 group/key`}
        title="點擊以詳細編輯"
      >
        {node.level > 0 && (
          <span aria-hidden className="shrink-0" style={{ width: `${node.level * 16}px` }} />
        )}
        <span aria-hidden className="shrink-0 w-5" />
        <div className="flex flex-col justify-center min-w-0">
          <span className="font-mono text-sm font-medium truncate group-hover/key:text-primary transition-colors">
            {node.keyPath}
          </span>
          {node.description && (
            <span className="text-[11px] text-muted-foreground truncate mt-0.5">
              {node.description}
            </span>
          )}
        </div>
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
              className="flex-1 min-w-[120px] relative"
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

      {/* Meta — last edited by + when */}
      <div
        className={`${META_COL} flex-col items-end justify-center text-right gap-0.5`}
        title={
          editorName && lastModifiedFull
            ? `${editorName} · ${lastModifiedFull}`
            : editorName
              ? editorName
              : lastModifiedFull ?? undefined
        }
      >
        {editorName ? (
          <span className="text-xs font-medium text-foreground/90 truncate max-w-full leading-tight">
            {editorName}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/60 italic">未編輯</span>
        )}
        <span className="text-[10px] tabular-nums text-muted-foreground/80 leading-tight">
          {lastModifiedStr ?? "—"}
        </span>
      </div>

      {/* Row actions — kebab menu (always reserved space, opacity reveal on hover) */}
      <div className="shrink-0 w-8 flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-all opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              aria-label="更多動作"
              title="更多動作"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onClick={() => onOpenModal(node.keyId!, node.fullPath)}
              className="cursor-pointer"
            >
              詳細編輯
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onRequestDelete(node.keyId!, node.fullPath)}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              刪除 Key
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
