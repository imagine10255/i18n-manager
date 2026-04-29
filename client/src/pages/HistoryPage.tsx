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
  Clock,
  Download,
  FileJson,
  Filter,
  Minus,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { X } from "lucide-react";

const FLAG_MAP: Record<string, string> = {
  "zh-TW": "🇹🇼", "zh-CN": "🇨🇳", "en": "🇺🇸", "ja": "🇯🇵",
  "ko": "🇰🇷", "fr": "🇫🇷", "de": "🇩🇪", "es": "🇪🇸",
};

const ACTION_STYLES = {
  create: { label: "新增", icon: Plus, className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  update: { label: "修改", icon: RefreshCw, className: "bg-blue-100 text-blue-700 border-blue-200" },
  delete: { label: "刪除", icon: Minus, className: "bg-red-100 text-red-700 border-red-200" },
};

const PAGE_SIZE = 50;

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
            ) : items.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Clock className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">尚無修改記錄</p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {items
                  .filter((item: any) => !filterAction || item.action === filterAction)
                  .map((item: any) => {
                    const actionStyle = ACTION_STYLES[item.action as keyof typeof ACTION_STYLES] ?? ACTION_STYLES.update;
                    const ActionIcon = actionStyle.icon;

                    return (
                      <div key={item.id} className="flex gap-4 px-5 py-4 hover:bg-secondary/20 transition-colors">
                        {/* Action icon */}
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${actionStyle.className}`}>
                          <ActionIcon className="h-3 w-3" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center flex-wrap gap-2">
                            <code className="text-xs font-mono bg-secondary px-2 py-0.5 rounded text-foreground/80">
                              {(item as { keyPath?: string }).keyPath ?? `Key #${item.keyId}`}
                            </code>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${actionStyle.className}`}>
                              {actionStyle.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {FLAG_MAP[item.localeCode] ?? "🌐"} {item.localeCode}
                            </span>
                          </div>

                          {/* Value diff */}
                          {item.action !== "delete" && (
                            <div className="flex items-start gap-2 text-xs">
                              {item.action === "update" && item.oldValue !== null && (
                                <>
                                  <span className="px-2 py-1 rounded bg-red-50 text-red-700 border border-red-100 line-through max-w-xs truncate">
                                    {item.oldValue || "(空)"}
                                  </span>
                                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mt-1 shrink-0" />
                                </>
                              )}
                              <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 max-w-xs truncate">
                                {item.newValue || "(空)"}
                              </span>
                            </div>
                          )}

                          {/* Meta */}
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span className="font-medium">
                              {(item as { changerName?: string | null }).changerName ?? "未知使用者"}
                            </span>
                            <span>·</span>
                            <span>
                              {new Date(item.changedAt).toLocaleString("zh-TW", {
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
