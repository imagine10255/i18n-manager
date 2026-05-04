/**
 * SharedKeysManager — 跨專案共用的平面字典池編輯器。
 *
 * 介面完全對齊 TranslationEditor：
 *   • 同款 sticky KEY/LOCALES/META 三欄
 *   • Folder（群組）/ Leaf row 樣式一致
 *   • Pending updates → 保存（批次）模式，不會邊改邊 commit
 *   • 歷程 / 顯示語系 / 統計 pills / 已同步狀態
 *
 * 與 TranslationEditor 的差異：
 *   • 沒有「專案 / 版本」概念（這就是字典池本體）
 *   • 沒有「設定」與「從公版字典插入」（不適用）
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LocaleFlag } from "@/components/LocaleFlag";
import { findPreset } from "@/lib/localePresets";
import {
  ArrowDownAZ,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FileJson,
  FolderTree,
  History,
  KeyRound,
  Languages,
  Library,
  Loader2,
  Maximize2,
  Minimize2,
  MoreVertical,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import KeyHistoryModal from "@/components/KeyHistoryModal";

// ────────────────────────────────────────────────────────────
// Layout constants — keep in sync with TranslationEditorOptimized
// ────────────────────────────────────────────────────────────
const ROW_HEIGHT = 56;
const KEY_COL = "min-w-[260px] flex-[0_0_280px]";
const META_COL = "hidden md:flex flex-[0_0_auto] w-[120px]";
const LOCALES_COL = "flex-1 min-w-0";

const STICKY_LEFT = "sticky left-0 z-[2]";
const STICKY_META = "sticky right-8 z-[2]";
const STICKY_KEBAB = "sticky right-0 z-[2]";
const STICKY_LEFT_SHADOW =
  "shadow-[6px_0_10px_-8px_rgba(0,0,0,0.25)] dark:shadow-[6px_0_10px_-8px_rgba(0,0,0,0.6)]";
const STICKY_RIGHT_SHADOW =
  "shadow-[-6px_0_10px_-8px_rgba(0,0,0,0.25)] dark:shadow-[-6px_0_10px_-8px_rgba(0,0,0,0.6)]";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────
function localeChineseName(locale: {
  code: string;
  name?: string;
  nativeName?: string;
}) {
  const preset = findPreset(locale.code);
  if (preset) return preset.name;
  return locale.name || locale.nativeName || locale.code;
}

function formatRelativeOrDate(d: Date): string {
  const now = Date.now();
  const diffMs = now - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 0)
    return d.toLocaleDateString("zh-TW", { month: "short", day: "numeric" });
  if (sec < 60) return "剛剛";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} 天前`;
  return d.toLocaleDateString("zh-TW", { month: "short", day: "numeric" });
}

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
// Tree node
// ────────────────────────────────────────────────────────────
interface SharedTreeNode {
  id: string;
  fullPath: string;
  keyPath: string;
  isFolder: boolean;
  isExpanded: boolean;
  children: SharedTreeNode[];
  level: number;
  keyId?: number;
  description?: string;
  lastModified?: Date;
  lastModifiedBy?: number;
  sortOrder: number;
}

// ────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────
export default function SharedKeysManager() {
  const { data: user } = trpc.auth.me.useQuery();
  const role = (user as { role?: string })?.role ?? "rd";
  const canEdit = role === "admin" || role === "editor";

  const utils = trpc.useUtils();
  const { data: localesData } = trpc.locale.listActive.useQuery();
  const allLocales = (localesData ?? []) as Array<{
    id: number;
    code: string;
    name: string;
    nativeName: string;
  }>;

  const { data: usersBasic } = trpc.user.listBasic.useQuery();
  const userIdToName = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of (usersBasic ?? []) as any[]) m.set(u.id, u.name ?? "");
    return m;
  }, [usersBasic]);

  const { data: keysWithTrans, isLoading } =
    trpc.sharedKey.listWithTranslations.useQuery({});
  const allKeys = (keysWithTrans ?? []) as any[];

  // ── locale visibility (localStorage) ──────────────────────────────────────
  const LS_KEY = "shared-keys-hidden-locales";
  const [hiddenLocaleCodes, setHiddenLocaleCodesState] = useState<Set<string>>(
    new Set()
  );
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        setHiddenLocaleCodesState(
          new Set(Array.isArray(arr) ? (arr as string[]) : [])
        );
      }
    } catch {
      /* ignore */
    }
  }, []);
  const setHiddenLocaleCodes = useCallback((next: Set<string>) => {
    setHiddenLocaleCodesState(next);
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(Array.from(next)));
    } catch {
      /* ignore */
    }
  }, []);
  const locales = useMemo(
    () => allLocales.filter((l) => !hiddenLocaleCodes.has(l.code)),
    [allLocales, hiddenLocaleCodes]
  );

  // ── search / expand ───────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // ── pending edits ─────────────────────────────────────────────────────────
  const [pendingUpdates, setPendingUpdates] = useState<
    Map<string, { sharedKeyId: number; localeCode: string; value: string }>
  >(new Map());

  // ── modals ────────────────────────────────────────────────────────────────
  const [showAddKey, setShowAddKey] = useState(false);
  const [historyKey, setHistoryKey] = useState<{
    id: number;
    path: string;
  } | null>(null);
  const [deletingKey, setDeletingKey] = useState<{
    ids: number[];
    path: string;
    isFolder?: boolean;
  } | null>(null);

  // ── tree build ────────────────────────────────────────────────────────────
  const tree = useMemo<SharedTreeNode[]>(() => {
    const filtered = searchTerm.trim()
      ? allKeys.filter((k) => {
          const q = searchTerm.trim().toLowerCase();
          return (
            k.keyPath.toLowerCase().includes(q) ||
            (k.description ?? "").toLowerCase().includes(q)
          );
        })
      : allKeys;

    const map = new Map<string, SharedTreeNode>();
    for (const k of filtered) {
      const parts = (k.keyPath as string).split(".");
      let currentPath = "";
      for (let i = 0; i < parts.length; i++) {
        currentPath = i === 0 ? parts[0] : `${currentPath}.${parts[i]}`;
        if (map.has(currentPath)) continue;
        const isLeaf = i === parts.length - 1;

        let latestAt: Date | undefined;
        let latestBy: number | undefined;
        if (isLeaf) {
          for (const cell of Object.values(k.translations ?? {}) as any[]) {
            const at = cell?.updatedAt ? new Date(cell.updatedAt) : undefined;
            if (at && (!latestAt || at > latestAt)) {
              latestAt = at;
              latestBy = cell?.updatedBy ?? undefined;
            }
          }
        }

        const node: SharedTreeNode = {
          id: `node-${currentPath}`,
          fullPath: currentPath,
          keyPath: parts[i],
          isFolder: !isLeaf,
          isExpanded: false,
          children: [],
          level: i,
          keyId: isLeaf ? (k.id as number) : undefined,
          description: isLeaf ? k.description ?? undefined : undefined,
          lastModified: isLeaf ? latestAt : undefined,
          lastModifiedBy: isLeaf ? latestBy : undefined,
          sortOrder: isLeaf
            ? ((k as any).sortOrder ?? 0)
            : Number.POSITIVE_INFINITY,
        };
        map.set(currentPath, node);
        if (i > 0) {
          const parentPath = currentPath.substring(
            0,
            currentPath.lastIndexOf(".")
          );
          const parent = map.get(parentPath);
          if (parent) parent.children.push(node);
        }
      }
    }

    const roots: SharedTreeNode[] = [];
    for (const [path, node] of Array.from(map.entries())) {
      if (!path.includes(".")) roots.push(node);
    }

    const compute = (nodes: SharedTreeNode[]): {
      maxAt: Date | undefined;
      minOrder: number;
    } => {
      let maxAt: Date | undefined;
      let minOrder = Number.POSITIVE_INFINITY;
      for (const n of nodes) {
        if (n.isFolder) {
          const c = compute(n.children);
          if (c.maxAt) n.lastModified = c.maxAt;
          n.sortOrder = Number.isFinite(c.minOrder) ? c.minOrder : 0;
        }
        if (n.lastModified && (!maxAt || n.lastModified > maxAt)) {
          maxAt = n.lastModified;
        }
        if (n.sortOrder < minOrder) minOrder = n.sortOrder;
      }
      nodes.sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.keyPath.localeCompare(b.keyPath);
      });
      return { maxAt, minOrder };
    };
    compute(roots);
    return roots;
  }, [allKeys, searchTerm]);

  const folderLeafCount = useMemo(() => {
    const counts = new Map<string, number>();
    const walk = (nodes: SharedTreeNode[]): number => {
      let n = 0;
      for (const node of nodes) {
        if (node.isFolder) {
          const c = walk(node.children);
          counts.set(node.fullPath, c);
          n += c;
        } else n += 1;
      }
      return n;
    };
    walk(tree);
    return counts;
  }, [tree]);

  const isSearching = searchTerm.trim().length > 0;
  const flatList = useMemo(() => {
    const result: SharedTreeNode[] = [];
    const walk = (nodes: SharedTreeNode[]) => {
      for (const n of nodes) {
        result.push(n);
        if (
          n.isFolder &&
          (isSearching || expandedPaths.has(n.fullPath))
        ) {
          walk(n.children);
        }
      }
    };
    walk(tree);
    return result;
  }, [tree, expandedPaths, isSearching]);

  const totalLeafKeys = allKeys.length;
  const totalLocales = locales.length;

  // ── virtualizer ───────────────────────────────────────────────────────────
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flatList.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  // ── tree controls ─────────────────────────────────────────────────────────
  const toggleExpand = useCallback((node: SharedTreeNode) => {
    if (!node.isFolder) return;
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(node.fullPath)) next.delete(node.fullPath);
      else next.add(node.fullPath);
      return next;
    });
  }, []);
  const expandAll = useCallback(() => {
    const all = new Set<string>();
    const walk = (nodes: SharedTreeNode[]) => {
      for (const n of nodes) {
        if (n.isFolder) {
          all.add(n.fullPath);
          walk(n.children);
        }
      }
    };
    walk(tree);
    setExpandedPaths(all);
  }, [tree]);
  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  // ── cell helpers ──────────────────────────────────────────────────────────
  // O(1) keyId → row 查表，避免每個 input 每次 render 都做 O(n) find
  const keyById = useMemo(() => {
    const m = new Map<number, any>();
    for (const k of allKeys) m.set(k.id as number, k);
    return m;
  }, [allKeys]);

  const getValue = useCallback(
    (keyId: number, localeCode: string) => {
      const k = `${keyId}:${localeCode}`;
      if (pendingUpdates.has(k)) return pendingUpdates.get(k)!.value;
      const row = keyById.get(keyId);
      return row?.translations?.[localeCode]?.value ?? "";
    },
    [pendingUpdates, keyById]
  );

  // pending 是否「真的」與 DB 不同 — 用來顯示橘色標記
  const isPending = useCallback(
    (keyId: number, localeCode: string) => {
      const k = `${keyId}:${localeCode}`;
      if (!pendingUpdates.has(k)) return false;
      const pendingVal = pendingUpdates.get(k)!.value;
      const row = keyById.get(keyId);
      const original = row?.translations?.[localeCode]?.value ?? "";
      return pendingVal !== original;
    },
    [pendingUpdates, keyById]
  );

  // 永遠 set 進 pending，不去比對 original — 比對放到 hasChanges/handleSave 那邊算。
  // 之前用 `value === original ? delete : set` 會在 listWithTranslations
  // invalidate 後 allKeys 還沒回來時把空字串 pending 誤刪 → 看起來就是「按 backspace
  // 清空又彈回去」。這個寫法根本不依賴 allKeys，所以也不會造成 LeafRow 因
  // handleCellChange 重建而連帶 re-render。
  const handleCellChange = useCallback(
    (keyId: number, localeCode: string, value: string) => {
      const k = `${keyId}:${localeCode}`;
      setPendingUpdates((prev) => {
        const next = new Map(prev);
        next.set(k, { sharedKeyId: keyId, localeCode, value });
        return next;
      });
    },
    []
  );

  // 真正會被送到後端的 updates — 過濾掉與 DB 相同的 no-op。
  const meaningfulUpdates = useMemo(() => {
    const out: Array<{
      sharedKeyId: number;
      localeCode: string;
      value: string;
    }> = [];
    for (const p of Array.from(pendingUpdates.values())) {
      const row = keyById.get(p.sharedKeyId);
      const original = row?.translations?.[p.localeCode]?.value ?? "";
      if (p.value !== original) out.push(p);
    }
    return out;
  }, [pendingUpdates, keyById]);

  const hasChanges = meaningfulUpdates.length > 0;

  // ── mutations ─────────────────────────────────────────────────────────────
  const createKeyMutation = trpc.sharedKey.create.useMutation({
    onSuccess: () => {
      toast.success("Key 已新增");
      utils.sharedKey.listWithTranslations.invalidate();
      utils.sharedKey.listAllFlat.invalidate();
    },
    onError: (e) => toast.error(`新增失敗：${e.message}`),
  });
  const deleteKeyMutation = trpc.sharedKey.delete.useMutation({
    onSuccess: () => {
      toast.success("Key 已刪除");
      utils.sharedKey.listWithTranslations.invalidate();
      utils.sharedKey.listAllFlat.invalidate();
    },
    onError: (e) => toast.error(`刪除失敗：${e.message}`),
  });
  const batchUpsertMutation = trpc.sharedKey.batchUpsertValues.useMutation({
    onSuccess: async () => {
      // 先等 refetch 完成、新資料進到 allKeys，再清 pending — 避免那一瞬間
      // pending 沒了、allKeys 還沒更新 → 看起來「儲存後跳回舊值再跳回新值」。
      await utils.sharedKey.listWithTranslations.invalidate();
      setPendingUpdates(new Map());
      toast.success("已保存");
    },
    onError: (e) => toast.error(`保存失敗：${e.message}`),
  });
  const resortMutation = trpc.sharedKey.updateSortOrders.useMutation({
    onSuccess: () => {
      toast.success("已依命名重新排序");
      utils.sharedKey.listWithTranslations.invalidate();
    },
    onError: (e) => toast.error(`重排失敗：${e.message}`),
  });

  const handleSave = useCallback(async () => {
    if (meaningfulUpdates.length === 0) return;
    await batchUpsertMutation.mutateAsync({ updates: meaningfulUpdates });
  }, [meaningfulUpdates, batchUpsertMutation]);

  const handleResortByName = useCallback(() => {
    if (allKeys.length === 0) return;
    const sorted = [...allKeys].sort((a: any, b: any) =>
      a.keyPath.localeCompare(b.keyPath)
    );
    const items = sorted.map((k: any, i: number) => ({
      id: k.id as number,
      sortOrder: (i + 1) * 10,
    }));
    resortMutation.mutate({ items });
  }, [allKeys, resortMutation]);

  // ── keyboard shortcuts (⌘S save, ⌘A expand, ⌘Z collapse) ──────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === "s" && hasChanges) {
        e.preventDefault();
        handleSave();
      } else if (e.key === "a") {
        // Don't hijack normal text-area select-all
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          expandAll();
        }
      } else if (e.key === "z") {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          collapseAll();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasChanges, handleSave, expandAll, collapseAll]);

  // ── import / export ───────────────────────────────────────────────────────
  const importInputRef = useRef<HTMLInputElement>(null);
  const triggerImportFilePicker = () => importInputRef.current?.click();

  const handleImportFilesSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const supportedCodes = new Set(allLocales.map((l) => l.code));
    let totalUpdates: Array<{
      sharedKeyId: number;
      localeCode: string;
      value: string;
    }> = [];
    let createdCount = 0;
    const keysByPath = new Map(allKeys.map((k) => [k.keyPath as string, k]));

    for (const file of Array.from(files)) {
      const m = file.name.match(/^([a-zA-Z]{2,3}(?:-[A-Za-z]{2,4})?)\.json$/);
      if (!m) {
        toast.error(`忽略 ${file.name}：檔名需為 <locale>.json，如 zh-TW.json`);
        continue;
      }
      const code = m[1];
      if (!supportedCodes.has(code)) {
        toast.error(`忽略 ${file.name}：未啟用語系 ${code}`);
        continue;
      }
      let parsed: any;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        toast.error(`忽略 ${file.name}：JSON 解析失敗`);
        continue;
      }
      const flat = flattenJson(parsed);
      for (const [keyPath, value] of Object.entries(flat)) {
        let row = keysByPath.get(keyPath);
        if (!row) {
          // create the missing shared key first
          try {
            const { id } = await createKeyMutation.mutateAsync({
              keyPath,
            });
            row = { id, keyPath, translations: {} };
            keysByPath.set(keyPath, row);
            createdCount++;
          } catch {
            continue;
          }
        }
        totalUpdates.push({
          sharedKeyId: row.id,
          localeCode: code,
          value,
        });
      }
    }
    e.target.value = ""; // allow re-pick same files
    if (totalUpdates.length === 0) {
      toast.error("沒有可匯入的內容");
      return;
    }
    await batchUpsertMutation.mutateAsync({ updates: totalUpdates });
    toast.success(
      `匯入完成：新增 ${createdCount} 個 key、寫入 ${totalUpdates.length} 個值`
    );
  };

  const handleExportLocale = (code: string) => {
    const pairs = allKeys.map((k) => ({
      keyPath: k.keyPath as string,
      value: (k.translations?.[code]?.value as string) ?? "",
    }));
    const obj = buildNestedJson(pairs);
    downloadFile(`${code}.json`, JSON.stringify(obj, null, 2));
  };

  // ── derived widths ────────────────────────────────────────────────────────
  const tableMinWidth = useMemo(() => {
    const base = 16 + 280 + 12 + 12 + 120 + 12 + 32 + 16;
    const localesWidth =
      locales.length === 0
        ? 0
        : locales.length * 120 + (locales.length - 1) * 8;
    return base + localesWidth;
  }, [locales.length]);

  // ────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-3rem)] gap-2 w-full">
        {/* ───────────── Toolbar ───────────── */}
        <div className="rounded-xl border border-border/60 bg-card shadow-[var(--shadow-card)] overflow-hidden">
          {/* Row 1 — context: history / view filter / stats */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 flex-wrap">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              <Library className="h-3.5 w-3.5" />
              公版字典
            </div>
            <div className="h-5 w-px bg-border/70" />

            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => setHistoryKey({ id: 0, path: "" })}
              title="查看公版字典的全域編輯歷程"
            >
              <History className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">歷程</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5"
                  title="勾選要顯示的語系（只影響你看到的畫面）"
                  disabled={allLocales.length === 0}
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
                {allLocales.map((l) => {
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

            {/* Stat pills + sync indicator */}
            <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
              <StatPill
                icon={<KeyRound className="h-3 w-3" />}
                label={isSearching ? "顯示" : "Keys"}
                value={
                  isSearching ? `${flatList.filter((n) => !n.isFolder).length} / ${totalLeafKeys}` : totalLeafKeys
                }
              />
              <StatPill
                icon={<Languages className="h-3 w-3" />}
                label="語系"
                value={totalLocales}
              />
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

          {/* Row 2 — search + actions */}
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
              onClick={() => setShowAddKey(true)}
              disabled={!canEdit}
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              title={!canEdit ? "需要 editor 以上權限" : undefined}
            >
              <Plus className="h-3.5 w-3.5" />
              新增 Key
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={handleResortByName}
              disabled={!canEdit || allKeys.length === 0 || resortMutation.isPending}
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

            <Button
              disabled={!canEdit || allLocales.length === 0}
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={triggerImportFilePicker}
              title={
                !canEdit
                  ? "需要 editor 以上權限"
                  : "匯入 JSON（檔名 = 語系代碼，可一次選多檔）"
              }
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">匯入</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  disabled={allLocales.length === 0}
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
                <DropdownMenuLabel className="text-xs">單一語系</DropdownMenuLabel>
                {allLocales.map((l) => (
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
              disabled={isLoading}
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
              disabled={expandedPaths.size === 0}
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
              disabled={!hasChanges || !canEdit || batchUpsertMutation.isPending}
              size="sm"
              className={`h-9 gap-1.5 min-w-[110px] transition-all ${
                hasChanges ? "shadow-[var(--shadow-glow)]" : ""
              }`}
              title={!canEdit ? "需要 editor 以上權限" : "保存 (⌘S)"}
            >
              {batchUpsertMutation.isPending ? (
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
        {isLoading ? (
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
          <div className="flex-1 rounded-xl border border-dashed border-border bg-card/50 flex items-center justify-center p-12">
            <div className="text-center max-w-sm">
              <div
                className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "var(--gradient-primary)" }}
              >
                <FolderTree className="h-7 w-7 text-white" strokeWidth={2} />
              </div>
              <h3 className="text-base font-semibold tracking-tight">
                {searchTerm ? "找不到符合的 Key" : "目前沒有任何公版 Key"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                {searchTerm
                  ? `「${searchTerm}」沒有匹配的結果，試試其他關鍵字`
                  : "點擊「新增 Key」開始建立第一個公版條目"}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 rounded-xl border border-border/60 bg-card overflow-hidden flex flex-col shadow-[var(--shadow-card)]">
            <div ref={parentRef} className="flex-1 overflow-auto scrollbar-elegant">
              <div style={{ minWidth: `${tableMinWidth}px` }}>
                {/* Header */}
                <div className="sticky top-0 z-10 border-b border-border/60">
                  <div className="flex items-stretch text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <div
                      className={`${KEY_COL} ${STICKY_LEFT} ${STICKY_LEFT_SHADOW} flex items-center pl-4 pr-3 py-2.5 bg-muted/95 backdrop-blur-sm`}
                    >
                      Key
                    </div>
                    <div
                      className={`${LOCALES_COL} flex gap-2 items-center px-3 py-2 bg-muted/95 backdrop-blur-sm`}
                    >
                      {locales.map((locale) => (
                        <div
                          key={locale.code}
                          className="flex-1 min-w-[120px] flex items-center gap-2"
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
                    <div
                      className={`${META_COL} ${STICKY_META} ${STICKY_RIGHT_SHADOW} items-center justify-end pl-3 pr-2 py-2.5 bg-muted/95 backdrop-blur-sm`}
                    >
                      最後修改
                    </div>
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
                  {virtualizer.getVirtualItems().map((vi) => {
                    const node = flatList[vi.index];
                    if (!node) return null;
                    return (
                      <div
                        key={vi.key}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: `${vi.size}px`,
                          transform: `translateY(${vi.start}px)`,
                        }}
                      >
                        {node.isFolder ? (
                          <FolderRow
                            node={node}
                            isExpanded={expandedPaths.has(node.fullPath)}
                            onToggle={() => toggleExpand(node)}
                            leafCount={folderLeafCount.get(node.fullPath) ?? 0}
                            canEdit={canEdit}
                            onRequestDelete={() => {
                              const ids: number[] = [];
                              const collect = (nodes: SharedTreeNode[]) => {
                                for (const n of nodes) {
                                  if (n.isFolder) collect(n.children);
                                  else if (n.keyId) ids.push(n.keyId);
                                }
                              };
                              collect(node.children);
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
                            getValue={getValue}
                            isPending={isPending}
                            canEdit={canEdit}
                            onChange={handleCellChange}
                            onViewHistory={(keyId) =>
                              setHistoryKey({ id: keyId, path: node.fullPath })
                            }
                            onRequestDelete={(keyId, path) =>
                              setDeletingKey({ ids: [keyId], path })
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
      </div>

      {/* Add key dialog */}
      <AddKeyDialog
        open={showAddKey}
        onClose={() => setShowAddKey(false)}
        onCreate={async (keyPath, description) => {
          await createKeyMutation.mutateAsync({
            keyPath,
            description: description || undefined,
          });
          setShowAddKey(false);
        }}
        existingKeyPaths={allKeys.map((k) => k.keyPath as string)}
        pending={createKeyMutation.isPending}
      />

      {/* History modal — keyId=0 means "all shared keys" (global) */}
      <KeyHistoryModal
        open={historyKey !== null}
        keyId={historyKey?.id ?? null}
        keyPath={historyKey?.path}
        userIdToName={userIdToName}
        onClose={() => setHistoryKey(null)}
        source="shared"
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={deletingKey !== null}
        onOpenChange={(o) => !o && setDeletingKey(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletingKey?.isFolder
                ? `刪除整個群組「${deletingKey.path}」？`
                : `刪除 key「${deletingKey?.path}」？`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deletingKey?.isFolder
                ? `將會刪除 ${deletingKey.ids.length} 個 key。`
                : "刪除後，引用此 key 的專案 key 會落地當前值並解除引用。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deletingKey) return;
                for (const id of deletingKey.ids) {
                  await deleteKeyMutation.mutateAsync({ id });
                }
                setDeletingKey(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

// ────────────────────────────────────────────────────────────
// StatPill
// ────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────
// FolderRow — same shape as TranslationEditor
// ────────────────────────────────────────────────────────────
function FolderRow({
  node,
  isExpanded,
  onToggle,
  leafCount,
  canEdit,
  onRequestDelete,
}: {
  node: SharedTreeNode;
  isExpanded: boolean;
  onToggle: () => void;
  leafCount: number;
  canEdit: boolean;
  onRequestDelete: () => void;
}) {
  const cellBg = "bg-muted group-hover/folder:bg-secondary transition-colors";
  return (
    <button
      type="button"
      onClick={onToggle}
      className="group/folder w-full h-full flex items-stretch border-b border-border/60 text-left"
    >
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
          className={`h-4 w-4 shrink-0 ${
            isExpanded ? "text-primary" : "text-foreground/70"
          }`}
        />
        <span className="font-mono text-sm font-semibold tracking-tight truncate text-foreground">
          {node.keyPath}
        </span>
      </div>
      <div className={`${LOCALES_COL} flex items-center px-3 ${cellBg}`}>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-card border border-border text-[11px] text-muted-foreground tabular-nums shadow-sm">
          <KeyRound className="h-2.5 w-2.5" />
          {leafCount}
        </span>
      </div>
      <div
        className={`${META_COL} ${STICKY_META} ${STICKY_RIGHT_SHADOW} ${cellBg} items-center justify-end pl-3 pr-2 text-[11px] uppercase tracking-wider text-muted-foreground/80 font-semibold`}
      >
        群組
      </div>
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
                onClick={onRequestDelete}
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

// ────────────────────────────────────────────────────────────
// LeafRow — sticky key + locale inputs + meta + kebab, mirrors TranslationEditor
// ────────────────────────────────────────────────────────────
function LeafRow({
  node,
  locales,
  getValue,
  isPending,
  canEdit,
  onChange,
  onViewHistory,
  onRequestDelete,
  userIdToName,
}: {
  node: SharedTreeNode;
  locales: any[];
  getValue: (keyId: number, code: string) => string;
  isPending: (keyId: number, code: string) => boolean;
  canEdit: boolean;
  onChange: (keyId: number, code: string, value: string) => void;
  onViewHistory: (keyId: number) => void;
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

  const cellBg = "bg-card group-hover/row:bg-muted/70 transition-colors";
  return (
    <div className="group/row w-full h-full flex items-stretch border-b border-border/60 relative">
      <div
        className={`${KEY_COL} ${STICKY_LEFT} ${STICKY_LEFT_SHADOW} ${cellBg} relative pl-4 pr-3 text-left min-w-0 flex items-center gap-2`}
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
          <span className="font-mono text-sm font-medium truncate flex items-center gap-1.5">
            <span className="truncate">{node.keyPath}</span>
          </span>
          {node.description && (
            <span className="text-[11px] text-muted-foreground truncate mt-0.5">
              {node.description}
            </span>
          )}
        </div>
      </div>

      <div className={`${LOCALES_COL} flex gap-2 items-center px-3 ${cellBg}`}>
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
                placeholder={localeChineseName(locale)}
                value={val}
                readOnly={!canEdit}
                onChange={(e) => onChange(node.keyId!, locale.code, e.target.value)}
                className={`peer w-full h-9 pl-2.5 pr-7 text-sm rounded-md bg-input border transition-all
                  focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25
                  ${!canEdit ? "cursor-default opacity-90" : ""}
                  ${pending
                    ? "border-amber-500/60 bg-amber-500/5"
                    : filled
                      ? "border-border"
                      : "border-border/70 text-muted-foreground"}`}
                title={
                  !canEdit
                    ? `唯讀 — 需要 editor 以上權限`
                    : `${locale.name} (${locale.code})`
                }
              />
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

// ────────────────────────────────────────────────────────────
// AddKeyDialog
// ────────────────────────────────────────────────────────────
function AddKeyDialog({
  open,
  onClose,
  onCreate,
  existingKeyPaths,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (keyPath: string, description: string) => Promise<void> | void;
  existingKeyPaths: string[];
  pending?: boolean;
}) {
  const [keyPath, setKeyPath] = useState("");
  const [desc, setDesc] = useState("");
  useEffect(() => {
    if (open) {
      setKeyPath("");
      setDesc("");
    }
  }, [open]);
  const dup = keyPath.trim().length > 0 && existingKeyPaths.includes(keyPath.trim());
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增公版 Key</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="k-path">Key Path</Label>
            <Input
              id="k-path"
              value={keyPath}
              onChange={(e) => setKeyPath(e.target.value)}
              placeholder="例如：common.button.confirm"
              autoFocus
            />
            {dup && (
              <p className="text-xs text-destructive">
                此 keyPath 已存在於公版字典
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="k-desc">說明（選填）</Label>
            <Textarea
              id="k-desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={pending || dup || !keyPath.trim()}
            onClick={() => onCreate(keyPath.trim(), desc.trim())}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            建立
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
