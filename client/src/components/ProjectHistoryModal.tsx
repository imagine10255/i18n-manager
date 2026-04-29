import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { ArrowRight, ChevronDown, ChevronRight, Clock, History, Search } from "lucide-react";
import { LocaleFlag } from "./LocaleFlag";
import { findPreset } from "@/lib/localePresets";
import { useMemo, useState } from "react";
import { Input } from "./ui/input";
import { groupHistoryRecords, type HistoryGroup } from "@/lib/historyGroups";

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

interface ProjectHistoryModalProps {
  open: boolean;
  projectId: number | null;
  projectName?: string;
  /** Map keyId → keyPath, so each history record can be displayed with its key path */
  keyIdToPath: Map<number, string>;
  userIdToName: Map<number, string>;
  onClose: () => void;
}

export default function ProjectHistoryModal({
  open,
  projectId,
  projectName,
  keyIdToPath,
  userIdToName,
  onClose,
}: ProjectHistoryModalProps) {
  const [search, setSearch] = useState("");

  const query = trpc.translation.getHistory.useQuery(
    { projectId: projectId ?? 0, limit: 300 },
    { enabled: open && projectId !== null }
  );
  const records = ((query.data as any)?.items ?? []) as any[];

  const enriched = useMemo(
    () =>
      records.map((r: any) => ({
        ...r,
        keyPath: r.keyPath ?? keyIdToPath.get(r.keyId) ?? null,
        changerName: r.changerName ?? userIdToName.get(r.changedBy) ?? null,
      })),
    [records, keyIdToPath, userIdToName]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enriched;
    return enriched.filter((r: any) => {
      return (
        (r.keyPath ?? "").toLowerCase().includes(q) ||
        (r.newValue ?? "").toLowerCase().includes(q) ||
        (r.oldValue ?? "").toLowerCase().includes(q) ||
        (r.changerName ?? "").toLowerCase().includes(q) ||
        (r.localeCode ?? "").toLowerCase().includes(q)
      );
    });
  }, [enriched, search]);

  const groups: HistoryGroup[] = useMemo(
    () => groupHistoryRecords(filtered as any),
    [filtered]
  );

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!max-w-3xl w-[min(94vw,820px)] max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border/60 bg-muted/30">
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" />
            專案編輯歷程
          </DialogTitle>
          {projectName && (
            <DialogDescription className="text-xs pt-1">
              {projectName} · 顯示最近 300 筆紀錄
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Search */}
        <div className="px-6 py-3 border-b border-border/60">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋 keyPath / 內文 / 修改者 / 語系"
              className="pl-9 h-9"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-elegant">
          {query.isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-16 bg-muted/40 animate-pulse rounded-lg"
                />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-16 px-6">
              <Clock className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium">
                {search ? "沒有符合的歷程" : "尚無編輯紀錄"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {search ? `「${search}」沒有比對到內容` : "這個專案還沒有任何修改"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {groups.map((g) => (
                <ProjectGroupRow
                  key={g.key}
                  group={g}
                  expanded={expanded.has(g.key)}
                  onToggle={() => toggle(g.key)}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProjectGroupRow({
  group,
  expanded,
  onToggle,
}: {
  group: HistoryGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const style = actionStyle(group.action as string);
  const editor = group.changerName ?? "未知使用者";
  const at = formatTime(group.changedAt);
  const distinctKeys = new Set(group.records.map((r) => r.keyId)).size;

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
            <code className="font-mono bg-card px-1.5 py-0.5 rounded text-foreground/80 truncate max-w-[40%]">
              {r.keyPath ?? `Key #${r.keyId}`}
            </code>
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
                  <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-300 line-through truncate max-w-[180px]">
                    {r.oldValue || "(空)"}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground mt-1 shrink-0" />
                </>
              )}
              {r.newValue !== null && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 truncate max-w-[180px]">
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
          <span className="font-semibold tabular-nums">{distinctKeys}</span>{" "}
          個 Key
          {group.records.length > distinctKeys && (
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
              className="flex items-start gap-3 pl-12 pr-5 py-2 text-xs"
            >
              <code className="font-mono bg-card px-1.5 py-0.5 rounded text-foreground/80 truncate max-w-[35%]">
                {r.keyPath ?? `Key #${r.keyId}`}
              </code>
              {r.localeCode !== "*" && (
                <span className="flex items-center gap-1 shrink-0 text-muted-foreground">
                  <LocaleFlag code={r.localeCode} size="xs" />
                  <span className="font-mono">
                    {findPreset(r.localeCode)?.name ?? r.localeCode}
                  </span>
                </span>
              )}
              <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                {r.action === "update" && r.oldValue !== null && r.oldValue !== "" && (
                  <>
                    <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-300 line-through truncate max-w-[160px]">
                      {r.oldValue || "(空)"}
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  </>
                )}
                {r.action !== "delete" && r.newValue !== null && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 truncate max-w-[160px]">
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
