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
import { LocaleFlag } from "@/components/LocaleFlag";
import { findPreset } from "@/lib/localePresets";

/** Resolve a locale's Chinese display name with fallbacks.
 *  使用者在 DB 設定的 name 優先（被改過就用使用者的），preset 只是 fallback。 */
function localeChineseName(locale: { code: string; name?: string; nativeName?: string }) {
  return locale.name || findPreset(locale.code)?.name || locale.nativeName || locale.code;
}
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
  CornerDownRight,
  History,
  ArrowDownAZ,
  Eye,
  Settings2,
  Library,
  Building2,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import TranslationEditModal from "@/components/TranslationEditModal";
import VersionSelectModal from "@/components/VersionSelectModal";
import CreateProjectModal from "@/components/CreateProjectModal";
import CreateKeyModal from "@/components/CreateKeyModal";
import KeyHistoryModal from "@/components/KeyHistoryModal";
import ProjectHistoryModal from "@/components/ProjectHistoryModal";
import ProjectSettingsModal from "@/components/ProjectSettingsModal";
import ApplySharedKeysModal from "@/components/ApplyTemplateModal";
import LinkSharedKeyPopover from "@/components/LinkTemplateKeyPopover";
import ExportForAgencyModal from "@/components/ExportForAgencyModal";
import ImportFromAgencyModal from "@/components/ImportFromAgencyModal";
import { useAuth } from "@/_core/hooks/useAuth";

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
  /** When this key (or, for folders, their newest descendant) was created. Used to put new keys at top. */
  createdAt?: Date;
  /** Persisted display order — smaller = earlier. Folders bubble up min of descendants. */
  sortOrder: number;
  /** When set, this leaf is referencing a row in `shared_keys` —
   *  values come from the shared dictionary (Apifox $ref 同步模式). */
  sharedKeyId?: number | null;
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
const META_COL = "hidden md:flex flex-[0_0_auto] w-[120px]";
const LOCALES_COL = "flex-1 min-w-0";

// ── Sticky column anchors (Key on the left, Meta + Kebab on the right) ──
const STICKY_LEFT = "sticky left-0 z-[2]";
const STICKY_META = "sticky right-8 z-[2]"; // 32px kebab to its right
const STICKY_KEBAB = "sticky right-0 z-[2]";
const STICKY_LEFT_SHADOW =
  "shadow-[6px_0_10px_-8px_rgba(0,0,0,0.25)] dark:shadow-[6px_0_10px_-8px_rgba(0,0,0,0.6)]";
const STICKY_RIGHT_SHADOW =
  "shadow-[-6px_0_10px_-8px_rgba(0,0,0,0.25)] dark:shadow-[-6px_0_10px_-8px_rgba(0,0,0,0.6)]";

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
  // ── Permission gating ──
  // Only admin / editor may write (translations, keys, sort, import). rd / qa
  // are read-only. The server enforces this via editorProcedure too — this
  // just disables the UI affordances so the user doesn't get silent failures.
  const { user: authUser } = useAuth();
  const role = (authUser as { role?: string } | null)?.role ?? "rd";
  const canEdit = role === "admin" || role === "editor";
  const isAdmin = role === "admin";

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
  const [createKeyContext, setCreateKeyContext] = useState<{
    parentPath?: string;
    mode: "root" | "sibling" | "child";
  } | null>(null);
  /**
   * State for the "confirm delete" dialog. `ids` lets us cover both single-leaf
   * deletes (1 entry) and folder deletes (many entries).
   */
  const [deletingKey, setDeletingKey] = useState<{
    ids: number[];
    path: string;
    isFolder?: boolean;
  } | null>(null);
  const [historyKey, setHistoryKey] = useState<{ id: number; path: string } | null>(null);
  const [showProjectHistory, setShowProjectHistory] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  /** localStorage-backed per-project locale view filter (no DB). null = show all. */
  const [hiddenLocaleCodes, setHiddenLocaleCodesState] = useState<Set<string>>(
    new Set()
  );
  // Persist whenever it changes (keyed by selectedProject)
  useEffect(() => {
    if (selectedProject === null) return;
    try {
      const raw = window.localStorage.getItem(
        `i18n-editor-hidden-locales-${selectedProject}`
      );
      if (raw) {
        const arr = JSON.parse(raw);
        setHiddenLocaleCodesState(
          new Set(Array.isArray(arr) ? (arr as string[]) : [])
        );
      } else {
        setHiddenLocaleCodesState(new Set());
      }
    } catch {
      setHiddenLocaleCodesState(new Set());
    }
  }, [selectedProject]);
  const setHiddenLocaleCodes = useCallback(
    (next: Set<string>) => {
      setHiddenLocaleCodesState(new Set(next));
      if (selectedProject !== null) {
        try {
          window.localStorage.setItem(
            `i18n-editor-hidden-locales-${selectedProject}`,
            JSON.stringify(Array.from(next))
          );
        } catch {}
      }
    },
    [selectedProject]
  );
  /** Per-file parse result. `localeCode` is null when filename didn't match any locale. */
  type ImportFileEntry = {
    fileName: string;
    localeCode: string | null;
    localeName?: string;
    count: number;
    parsed?: Record<string, string>;
    error?: string;
  };
  const [importPreview, setImportPreview] = useState<ImportFileEntry[] | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const modalSaveRef = useRef<(() => void) | null>(null);

  // 查詢資料
  const utils = trpc.useUtils();
  const localesQuery = trpc.locale.listActive.useQuery();
  const allActiveLocales = localesQuery.data ?? [];

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

  // 公版字典 keys（用來把 sharedKeyId 對應到 keyPath，給 modal/badge 顯示）
  const sharedKeysQuery = trpc.sharedKey.list.useQuery(undefined);
  const sharedKeyPathById = useMemo(() => {
    const m = new Map<number, string>();
    for (const k of (sharedKeysQuery.data as any[]) ?? []) {
      m.set(k.id as number, k.keyPath as string);
    }
    return m;
  }, [sharedKeysQuery.data]);

  // 搜尋 + 版本範圍 篩選
  const rootKeys = useMemo(() => {
    let pool = allKeys;

    // 1) 「僅該版本 Key」 — 只保留該版本內有任何 cell 被異動過的 keyId
    if (onlyVersionKeys && selectedVersion !== null) {
      const versionKeyIds = new Set<number>();
      for (const t of translations as any[]) {
        const trs = t.translations as
          | Record<string, { changedInVersion?: boolean }>
          | undefined;
        if (!trs) continue;
        for (const code of Object.keys(trs)) {
          if (trs[code]?.changedInVersion) {
            versionKeyIds.add(t.id);
            break;
          }
        }
      }
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
              createdAt: isLeaf
                ? (key as any).createdAt
                  ? new Date((key as any).createdAt)
                  : undefined
                : undefined,
              // Folders compute their sortOrder later from descendants; leaves
              // copy from the underlying key. Default 0 lets new keys (without
              // an explicit reorder) tie and tiebreak by createdAt DESC.
              sortOrder: isLeaf ? ((key as any).sortOrder ?? 0) : Number.POSITIVE_INFINITY,
              sharedKeyId: isLeaf ? ((key as any).sharedKeyId ?? null) : null,
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

      // Post-order: bubble each folder's `createdAt` (newest descendant) and
      // `sortOrder` (smallest descendant) up. Children are then sorted by
      // sortOrder ASC, with createdAt DESC as a tiebreak so freshly created
      // keys (default sortOrder=0) appear at the top.
      const computeAndSort = (
        nodes: TreeNode[]
      ): { maxAt: Date | undefined; minOrder: number } => {
        let maxAt: Date | undefined;
        let minOrder = Number.POSITIVE_INFINITY;
        for (const n of nodes) {
          if (n.isFolder) {
            const child = computeAndSort(n.children);
            n.createdAt = child.maxAt;
            n.sortOrder = Number.isFinite(child.minOrder) ? child.minOrder : 0;
          }
          if (n.createdAt && (!maxAt || n.createdAt > maxAt)) {
            maxAt = n.createdAt;
          }
          if (n.sortOrder < minOrder) minOrder = n.sortOrder;
        }
        nodes.sort((a, b) => {
          if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
          // Tie: newest createdAt first
          const at = a.createdAt?.getTime() ?? 0;
          const bt = b.createdAt?.getTime() ?? 0;
          if (bt !== at) return bt - at;
          return a.keyPath.localeCompare(b.keyPath);
        });
        return { maxAt, minOrder };
      };
      computeAndSort(roots);
      return roots;
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

  // O(1) keyId → translation row，取代每個 cell 每次 render 都跑 O(n) find。
  const translationByKeyId = useMemo(() => {
    const m = new Map<number, any>();
    for (const t of translations as any[]) m.set(t.id as number, t);
    return m;
  }, [translations]);

  const getTranslationValue = useCallback(
    (keyId: number, localeCode: string) => {
      const key = `${keyId}:${localeCode}`;
      if (pendingUpdates.has(key)) {
        return pendingUpdates.get(key)!.value;
      }
      const t = translationByKeyId.get(keyId);
      return t?.translations?.[localeCode]?.value ?? "";
    },
    [pendingUpdates, translationByKeyId]
  );

  // pending 是否「真的」與 DB 不同 — 用來顯示橘色待保存標記
  const isPending = useCallback(
    (keyId: number, localeCode: string) => {
      const key = `${keyId}:${localeCode}`;
      if (!pendingUpdates.has(key)) return false;
      const pendingVal = pendingUpdates.get(key)!.value;
      const t = translationByKeyId.get(keyId);
      const original = t?.translations?.[localeCode]?.value ?? "";
      return pendingVal !== original;
    },
    [pendingUpdates, translationByKeyId]
  );

  /** Whether a cell was actually edited in the currently filtered version.
   * When no version is selected, this returns true so cells render at full
   * brightness (no dimming applied). */
  const isChangedInVersion = useCallback(
    (keyId: number, localeCode: string) => {
      if (selectedVersion === null) return true;
      const t = (translations as any[]).find((x) => x.id === keyId);
      const cell = t?.translations?.[localeCode];
      return !!cell?.changedInVersion;
    },
    [translations, selectedVersion]
  );

  const getTranslationValues = (keyId: number) => {
    const result: Record<string, string> = {};
    for (const locale of locales) {
      const val = getTranslationValue(keyId, locale.code);
      result[locale.code] = val || "";
    }
    return result;
  };

  // 永遠 set 進 pending，不在這邊 trim/比對。之前用 `if (value.trim()) { set } else { delete }`
  // 會在使用者把欄位 backspace 清空時把 pending 移除 → getValue 退回 DB 舊值 → 看起來
  // 像「按 backspace 清不掉、清掉就復原」。把比對改放到 hasChanges/handleSave 那邊算。
  // 此外 useCallback 沒依賴任何會變的 state → ref 穩定，LeafRow 才不會被 props 變動帶
  // 著一起 re-render，input 才不卡頓。
  const handleCellChange = useCallback(
    (keyId: number, localeCode: string, value: string) => {
      const key = `${keyId}:${localeCode}`;
      setPendingUpdates((prev) => {
        const next = new Map(prev);
        next.set(key, { keyId, localeCode, value });
        return next;
      });
    },
    []
  );

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
    onSuccess: async () => {
      // 等 refetch 完成、translations 進到 cache 才清 pending — 避免儲存後
      // input 閃一下「DB 舊值 → 新值」。
      await utils.translationKey.listWithTranslations.invalidate();
      setPendingUpdates(new Map());
      toast.success("翻譯已保存");
    },
    onError: (error) => {
      toast.error(`保存失敗: ${error.message}`);
    },
  });

  // 真正會被送到後端的 updates — 過濾掉與 DB 相同的 no-op（使用者把值改回原值時）
  const meaningfulUpdates = useMemo(() => {
    const out: Array<{ keyId: number; localeCode: string; value: string }> = [];
    for (const p of Array.from(pendingUpdates.values())) {
      const t = translationByKeyId.get(p.keyId);
      const original = t?.translations?.[p.localeCode]?.value ?? "";
      if (p.value !== original) out.push(p);
    }
    return out;
  }, [pendingUpdates, translationByKeyId]);

  const hasChanges = meaningfulUpdates.length > 0;

  const handleSave = useCallback(async () => {
    if (meaningfulUpdates.length === 0 || !selectedProject) return;
    // If a version is already selected (filtered), save directly to that
    // version without prompting again.
    if (selectedVersion !== null) {
      await batchUpdateMutation.mutateAsync({
        updates: meaningfulUpdates,
        versionId: selectedVersion,
      });
      const v = versions.find((x) => x.id === selectedVersion);
      toast.success(
        `已保存 ${meaningfulUpdates.length} 項變更到版本 ${v?.versionNumber ?? selectedVersion}`
      );
      setPendingUpdates(new Map());
      return;
    }
    // No version selected — ask the user which version to bind these changes to
    setShowVersionModal(true);
  }, [meaningfulUpdates, selectedProject, selectedVersion, versions, batchUpdateMutation]);

  const handleVersionConfirm = async (versionId: number, versionNumber: string) => {
    if (meaningfulUpdates.length === 0 || !selectedProject) return;
    await batchUpdateMutation.mutateAsync({ updates: meaningfulUpdates, versionId });
    toast.success(`已保存 ${meaningfulUpdates.length} 項變更到版本 ${versionNumber}`);
    setPendingUpdates(new Map());
    setShowVersionModal(false);
  };

  const resortMutation = trpc.translationKey.updateSortOrders.useMutation({
    onSuccess: () => {
      toast.success("已依命名重新排序");
      utils.translationKey.listByProject.invalidate();
      utils.translationKey.listWithTranslations.invalidate();
    },
    onError: (error) => {
      toast.error(`重排失敗: ${error.message}`);
    },
  });

  const handleResortByName = useCallback(() => {
    if (allKeys.length === 0) return;
    const sorted = [...allKeys].sort((a: any, b: any) =>
      a.keyPath.localeCompare(b.keyPath)
    );
    // Use 10-step increments so future inserts have room (and so newly created
    // keys with sortOrder=0 stay at the top until the next resort).
    const items = sorted.map((k: any, i: number) => ({
      id: k.id as number,
      sortOrder: (i + 1) * 10,
    }));
    resortMutation.mutate({ items });
  }, [allKeys, resortMutation]);

  const batchDeleteMutation = trpc.translationKey.batchDelete.useMutation({
    onSuccess: (data) => {
      toast.success(`已刪除 ${data.deleted} 個 Key`);
      utils.translationKey.listByProject.invalidate();
      utils.translationKey.listWithTranslations.invalidate();
      setDeletingKey(null);
    },
    onError: (error) => {
      toast.error(`刪除失敗: ${error.message}`);
    },
  });

  /** Used by the import flow — single round-trip for many keys. */
  const batchCreateKeysMutation = trpc.translationKey.batchCreate.useMutation({
    onError: (error) => {
      toast.error(`批次建立 Key 失敗: ${error.message}`);
    },
  });

  const createKeyMutation = trpc.translationKey.create.useMutation({
    onSuccess: () => {
      toast.success("新 Key 建立成功");
      utils.translationKey.listByProject.invalidate();
      utils.translationKey.listWithTranslations.invalidate();
    },
    onError: (error) => {
      toast.error(`建立失敗: ${error.message}`);
    },
  });

  // ── Shared key glue ────────────────────────────────────────────────────────
  // Detach a project key from its shared key — keeps the current value in the
  // project's own translations table so editors don't lose context, then
  // clears sharedKeyId so the row stops resolving via sharedTranslations.
  const unlinkSharedMutation = trpc.sharedKey.unlinkProjectKey.useMutation({
    onSuccess: () => {
      toast.success("已解除公版引用，保留當前值");
      utils.translationKey.listWithTranslations.invalidate();
      utils.translationKey.listByProject.invalidate();
    },
    onError: (e) => toast.error(`解除失敗：${e.message}`),
  });
  // Apply (insert) shared keys into the current project — see ApplySharedKeysModal.
  const applySharedMutation = trpc.sharedKey.applyToProject.useMutation({
    onSuccess: (data: any) => {
      toast.success(
        `已套用公版字典（建立 ${data.created}、重用 ${data.reused}、引用 ${data.linked}、複製 ${data.copied} 條）`
      );
      utils.translationKey.listByProject.invalidate();
      utils.translationKey.listWithTranslations.invalidate();
      setShowApplyShared(false);
    },
    onError: (e) => toast.error(`套用失敗：${e.message}`),
  });
  const [showApplyShared, setShowApplyShared] = useState(false);
  const [showExportAgency, setShowExportAgency] = useState(false);
  const [showImportAgency, setShowImportAgency] = useState(false);

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

  /** Trigger a server-built ZIP download with every active locale's JSON. */
  const handleExportAll = useCallback(() => {
    if (!selectedProject) return;
    // Use a hidden anchor so the browser respects the server's
    // Content-Disposition header for filename + download.
    const a = document.createElement("a");
    a.href = `/api/export/${selectedProject}.zip`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success("正在下載全部語系 ZIP…");
  }, [selectedProject]);

  // ────────────────────────────────────────────────────────
  // Import (multi-file)
  // ────────────────────────────────────────────────────────
  const triggerImportFilePicker = () => importInputRef.current?.click();

  /** Parse all selected files in parallel; build a preview that maps each file
   * to a locale based on its filename (e.g. `zh-TW.json` → locale `zh-TW`). */
  const handleImportFilesSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (files.length === 0) return;

    const lowerLocaleByCode = new Map<string, any>();
    for (const l of locales as any[]) {
      lowerLocaleByCode.set(l.code.toLowerCase(), l);
    }

    const entries: ImportFileEntry[] = await Promise.all(
      files.map(async (file): Promise<ImportFileEntry> => {
        const stem = file.name.replace(/\.json$/i, "");
        const matched = lowerLocaleByCode.get(stem.toLowerCase());
        try {
          const text = await file.text();
          const obj = JSON.parse(text);
          const flat = flattenJson(obj);
          return {
            fileName: file.name,
            localeCode: matched?.code ?? null,
            localeName: matched?.name ?? matched?.nativeName,
            count: Object.keys(flat).length,
            parsed: flat,
            error: matched
              ? Object.keys(flat).length === 0
                ? "檔案內沒有可匯入的內容"
                : undefined
              : `檔名「${stem}」未對應任何已啟用的語系`,
          };
        } catch (err: any) {
          return {
            fileName: file.name,
            localeCode: matched?.code ?? null,
            localeName: matched?.name ?? matched?.nativeName,
            count: 0,
            error: `JSON 解析失敗：${err?.message ?? "格式錯誤"}`,
          };
        }
      })
    );
    setImportPreview(entries);
  };

  const handleConfirmImport = async () => {
    if (!importPreview || !selectedProject) return;

    const valid = importPreview.filter((e) => e.localeCode && e.parsed && !e.error);
    if (valid.length === 0) {
      toast.error("沒有可匯入的檔案");
      return;
    }

    // Aggregate every (keyPath, localeCode → value) once across all files
    const allKeyPaths = new Set<string>();
    const localesTouched = new Set<string>();
    for (const entry of valid) {
      localesTouched.add(entry.localeCode!);
      for (const k of Object.keys(entry.parsed!)) allKeyPaths.add(k);
    }

    const existingByPath = new Map(
      (allKeys as any[]).map((k) => [k.keyPath as string, k.id as number])
    );
    const missingPaths = Array.from(allKeyPaths).filter(
      (p) => !existingByPath.has(p)
    );

    try {
      // 1) ONE round-trip to create all missing keys (server returns the full
      //    keyPath → id mapping, including pre-existing matches).
      let createdCount = 0;
      if (missingPaths.length > 0) {
        const result = await batchCreateKeysMutation.mutateAsync({
          projectId: selectedProject,
          items: missingPaths.map((keyPath) => ({ keyPath })),
        });
        for (const { keyPath, id } of result.items) {
          if (!existingByPath.has(keyPath)) createdCount++;
          existingByPath.set(keyPath, id);
        }
      }

      // 2) Build the flat updates array — every (key, locale, value) tuple.
      const updates: { keyId: number; localeCode: string; value: string }[] = [];
      for (const entry of valid) {
        for (const [keyPath, value] of Object.entries(entry.parsed!)) {
          const keyId = existingByPath.get(keyPath);
          if (!keyId) continue; // shouldn't happen after batchCreate
          updates.push({ keyId, localeCode: entry.localeCode!, value });
        }
      }

      // 3) ONE round-trip to write all translations.
      if (updates.length > 0) {
        await batchUpdateMutation.mutateAsync({
          updates,
          versionId: selectedVersion ?? undefined,
        });
      }

      toast.success(
        `匯入完成 · ${localesTouched.size} 個語系、新增 ${createdCount} 個 Key、寫入 ${updates.length} 筆翻譯`
      );
      utils.translationKey.listByProject.invalidate();
      utils.translationKey.listWithTranslations.invalidate();
      setImportPreview(null);
    } catch (err: any) {
      toast.error(`匯入失敗：${err?.message ?? "未知錯誤"}`);
    }
  };

  // ────────────────────────────────────────────────────────
  // Delete
  // ────────────────────────────────────────────────────────
  const handleConfirmDelete = async () => {
    if (!deletingKey || deletingKey.ids.length === 0) return;
    await batchDeleteMutation.mutateAsync({ ids: deletingKey.ids });
  };

  /** Walk a folder subtree and collect all leaf keyIds (handles arbitrary depth). */
  const collectLeafKeyIds = useCallback(
    (folderPath: string): number[] => {
      const prefix = folderPath + ".";
      return (allKeys as any[])
        .filter(
          (k: any) => k.keyPath === folderPath || k.keyPath.startsWith(prefix)
        )
        .map((k: any) => k.id as number);
    },
    [allKeys]
  );

  // 鍵盤快速鍵
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (modalSaveRef.current) modalSaveRef.current();
        else if (hasChanges) handleSave();
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
  }, [hasChanges, expandAll, collapseAll, handleSave]);

  const currentProject = useMemo(
    () => (projects as any[]).find((x) => x.id === selectedProject),
    [projects, selectedProject]
  );
  const currentProjectName = currentProject?.name as string | undefined;

  /**
   * Effective locales for this project — narrowed by:
   *   1. Project-level whitelist (`allowedLocaleCodes`, persisted in DB)
   *   2. Per-user view filter (`hiddenLocaleCodes`, localStorage only)
   * Falls back to all active locales when no whitelist is set.
   */
  const projectAllowedSet = useMemo<Set<string> | null>(() => {
    const raw = currentProject?.allowedLocaleCodes;
    if (!raw) return null;
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.length > 0
        ? new Set(arr as string[])
        : null;
    } catch {
      return null;
    }
  }, [currentProject]);

  /** All locales this project is configured to support (DB-level filter). */
  const projectLocales = useMemo(() => {
    if (!projectAllowedSet) return allActiveLocales;
    return (allActiveLocales as any[]).filter((l) =>
      projectAllowedSet.has(l.code)
    );
  }, [allActiveLocales, projectAllowedSet]);

  /** What the editor actually renders (after the user's view filter). */
  const locales = useMemo(
    () =>
      (projectLocales as any[]).filter((l) => !hiddenLocaleCodes.has(l.code)),
    [projectLocales, hiddenLocaleCodes]
  );

  const totalLeafKeys = allKeys.length;
  const totalLocales = locales.length;

  // keyId → keyPath, used by ProjectHistoryModal
  const keyIdToPath = useMemo(() => {
    const m = new Map<number, string>();
    for (const k of allKeys as any[]) {
      m.set(k.id, k.keyPath);
    }
    return m;
  }, [allKeys]);

  // 計算表格最小寬度 — 語系欄不足空間時就走橫向 scroll，不要把 input 擠太小
  const tableMinWidth = useMemo(() => {
    // pl(16) + KEY(280) + gap(12) + LOCALES gap(12) + META(120) + gap(12) + KEBAB(32) + pr(16)
    const base = 16 + 280 + 12 + 12 + 120 + 12 + 32 + 16; // 500
    const localesWidth =
      locales.length === 0
        ? 0
        : locales.length * 200 + (locales.length - 1) * 8; // 每個 locale 至少 200px
    return base + localesWidth;
  }, [locales.length]);

  // ────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-3rem)] gap-2 w-full">
        {/* ───────────── Project tab strip ───────────── */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-elegant -mt-1">
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
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
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

            {/* Project-level history quick-open */}
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => setShowProjectHistory(true)}
              title="查看本專案的編輯歷程"
            >
              <History className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">歷程</span>
            </Button>

            {/* View-locale filter (localStorage, no DB) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5"
                  title="勾選要顯示的語系（只影響你看到的畫面）"
                  disabled={projectLocales.length === 0}
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">顯示</span>
                  {hiddenLocaleCodes.size > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] tabular-nums">
                      隱 {hiddenLocaleCodes.size}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs">
                  顯示語系（不寫入 DB）
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {projectLocales.map((l: any) => {
                  const visible = !hiddenLocaleCodes.has(l.code);
                  return (
                    <DropdownMenuItem
                      key={l.code}
                      onClick={(e) => {
                        e.preventDefault();
                        const next = new Set(hiddenLocaleCodes);
                        if (visible) next.add(l.code);
                        else next.delete(l.code);
                        setHiddenLocaleCodes(next);
                      }}
                      className="cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={visible}
                        readOnly
                        className="mr-2 h-3.5 w-3.5 accent-primary"
                      />
                      <span className="font-medium flex-1 truncate">
                        {localeChineseName(l)}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {l.code}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
                {hiddenLocaleCodes.size > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setHiddenLocaleCodes(new Set())}
                      className="cursor-pointer text-primary focus:text-primary"
                    >
                      全部顯示
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Project settings — admin only */}
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                onClick={() => setShowProjectSettings(true)}
                title="專案設定（含可用語系）"
              >
                <Settings2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">設定</span>
              </Button>
            )}

            {/* Stat pills + sync indicator — pushed right */}
            <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
              <StatPill
                icon={<KeyRound className="h-3 w-3" />}
                label={
                  searchTerm || (onlyVersionKeys && selectedVersion !== null)
                    ? "顯示"
                    : "Keys"
                }
                value={
                  searchTerm || (onlyVersionKeys && selectedVersion !== null)
                    ? `${flatList.length} / ${totalLeafKeys}`
                    : totalLeafKeys
                }
              />
              <StatPill
                icon={<Languages className="h-3 w-3" />}
                label="語系"
                value={totalLocales}
              />
              {/* Sync / pending indicator */}
              {hasChanges ? (
                <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-xs font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  {meaningfulUpdates.length} 項待保存
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  已同步
                </span>
              )}
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

            {/* "Sort by name" — persists alphabetical order to the DB */}
            <Button
              onClick={() => setCreateKeyContext({ mode: "root" })}
              disabled={!selectedProject || !canEdit}
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              title={!canEdit ? "需要 editor 以上權限" : undefined}
            >
              <Plus className="h-3.5 w-3.5" />
              新增 Key
            </Button>

            {/* 從公版字典插入 keys（Apifox 風格的 $ref 引用 / 複製） */}
            <Button
              onClick={() => setShowApplyShared(true)}
              disabled={!selectedProject || !canEdit}
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              title={
                !canEdit
                  ? "需要 editor 以上權限"
                  : "從公版字典套用 keys（可選擇引用同步或一次性複製）"
              }
            >
              <Library className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">從公版字典插入</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={handleResortByName}
              disabled={
                !selectedProject ||
                !canEdit ||
                allKeys.length === 0 ||
                resortMutation.isPending
              }
              title={
                !canEdit
                  ? "需要 editor 以上權限"
                  : "依 keyPath 字母順序重排所有 Key 並寫回資料庫"
              }
            >
              {resortMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowDownAZ className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">依命名重排</span>
            </Button>

            {/* Import dropdown — JSON or 翻譯社 Excel */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  disabled={!selectedProject || !canEdit || locales.length === 0}
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5"
                  title={!canEdit ? "需要 editor 以上權限" : "匯入"}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">匯入</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem
                  onClick={triggerImportFilePicker}
                  className="cursor-pointer"
                >
                  <FileJson className="h-4 w-4 mr-2 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">JSON</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      檔名 = 語系代碼，可多檔
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowImportAgency(true)}
                  className="cursor-pointer"
                >
                  <Building2 className="h-4 w-4 mr-2 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">翻譯社 Excel</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      匯入翻譯社填回的 .xlsx，含 diff 預覽
                    </div>
                  </div>
                </DropdownMenuItem>
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
                  <Upload className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">匯出</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem
                  onClick={handleExportAll}
                  className="cursor-pointer font-medium"
                >
                  <FileJson className="h-4 w-4 mr-2 text-primary shrink-0" />
                  <span className="flex-1">全部語系（ZIP）</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowExportAgency(true)}
                  className="cursor-pointer font-medium"
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2 text-primary shrink-0" />
                  <span className="flex-1">翻譯社 Excel</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">單一語系</DropdownMenuLabel>
                {locales.map((l) => (
                  <DropdownMenuItem
                    key={l.code}
                    onClick={() => handleExportLocale(l.code)}
                    className="cursor-pointer"
                  >
                    <LocaleFlag code={l.code} size="sm" className="mr-2 shrink-0" />
                    <span className="font-medium flex-1 truncate">
                      {localeChineseName(l)}
                    </span>
                    <span className="text-muted-foreground ml-2 font-mono text-xs shrink-0">
                      {l.code}.json
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Hidden file input for import (multi-select) */}
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              multiple
              onChange={handleImportFilesSelected}
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
              disabled={!hasChanges || !canEdit || batchUpdateMutation.isPending}
              size="sm"
              className={`h-9 gap-1.5 min-w-[110px] transition-all ${
                hasChanges ? "shadow-[var(--shadow-glow)]" : ""
              }`}
              title={!canEdit ? "需要 editor 以上權限" : "保存 (⌘S)"}
            >
              {batchUpdateMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  保存中…
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  保存{hasChanges ? ` (${meaningfulUpdates.length})` : ""}
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
            {/* Header — left & right cells are sticky to keep Key/Meta visible while scrolling */}
            <div className="sticky top-0 z-10 border-b border-border/60">
              <div className="flex items-stretch text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {/* Sticky-left: Key */}
                <div
                  className={`${KEY_COL} ${STICKY_LEFT} ${STICKY_LEFT_SHADOW} flex items-center pl-4 pr-3 py-2.5 bg-muted/95 backdrop-blur-sm`}
                >
                  Key
                </div>
                {/* Scrolling: locale columns */}
                <div className={`${LOCALES_COL} flex gap-2 items-center px-3 py-2 bg-muted/95 backdrop-blur-sm`}>
                  {locales.map((locale) => (
                    <div
                      key={locale.code}
                      className="flex-1 min-w-[200px] flex items-center gap-2"
                      title={`${localeChineseName(locale)} (${locale.code})`}
                    >
                      <LocaleFlag code={locale.code} size="md" />
                      <div className="flex flex-col leading-tight min-w-0">
                        <span className="normal-case truncate text-[13px] font-medium text-foreground">
                          {localeChineseName(locale)}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground/80 truncate">
                          {locale.code}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Sticky-right: Meta */}
                <div
                  className={`${META_COL} ${STICKY_META} ${STICKY_RIGHT_SHADOW} items-center justify-end pl-3 pr-2 py-2.5 bg-muted/95 backdrop-blur-sm`}
                >
                  最後修改
                </div>
                {/* Sticky-right: kebab placeholder */}
                <div
                  className={`shrink-0 w-8 ${STICKY_KEBAB} bg-muted/95 backdrop-blur-sm`}
                  aria-hidden
                />
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
                          canEdit={canEdit}
                          onInsertSibling={() => {
                            const parentSegments = node.fullPath
                              .split(".")
                              .slice(0, -1);
                            const parent = parentSegments.join(".");
                            setCreateKeyContext({
                              parentPath: parent || undefined,
                              mode: parent ? "sibling" : "root",
                            });
                          }}
                          onInsertChild={() =>
                            setCreateKeyContext({
                              parentPath: node.fullPath,
                              mode: "child",
                            })
                          }
                          onRequestDelete={() => {
                            const ids = collectLeafKeyIds(node.fullPath);
                            if (ids.length === 0) return;
                            setDeletingKey({
                              ids,
                              path: node.fullPath,
                              isFolder: true,
                            });
                          }}
                        />
                      ) : (
                        <LeafRow
                          node={node}
                          locales={locales}
                          getValue={getTranslationValue}
                          isPending={isPending}
                          isChangedInVersion={isChangedInVersion}
                          versionMode={selectedVersion !== null}
                          canEdit={canEdit}
                          onChange={handleCellChange}
                          onOpenModal={handleOpenEditModal}
                          onRequestDelete={(id, path) =>
                            setDeletingKey({ ids: [id], path })
                          }
                          onInsertSibling={(parentPath) =>
                            setCreateKeyContext({
                              parentPath: parentPath || undefined,
                              mode: parentPath ? "sibling" : "root",
                            })
                          }
                          onViewHistory={(keyId) =>
                            setHistoryKey({ id: keyId, path: node.fullPath })
                          }
                          onUnlinkShared={(keyId, keyPath) => {
                            if (
                              confirm(
                                `解除「${keyPath}」的公版引用？目前的值會被保留至專案內，後續公版字典更動將不再同步至此 key。`
                              )
                            ) {
                              unlinkSharedMutation.mutate({
                                projectKeyId: keyId,
                              });
                            }
                          }}
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

        {/* Bottom stats bar removed — its info is integrated into the toolbar / Save button so the table can use the full vertical space. */}

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
          canEdit={canEdit}
          sharedKeyId={
            editingKeyId
              ? translationByKeyId.get(editingKeyId)?.sharedKeyId ?? null
              : null
          }
          sharedKeyPath={(() => {
            const skid = editingKeyId
              ? translationByKeyId.get(editingKeyId)?.sharedKeyId
              : null;
            return skid ? sharedKeyPathById.get(skid) ?? null : null;
          })()}
          onUnlinkShared={() => {
            if (editingKeyId) {
              unlinkSharedMutation.mutate({ projectKeyId: editingKeyId });
            }
          }}
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
        {/* Single-key edit history (opened from leaf row kebab) */}
        <KeyHistoryModal
          open={historyKey !== null}
          keyId={historyKey?.id ?? null}
          keyPath={historyKey?.path}
          userIdToName={userIdToName}
          onClose={() => setHistoryKey(null)}
        />

        {/* Project-level edit history */}
        <ProjectHistoryModal
          open={showProjectHistory}
          projectId={selectedProject}
          projectName={currentProjectName}
          keyIdToPath={keyIdToPath}
          userIdToName={userIdToName}
          onClose={() => setShowProjectHistory(false)}
        />

        {/* Project settings (allowed locales etc.) */}
        <ProjectSettingsModal
          open={showProjectSettings}
          projectId={selectedProject}
          onClose={() => setShowProjectSettings(false)}
        />

        {/* Apply shared keys (Apifox-style $ref) into this project. */}
        <ApplySharedKeysModal
          open={showApplyShared}
          projectId={selectedProject}
          onClose={() => setShowApplyShared(false)}
          pending={applySharedMutation.isPending}
          onSubmit={({ mode, sharedKeyIds }) => {
            if (!selectedProject) return;
            applySharedMutation.mutate({
              projectId: selectedProject,
              mode,
              sharedKeyIds,
            });
          }}
        />

        {/* 翻譯社 Excel 匯出 */}
        <ExportForAgencyModal
          open={showExportAgency}
          onClose={() => setShowExportAgency(false)}
          projectName={currentProjectName ?? "project"}
          locales={projectLocales as any[]}
          keys={(translations as any[]).map((t) => ({
            id: t.id as number,
            keyPath: t.keyPath as string,
            description: t.description ?? null,
            translations: Object.fromEntries(
              Object.entries(t.translations ?? {}).map(([code, cell]: any) => [
                code,
                {
                  value: cell?.value ?? "",
                  isTranslated: !!cell?.isTranslated,
                },
              ])
            ),
          }))}
        />

        {/* 翻譯社 Excel 匯入 */}
        <ImportFromAgencyModal
          open={showImportAgency}
          onClose={() => setShowImportAgency(false)}
          locales={projectLocales as any[]}
          pending={batchUpdateMutation.isPending}
          keys={(translations as any[]).map((t) => ({
            id: t.id as number,
            keyPath: t.keyPath as string,
            translations: Object.fromEntries(
              Object.entries(t.translations ?? {}).map(([code, cell]: any) => [
                code,
                { value: cell?.value ?? "" },
              ])
            ),
          }))}
          onSubmit={async (updates) => {
            await batchUpdateMutation.mutateAsync({
              updates,
              versionId: selectedVersion ?? undefined,
            });
          }}
        />

        <CreateKeyModal
          isOpen={createKeyContext !== null}
          parentPath={createKeyContext?.parentPath}
          insertMode={createKeyContext?.mode ?? "root"}
          existingKeyPaths={
            new Set((allKeys as any[]).map((k) => k.keyPath as string))
          }
          onConfirm={async (keyPath, description) => {
            await handleCreateKey(keyPath, description);
            setCreateKeyContext(null);
          }}
          onCancel={() => setCreateKeyContext(null)}
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
                {deletingKey?.isFolder ? "確定刪除整個群組？" : "確定刪除此 Key？"}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-sm text-muted-foreground space-y-2">
                  <div>
                    {deletingKey?.isFolder ? (
                      <>
                        將軟刪除群組{" "}
                        <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {deletingKey?.path}
                        </code>{" "}
                        底下的所有 Key（共{" "}
                        <span className="font-semibold tabular-nums text-foreground">
                          {deletingKey?.ids.length ?? 0}
                        </span>{" "}
                        筆）及對應的所有語系翻譯。
                      </>
                    ) : (
                      <>
                        將軟刪除 Key{" "}
                        <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {deletingKey?.path}
                        </code>{" "}
                        及其所有語系翻譯。
                      </>
                    )}
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
                disabled={batchDeleteMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {batchDeleteMutation.isPending ? (
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

        {/* Import preview — multi-file */}
        <AlertDialog
          open={importPreview !== null}
          onOpenChange={(open) => !open && setImportPreview(null)}
        >
          <AlertDialogContent className="!max-w-2xl w-[min(94vw,720px)]">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Download className="h-4 w-4 text-primary" />
                匯入翻譯
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-sm text-muted-foreground space-y-3">
                  <div>
                    共選了{" "}
                    <span className="font-semibold text-foreground tabular-nums">
                      {importPreview?.length ?? 0}
                    </span>{" "}
                    個檔案，將自動以檔名（去掉 .json）對應語系代碼匯入。
                  </div>

                  {importPreview && importPreview.length > 0 && (
                    <div className="rounded-lg border border-border/60 max-h-[40vh] overflow-y-auto scrollbar-elegant divide-y divide-border/60">
                      {importPreview.map((entry, idx) => {
                        const ok = !!entry.localeCode && !entry.error;
                        return (
                          <div
                            key={idx}
                            className={`flex items-center gap-3 px-3 py-2.5 ${
                              ok ? "" : "bg-amber-500/5"
                            }`}
                          >
                            {entry.localeCode ? (
                              <LocaleFlag
                                code={entry.localeCode}
                                size="sm"
                                className="shrink-0"
                              />
                            ) : (
                              <span className="h-5 w-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 inline-flex items-center justify-center text-[10px] font-bold shrink-0">
                                ?
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <code className="font-mono text-xs text-foreground truncate">
                                  {entry.fileName}
                                </code>
                                {entry.localeCode && (
                                  <span className="text-xs text-muted-foreground shrink-0">
                                    → {entry.localeName ?? entry.localeCode}
                                  </span>
                                )}
                              </div>
                              {entry.error ? (
                                <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                                  {entry.error}
                                </div>
                              ) : (
                                <div className="text-[11px] text-muted-foreground mt-0.5">
                                  將寫入{" "}
                                  <span className="font-semibold tabular-nums text-foreground">
                                    {entry.count}
                                  </span>{" "}
                                  筆翻譯
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed">
                    檔案中存在但專案未有的 Key 會自動建立；已存在的 Key 會更新對應語系的翻譯值。檔名沒比對到語系（如「customCode.json」）的檔案會被略過。
                  </div>
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
                  batchUpdateMutation.isPending ||
                  batchCreateKeysMutation.isPending ||
                  !importPreview?.some((entry) => !!entry.localeCode && !entry.error)
                }
              >
                {batchUpdateMutation.isPending || batchCreateKeysMutation.isPending ? (
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
      className={`group/tab relative flex items-center gap-2 h-8 pl-2.5 pr-1.5 rounded-lg cursor-pointer text-sm font-medium transition-all max-w-[220px] shrink-0 ${
        active
          ? "bg-primary/10 text-primary ring-1 ring-primary/20"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/70"
      }`}
    >
      <FolderTree
        className={`h-3.5 w-3.5 shrink-0 ${active ? "text-primary" : "text-muted-foreground/60"}`}
      />
      <span className="truncate">{name}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={`h-5 w-5 inline-flex items-center justify-center rounded transition opacity-0 group-hover/tab:opacity-100 focus:opacity-100 ${
          active
            ? "text-primary/70 hover:text-primary hover:bg-primary/10"
            : "text-muted-foreground/60 hover:text-foreground hover:bg-background"
        }`}
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
  canEdit,
  onInsertSibling,
  onInsertChild,
  onRequestDelete,
}: {
  node: TreeNode;
  isExpanded: boolean;
  onToggle: () => void;
  leafCount: number;
  canEdit: boolean;
  onInsertSibling: () => void;
  onInsertChild: () => void;
  onRequestDelete: () => void;
}) {
  // Folder uses a slightly stronger surface than the regular card so it stands out
  const cellBg = "bg-muted group-hover/folder:bg-secondary transition-colors";
  return (
    <button
      type="button"
      onClick={onToggle}
      className="group/folder w-full h-full flex items-stretch border-b border-border/60 text-left"
    >
      {/* Sticky-left: Key column (with accent bar baked in) */}
      <div
        className={`${KEY_COL} ${STICKY_LEFT} ${STICKY_LEFT_SHADOW} ${cellBg} relative flex items-center gap-2 pl-4 pr-3`}
      >
        <span
          aria-hidden
          className={`absolute left-0 top-0 bottom-0 w-[3px] ${
            isExpanded ? "bg-primary" : "bg-primary/40"
          }`}
        />
        {node.level > 0 && (
          <span
            aria-hidden
            className="shrink-0"
            style={{ width: `${node.level * 16}px` }}
          />
        )}
        <span className="shrink-0 w-5 flex items-center justify-center text-foreground/70 group-hover/folder:text-foreground">
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
      {/* Scrolling: leaf count */}
      <div className={`${LOCALES_COL} flex items-center px-3 ${cellBg}`}>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-card border border-border text-[11px] text-muted-foreground tabular-nums shadow-sm">
          <KeyRound className="h-2.5 w-2.5" />
          {leafCount}
        </span>
      </div>
      {/* Sticky-right: meta label */}
      <div
        className={`${META_COL} ${STICKY_META} ${STICKY_RIGHT_SHADOW} ${cellBg} items-center justify-end pl-3 pr-2 text-[11px] uppercase tracking-wider text-muted-foreground/80 font-semibold`}
      >
        群組
      </div>
      {/* Sticky-right: kebab menu (hidden for read-only roles) */}
      <div
        className={`shrink-0 w-8 ${STICKY_KEBAB} ${cellBg} flex items-center justify-end pr-1`}
        onClick={(e) => e.stopPropagation()}
      >
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-background/60 transition-all opacity-0 group-hover/folder:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                aria-label="更多動作"
                title="更多動作"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => {
                  onInsertChild();
                }}
                className="cursor-pointer"
              >
                <CornerDownRight className="h-4 w-4 mr-2" />
                新增子層 Key
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  onInsertSibling();
                }}
                className="cursor-pointer"
              >
                <Plus className="h-4 w-4 mr-2" />
                新增同層 Key
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  onRequestDelete();
                }}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                刪除整個群組
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </button>
  );
}

function LeafRow({
  node,
  locales,
  getValue,
  isPending,
  isChangedInVersion,
  versionMode,
  canEdit,
  onChange,
  onOpenModal,
  onRequestDelete,
  onInsertSibling,
  onViewHistory,
  onUnlinkShared,
  userIdToName,
}: {
  node: TreeNode;
  locales: any[];
  getValue: (keyId: number, code: string) => string;
  isPending: (keyId: number, code: string) => boolean;
  isChangedInVersion: (keyId: number, code: string) => boolean;
  versionMode: boolean;
  canEdit: boolean;
  onChange: (keyId: number, code: string, value: string) => void;
  onOpenModal: (keyId: number, keyPath: string) => void;
  onRequestDelete: (keyId: number, keyPath: string) => void;
  onInsertSibling: (parentPath: string) => void;
  onViewHistory: (keyId: number) => void;
  onUnlinkShared?: (keyId: number, keyPath: string) => void;
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

  // Leaf cells: card by default, muted on hover
  const cellBg = "bg-card group-hover/row:bg-muted/70 transition-colors";
  return (
    <div className="group/row w-full h-full flex items-stretch border-b border-border/60 relative">
      {/* Sticky-left: Key column (accent bar baked in)
          Use role=button + keyboard handlers so we can embed an inline
          「引用公版 key」Popover trigger inside without nesting <button>s. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpenModal(node.keyId!, node.fullPath)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenModal(node.keyId!, node.fullPath);
          }
        }}
        className={`${KEY_COL} ${STICKY_LEFT} ${STICKY_LEFT_SHADOW} ${cellBg} relative pl-4 pr-3 text-left min-w-0 flex items-center gap-2 group/key cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40`}
        title="點擊以詳細編輯"
      >
        <span
          aria-hidden
          className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full bg-primary opacity-0 group-hover/row:opacity-60 transition-opacity"
        />
        {node.level > 0 && (
          <span
            aria-hidden
            className="shrink-0"
            style={{ width: `${node.level * 16}px` }}
          />
        )}
        <span aria-hidden className="shrink-0 w-5" />
        <div className="flex flex-col justify-center min-w-0 flex-1">
          <span className="font-mono text-sm font-medium truncate group-hover/key:text-primary transition-colors flex items-center gap-1.5">
            <span className="truncate">{node.keyPath}</span>
            {node.sharedKeyId != null && (
              <span
                className="inline-flex items-center gap-0.5 shrink-0 px-1.5 py-0 rounded text-[10px] font-medium bg-primary/15 text-primary border border-primary/30"
                title="此 Key 引用自公版字典；編輯值會同步到所有引用此 key 的專案"
              >
                公版
              </span>
            )}
          </span>
          {node.description && (
            <span className="text-[11px] text-muted-foreground truncate mt-0.5">
              {node.description}
            </span>
          )}
        </div>
        {/* Inline 「引用公版 key」按鈕 — Apifox 風格 $ref。Hover 才顯，已引用則常駐。 */}
        {canEdit && (
          <div
            className={`shrink-0 ${
              node.sharedKeyId != null
                ? "opacity-100"
                : "opacity-0 group-hover/row:opacity-100 focus-within:opacity-100"
            } transition-opacity`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <LinkSharedKeyPopover
              projectKeyId={node.keyId}
              keyPath={node.fullPath}
              linkedSharedKeyId={node.sharedKeyId ?? null}
            />
          </div>
        )}
      </div>

      {/* Scrolling: locale inputs */}
      <div className={`${LOCALES_COL} flex gap-2 items-center px-3 ${cellBg}`}>
        {locales.map((locale) => {
          const val = getValue(node.keyId!, locale.code);
          const pending = isPending(node.keyId!, locale.code);
          const filled = !!val.trim();
          // In version-filter mode, cells that were NOT touched by this version
          // appear dimmed; only cells changed in this version stay bright.
          const dimmed =
            versionMode && !isChangedInVersion(node.keyId!, locale.code);
          const highlighted =
            versionMode && isChangedInVersion(node.keyId!, locale.code);
          return (
            <div
              key={locale.code}
              className={`flex-1 min-w-[200px] relative transition-opacity ${dimmed ? "opacity-45" : ""}`}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                placeholder={localeChineseName(locale)}
                value={val}
                readOnly={!canEdit}
                onChange={(e) =>
                  onChange(node.keyId!, locale.code, e.target.value)
                }
                onClick={(e) => e.stopPropagation()}
                className={`peer w-full h-9 pl-2.5 pr-7 text-sm rounded-md bg-input border transition-all
                  focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25
                  ${!canEdit ? "cursor-default opacity-90" : ""}
                  ${pending
                    ? "border-amber-500/60 bg-amber-500/5"
                    : highlighted
                      ? "border-primary/60 ring-2 ring-primary/15"
                      : filled
                        ? "border-border"
                        : "border-border/70 text-muted-foreground"}`}
                title={
                  !canEdit
                    ? `唯讀 — 需要 editor 以上權限`
                    : `${locale.name} (${locale.code})${highlighted ? " · 此版本有異動" : dimmed ? " · 此版本未動" : ""}`
                }
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

      {/* Sticky-right: Meta — last edited by + when */}
      <div
        className={`${META_COL} ${STICKY_META} ${STICKY_RIGHT_SHADOW} ${cellBg} flex-col items-end justify-center text-right gap-0.5 pl-3 pr-2`}
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

      {/* Sticky-right: kebab menu (always reserved space, opacity reveal on hover) */}
      <div
        className={`shrink-0 w-8 ${STICKY_KEBAB} ${cellBg} flex items-center justify-end`}
        onClick={(e) => e.stopPropagation()}
      >
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
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onClick={() => onOpenModal(node.keyId!, node.fullPath)}
              className="cursor-pointer"
            >
              {canEdit ? "詳細編輯" : "詳細檢視"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onViewHistory(node.keyId!)}
              className="cursor-pointer"
            >
              <History className="h-4 w-4 mr-2" />
              查看編輯歷程
            </DropdownMenuItem>
            {canEdit && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    const parentSegments = node.fullPath
                      .split(".")
                      .slice(0, -1);
                    onInsertSibling(parentSegments.join("."));
                  }}
                  className="cursor-pointer"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  新增同層 Key
                </DropdownMenuItem>
                {node.sharedKeyId != null && onUnlinkShared && (
                  <DropdownMenuItem
                    onClick={() => onUnlinkShared(node.keyId!, node.fullPath)}
                    className="cursor-pointer"
                  >
                    <X className="h-4 w-4 mr-2" />
                    解除公版引用
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onRequestDelete(node.keyId!, node.fullPath)}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  刪除 Key
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
