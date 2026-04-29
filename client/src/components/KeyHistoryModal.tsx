import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Clock, History, Minus, Plus, RefreshCw } from "lucide-react";
import { LocaleBadge } from "./LocaleBadge";
import { findPreset } from "@/lib/localePresets";

const ACTION_META: Record<
  string,
  { label: string; icon: typeof Plus; bg: string; text: string; ring: string }
> = {
  create: {
    label: "新增",
    icon: Plus,
    bg: "bg-emerald-500/15",
    text: "text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-500/30",
  },
  update: {
    label: "修改",
    icon: RefreshCw,
    bg: "bg-blue-500/15",
    text: "text-blue-700 dark:text-blue-300",
    ring: "ring-blue-500/30",
  },
  delete: {
    label: "刪除",
    icon: Minus,
    bg: "bg-rose-500/15",
    text: "text-rose-700 dark:text-rose-300",
    ring: "ring-rose-500/30",
  },
};

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
  const records = (query.data ?? []) as any[];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!max-w-2xl w-[min(92vw,720px)] max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0">
        {/* Header */}
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-elegant">
          {query.isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 bg-muted/40 animate-pulse rounded-lg"
                />
              ))}
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-16 px-6">
              <Clock className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium">尚無編輯紀錄</p>
              <p className="text-xs text-muted-foreground mt-1">
                這個 Key 還沒有任何修改歷程
              </p>
            </div>
          ) : (
            <ol className="relative px-6 py-5">
              {/* timeline line */}
              <span
                aria-hidden
                className="absolute left-[33px] top-7 bottom-7 w-px bg-border"
              />
              {records.map((r, i) => {
                const action = ACTION_META[r.action] ?? ACTION_META.update;
                const Icon = action.icon;
                const editor =
                  userIdToName.get(r.changedBy) ?? `#${r.changedBy}`;
                const isWildcard = r.localeCode === "*";
                return (
                  <li
                    key={r.id ?? i}
                    className="relative pl-12 pb-5 last:pb-0"
                  >
                    {/* timeline dot */}
                    <span
                      className={`absolute left-0 top-1 h-7 w-7 rounded-full ring-1 ${action.bg} ${action.text} ${action.ring} flex items-center justify-center`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {/* card */}
                    <div className="rounded-lg border border-border/60 bg-card p-3 hover:border-border transition-colors">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${action.bg} ${action.text} ring-1 ${action.ring}`}
                        >
                          {action.label}
                        </span>
                        {!isWildcard && (
                          <>
                            <LocaleBadge code={r.localeCode} size="xs" />
                            <span className="text-xs text-muted-foreground font-mono">
                              {findPreset(r.localeCode)?.name ?? r.localeCode}
                            </span>
                          </>
                        )}
                        {isWildcard && (
                          <span className="text-xs text-muted-foreground italic">
                            （整個 Key）
                          </span>
                        )}
                        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                          {formatTime(r.changedAt)}
                        </span>
                      </div>

                      {/* Value diff */}
                      {!isWildcard && (r.oldValue || r.newValue) && (
                        <div className="text-xs space-y-1">
                          {r.oldValue ? (
                            <div className="flex items-start gap-2">
                              <span className="text-muted-foreground/70 shrink-0 mt-0.5">
                                舊
                              </span>
                              <code className="bg-rose-500/10 text-rose-700 dark:text-rose-300 px-1.5 py-0.5 rounded line-through opacity-70 break-all">
                                {r.oldValue}
                              </code>
                            </div>
                          ) : null}
                          {r.newValue ? (
                            <div className="flex items-start gap-2">
                              <span className="text-muted-foreground/70 shrink-0 mt-0.5">
                                新
                              </span>
                              <code className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded break-all">
                                {r.newValue}
                              </code>
                            </div>
                          ) : (
                            <div className="text-muted-foreground italic">
                              （清空）
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 mt-2 text-[11px] text-muted-foreground">
                        <ArrowRight className="h-3 w-3" />
                        <span className="font-medium text-foreground/80">
                          {editor}
                        </span>
                        {r.versionId && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <span>版本 #{r.versionId}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
