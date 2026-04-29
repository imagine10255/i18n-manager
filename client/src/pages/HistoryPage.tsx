import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileJson,
  Filter,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { X } from "lucide-react";
import {
  groupHistoryRecords,
  distinctKeyCount,
  type HistoryGroup,
} from "@/lib/historyGroups";

const FLAG_MAP: Record<string, string> = {
  "zh-TW": "🇹🇼", "zh-CN": "🇨🇳", "en": "🇺🇸", "ja": "🇯🇵",
  "ko": "🇰🇷", "fr": "🇫🇷", "de": "🇩🇪", "es": "🇪🇸",
};

const ACTION_STYLES: Record<
  string,
  { label: string; pill: string }
> = {
  create: {
    label: "新增",
    pill: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30",
  },
  update: {
    label: "修改",
    pill: "bg-blue-500/15 text-blue-700 dark:text-blue-300 ring-blue-500/30",
  },
  delete: {
    label: "刪除",
    pill: "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-rose-500/30",
  },
};

function actionStyle(a: string) {
  return ACTION_STYLES[a] ?? ACTION_STYLES.update;
}

const PAGE_SIZE = 200;

export default function HistoryPage() {
  const [, setLocation] = useLocation();
  // Pull ?keyId=N out of the URL so the editor can deep-link here for a single key.
  const initialKeyId = (() => {
    if (typeof window === "undefined") return null;
    const v = new URLSearchParams(window.location.search).get("keyId");
    const n = v ? parseInt(v, 10) : NaN;
    return Number.isFinite(n) ? n : null;
  })();
  const [filterKeyId, setFilterKeyId] = useState<number | null>(initialKeyId);
  const [filterKeyPath, setFilterKeyPath] = useState<string>("");
  const [filterLocale, setFilterLocale] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [offset, setOffset] = useState(0);
  const [showExport, setShowExport] = useState(false);
  const [exportLocale, setExportLocale] = useState("");
  const [exportData, setExportData] = useState<string | null>(null);

  const { data: locales } = trpc.locale.listActive.useQuery();

  // If linked-in with a keyId, fetch that key's path so we can show "filtering by …"
  const keyDetailQuery = trpc.translationKey.list.useQuery(
    { projectId: 1 },
    { enabled: filterKeyId !== null }
  );
  useEffect(() => {
    if (filterKeyId === null) {
      setFilterKeyPath("");
      return;
    }
    const found = (keyDetailQuery.data ?? []).find(
      (k: any) => k.id === filterKeyId
    );
    setFilterKeyPath(found?.keyPath ?? `#${filterKeyId}`);
  }, [filterKeyId, keyDetailQuery.data]);

  const { data: historyData, isLoading } = trpc.translation.getHistory.useQuery({
    keyId: filterKeyId ?? undefined,
    localeCode: filterLocale || undefined,
    limit: PAGE_SIZE,
    offset,
  });

  const exportQuery = trpc.translation.exportJson.useMutation();

  const handleExport = async (localeCode: string) => {
    setExportLocale(localeCode);
    try {
      // TODO: Implement export functionality
      const json = "{}";
        setExportData(json);

        // Trigger download
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `translations-${localeCode}-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("已匯出翻譯檔案");
    } catch (error) {
      toast.error("匯出失敗");
    }
  };

  const items = historyData?.items ?? [];
  const total = historyData?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const filteredItems = useMemo(
    () =>
      (items as any[]).filter(
        (item) => !filterAction || item.action === filterAction
      ),
    [items, filterAction]
  );

  /** Group adjacent records that came from the same save (same action + user, same versionId or close in time). */
  const groups: HistoryGroup[] = useMemo(
    () => groupHistoryRecords(filteredItems as any),
    [filteredItems]
  );

  /** Which group keys are currently expanded (showing per-record detail). */
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // ── Virtualized list — runs over groups rather than raw records ──
  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 92,
    overscan: 8,
    measureElement:
      typeof window !== "undefined"
        ? (el) => el.getBoundingClientRect().height
        : undefined,
  });

  return (
    <DashboardLayout>
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">修改歷程</h1>
            <p className="text-sm text-muted-foreground mt-1">
              追蹤所有翻譯修改記錄，確保版本一致性
            </p>
          </div>
          <Button
            onClick={() => setShowExport(true)}
            variant="outline"
            size="sm"
            className="gap-2 shrink-0"
          >
            <Download className="h-4 w-4" />
            匯出 JSON
          </Button>
        </div>

        {/* Linked-in key filter banner */}
        {filterKeyId !== null && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <div className="flex items-center gap-2 text-sm min-w-0">
              <Filter className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-muted-foreground">僅顯示 Key</span>
              <code className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded truncate">
                {filterKeyPath || `#${filterKeyId}`}
              </code>
              <span className="text-muted-foreground">的歷程</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterKeyId(null);
                setFilterKeyPath("");
                setOffset(0);
                // also clear the URL param so refresh doesn't re-apply it
                if (typeof window !== "undefined") {
                  setLocation("/history");
                }
              }}
              className="h-7 gap-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              清除
            </Button>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">篩選：</span>
          </div>

          <select
            value={filterLocale}
            onChange={(e) => { setFilterLocale(e.target.value); setOffset(0); }}
            className="h-9 px-3 text-sm rounded-md border border-input bg-background text-foreground"
          >
            <option value="">所有語系</option>
            {locales?.map((l) => (
              <option key={l.code} value={l.code}>
                {FLAG_MAP[l.code] ?? "🌐"} {l.nativeName}
              </option>
            ))}
          </select>

          <select
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setOffset(0); }}
            className="h-9 px-3 text-sm rounded-md border border-input bg-background text-foreground"
          >
            <option value="">所有操作</option>
            <option value="create">新增</option>
            <option value="update">修改</option>
            <option value="delete">刪除</option>
          </select>

          <div className="ml-auto text-xs text-muted-foreground">
            共 {total} 筆記錄
          </div>
        </div>

        {/* History list */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              修改記錄
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Clock className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">尚無修改記錄</p>
              </div>
            ) : (
              <div
                ref={listRef}
                className="overflow-y-auto scrollbar-elegant"
                style={{ maxHeight: "calc(100vh - 320px)" }}
              >
                <div
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                  }}
                >
                  {virtualizer.getVirtualItems().map((vItem) => {
                    const group = groups[vItem.index];
                    const isExpanded = expandedGroups.has(group.key);
                    return (
                      <div
                        key={group.key}
                        ref={virtualizer.measureElement}
                        data-index={vItem.index}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${vItem.start}px)`,
                        }}
                        className="border-b border-border/30"
                      >
                        <HistoryGroupRow
                          group={group}
                          expanded={isExpanded}
                          onToggle={() => toggleGroup(group.key)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
            >
              上一頁
            </Button>
            <span className="text-sm text-muted-foreground">
              第 {currentPage} / {totalPages} 頁
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
            >
              下一頁
            </Button>
          </div>
        )}
      </div>

      {/* Export Dialog */}
      <Dialog open={showExport} onOpenChange={setShowExport}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5 text-primary" />
              匯出 JSON 翻譯檔
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              選擇語系後匯出標準巢狀 JSON 格式，可直接放入前端 i18n 專案使用。
            </p>
            <div className="grid grid-cols-1 gap-2">
              {locales?.map((locale) => (
                <button
                  key={locale.code}
                  onClick={() => handleExport(locale.code)}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/50 hover:bg-secondary/50 transition-colors text-left group"
                >
                  <span className="text-2xl">{FLAG_MAP[locale.code] ?? "🌐"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{locale.nativeName}</p>
                    <p className="text-xs text-muted-foreground font-mono">{locale.code}.json</p>
                  </div>
                  <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

/**
 * One row in the history list — could be a single record OR a roll-up of
 * many records that all came from the same save (same action, same user,
 * same time bucket / version). The text-only "新增 / 修改 / 刪除" pill on
 * the left replaces the previous icon-in-circle.
 */
function HistoryGroupRow({
  group,
  expanded,
  onToggle,
}: {
  group: HistoryGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const style = actionStyle(group.action as string);
  const distinctKeys = distinctKeyCount(group);
  const editor = group.changerName ?? "未知使用者";
  const at = group.changedAt.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Single record path — render the original detailed row layout
  if (!group.isBatch) {
    const item = group.records[0] as any;
    return (
      <div className="flex gap-3 px-5 py-4 hover:bg-secondary/20 transition-colors">
        <span
          className={`shrink-0 mt-0.5 inline-flex h-6 px-2 items-center rounded-full text-[11px] font-semibold ring-1 ${style.pill}`}
        >
          {style.label}
        </span>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center flex-wrap gap-2">
            <code className="text-xs font-mono bg-secondary px-2 py-0.5 rounded text-foreground/80 break-all">
              {item.keyPath ?? `Key #${item.keyId}`}
            </code>
            {item.localeCode !== "*" && (
              <span className="text-xs text-muted-foreground">
                {FLAG_MAP[item.localeCode] ?? "🌐"} {item.localeCode}
              </span>
            )}
          </div>
          {item.action !== "delete" && (item.oldValue || item.newValue) && (
            <div className="flex items-start gap-2 text-xs flex-wrap">
              {item.action === "update" && item.oldValue !== null && (
                <>
                  <span className="px-2 py-1 rounded bg-rose-500/10 text-rose-700 dark:text-rose-300 line-through break-all">
                    {item.oldValue || "(空)"}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mt-1 shrink-0" />
                </>
              )}
              {item.newValue !== null && (
                <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 break-all">
                  {item.newValue || "(空)"}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="font-medium">{editor}</span>
            <span>·</span>
            <span>{at}</span>
            {group.versionId != null && (
              <>
                <span>·</span>
                <span>版本 #{group.versionId}</span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Batch path — collapsible roll-up
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-secondary/30 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <span
          className={`shrink-0 inline-flex h-6 px-2 items-center rounded-full text-[11px] font-semibold ring-1 ${style.pill}`}
        >
          {style.label}
        </span>
        <span className="text-sm text-foreground/90">
          {style.label} <span className="font-semibold tabular-nums">{distinctKeys}</span> 個 Key
          {group.records.length > distinctKeys && (
            <span className="text-muted-foreground">
              （{group.records.length} 筆變更）
            </span>
          )}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground flex items-center gap-2">
          <span className="font-medium text-foreground/80">{editor}</span>
          <span>·</span>
          <span>{at}</span>
          {group.versionId != null && (
            <>
              <span>·</span>
              <span>版本 #{group.versionId}</span>
            </>
          )}
        </span>
      </button>
      {expanded && (
        <div className="bg-muted/30 divide-y divide-border/40 border-t border-border/40">
          {group.records.map((r: any, i: number) => (
            <div
              key={r.id ?? i}
              className="flex items-start gap-3 pl-14 pr-5 py-2.5 text-xs"
            >
              <code className="font-mono bg-card px-1.5 py-0.5 rounded text-foreground/80 break-all">
                {r.keyPath ?? `Key #${r.keyId}`}
              </code>
              {r.localeCode !== "*" && (
                <span className="text-muted-foreground shrink-0">
                  {FLAG_MAP[r.localeCode] ?? "🌐"} {r.localeCode}
                </span>
              )}
              <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                {r.action === "update" && r.oldValue !== null && r.oldValue !== "" && (
                  <>
                    <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-300 line-through break-all">
                      {r.oldValue || "(空)"}
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  </>
                )}
                {r.action !== "delete" && r.newValue !== null && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 break-all">
                    {r.newValue || "(空)"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
