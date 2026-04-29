import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { ArrowRight, ChevronDown, ChevronRight, Clock, History } from "lucide-react";
import { LocaleFlag } from "./LocaleFlag";
import { findPreset } from "@/lib/localePresets";
import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  groupHistoryRecords,
  type HistoryGroup,
} from "@/lib/historyGroups";

const ACTION_STYLES: Record<string, { label: string; pill: string }> = {
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
const actionStyle = (a: string) => ACTION_STYLES[a] ?? ACTION_STYLES.update;

function formatTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface KeyHistoryModalProps {
  open: boolean;
  keyId: number | null;
  keyPath?: string;
  userIdToName: Map<number, string>;
  onClose: () => void;
}

export default function KeyHistoryModal({
  open,
  keyId,
  keyPath,
  userIdToName,
  onClose,
}: KeyHistoryModalProps) {
  const query = trpc.translation.getHistory.useQuery(
    { keyId: keyId ?? 0, limit: 200 },
    { enabled: open && keyId !== null }
  );
  const records = ((query.data as any)?.items ?? []) as any[];

  const enriched = useMemo(
    () =>
      records.map((r: any) => ({
        ...r,
        changerName: r.changerName ?? userIdToName.get(r.changedBy) ?? null,
      })),
    [records, userIdToName]
  );
  const groups = useMemo(
    () => groupHistoryRecords(enriched as any),
    [enriched]
  );

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // ── Virtualized list (handles long edit history without DOM bloat) ──
  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 80,
    overscan: 8,
    measureElement:
      typeof window !== "undefined"
        ? (el) => el.getBoundingClientRect().height
        : undefined,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!max-w-4xl w-[min(96vw,960px)] max-h-[88vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border/60 bg-muted/30">
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" />
            編輯歷程
          </DialogTitle>
          {keyPath && (
            <DialogDescription className="font-mono text-xs break-all pt-1">
              {keyPath}
            </DialogDescription>
          )}
        </DialogHeader>

        <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-elegant">
          {query.isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 bg-muted/40 animate-pulse rounded-lg"
                />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-16 px-6">
              <Clock className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium">尚無編輯紀錄</p>
              <p className="text-xs text-muted-foreground mt-1">
                這個 Key 還沒有任何修改歷程
              </p>
            </div>
          ) : (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((vItem) => {
                const g = groups[vItem.index];
                return (
                  <div
                    key={g.key}
                    ref={virtualizer.measureElement}
                    data-index={vItem.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${vItem.start}px)`,
                    }}
                    className="border-b border-border/40"
                  >
                    <ModalGroupRow
                      group={g}
                      expanded={expanded.has(g.key)}
                      onToggle={() => toggle(g.key)}
                      showKeyPath={false}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModalGroupRow({
  group,
  expanded,
  onToggle,
  showKeyPath,
}: {
  group: HistoryGroup;
  expanded: boolean;
  onToggle: () => void;
  showKeyPath: boolean;
}) {
  const style = actionStyle(group.action as string);
  const editor = group.changerName ?? "未知使用者";
  const at = formatTime(group.changedAt);
  const distinctLocales = new Set(group.records.map((r) => r.localeCode));
  // For per-key modal, batch is usually multi-locale on same key
  if (!group.isBatch) {
    const r: any = group.records[0];
    return (
      <div className="flex gap-3 px-5 py-3 hover:bg-muted/40 transition-colors">
        <span
          className={`shrink-0 mt-0.5 inline-flex h-6 px-2 items-center rounded-full text-[11px] font-semibold ring-1 ${style.pill}`}
        >
          {style.label}
        </span>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center flex-wrap gap-2 text-xs">
            {showKeyPath && (
              <code className="font-mono bg-card px-1.5 py-0.5 rounded text-foreground/80 break-all">
                {r.keyPath ?? `Key #${r.keyId}`}
              </code>
            )}
            {r.localeCode !== "*" && (
              <>
                <LocaleFlag code={r.localeCode} size="xs" />
                <span className="text-muted-foreground font-mono">
                  {findPreset(r.localeCode)?.name ?? r.localeCode}
                </span>
              </>
            )}
            {r.localeCode === "*" && (
              <span className="text-muted-foreground italic text-[11px]">
                （整個 Key）
              </span>
            )}
          </div>
          {r.action !== "delete" && (r.oldValue || r.newValue) && (
            <div className="flex items-start gap-2 text-xs flex-wrap">
              {r.action === "update" && r.oldValue !== null && r.oldValue !== "" && (
                <>
                  <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-300 line-through break-all">
                    {r.oldValue || "(空)"}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground mt-1 shrink-0" />
                </>
              )}
              {r.newValue !== null && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 break-all">
                  {r.newValue || "(空)"}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">{editor}</span>
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

  // Batch
  const distinctKeys = new Set(group.records.map((r) => r.keyId)).size;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors text-left"
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
        <span className="text-sm text-foreground/90 min-w-0 flex-1">
          {style.label}{" "}
          {showKeyPath ? (
            <>
              <span className="font-semibold tabular-nums">{distinctKeys}</span>{" "}
              個 Key
            </>
          ) : (
            <>
              <span className="font-semibold tabular-nums">
                {distinctLocales.size}
              </span>{" "}
              個語系
            </>
          )}
          {group.records.length > Math.max(distinctKeys, distinctLocales.size) && (
            <span className="text-muted-foreground">
              （{group.records.length} 筆變更）
            </span>
          )}
        </span>
        <span className="text-[11px] text-muted-foreground shrink-0">
          {editor} · {at}
          {group.versionId != null && ` · 版本 #${group.versionId}`}
        </span>
      </button>
      {expanded && (
        <div className="bg-muted/40 divide-y divide-border/40 border-t border-border/40">
          {group.records.map((r: any, i) => (
            <div
              key={r.id ?? i}
              className="grid items-start gap-3 pl-12 pr-5 py-2 text-xs"
              style={{
                gridTemplateColumns: showKeyPath
                  ? "minmax(0, 2fr) minmax(0, 1.2fr) minmax(0, 3fr)"
                  : "minmax(0, 1.2fr) minmax(0, 3fr)",
              }}
            >
              {showKeyPath && (
                <code className="font-mono bg-card px-1.5 py-0.5 rounded text-foreground/80 break-all min-w-0">
                  {r.keyPath ?? `Key #${r.keyId}`}
                </code>
              )}
              <div className="text-muted-foreground min-w-0 flex items-center gap-1">
                {r.localeCode === "*" ? (
                  <span className="italic">— 整個 Key —</span>
                ) : (
                  <>
                    <LocaleFlag code={r.localeCode} size="xs" />
                    <span className="font-mono truncate">
                      {findPreset(r.localeCode)?.name ?? r.localeCode}
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-start gap-2 flex-wrap min-w-0">
                {r.action === "update" && r.oldValue !== null && r.oldValue !== "" && (
                  <>
                    <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-300 line-through break-all">
                      {r.oldValue || "(空)"}
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
                  </>
                )}
                {r.action !== "delete" && r.newValue !== null && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 break-all">
                    {r.newValue || "(空)"}
                  </span>
                )}
                {r.action === "delete" && (
                  <span className="text-muted-foreground italic">已刪除</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
