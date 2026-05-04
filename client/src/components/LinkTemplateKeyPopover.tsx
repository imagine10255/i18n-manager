/**
 * LinkSharedKeyPopover — 行內「引用共用 key」選擇器，靈感來自 Apifox 的 $ref。
 *
 * 在翻譯編輯器的 leaf row 旁顯示一個小圖示，點下去會跳出可搜尋的清單，
 * 讓使用者直接挑一條共用 key 把這列「引用」上去。引用後 row 上會顯示
 * 「共用」徽章，且編輯值會同步到共用字典。
 */

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Link2, Search, Library, KeyRound } from "lucide-react";
import { toast } from "sonner";

export interface LinkSharedKeyPopoverProps {
  /** 此 row 對應的專案 translation key id。 */
  projectKeyId: number;
  /** 目前 row 上的 keyPath，用來在 popover 顯示「為 xxx 引用」 */
  keyPath: string;
  /** 已連結的 sharedKeyId，未引用則為 null。控制 icon 的填色。 */
  linkedSharedKeyId?: number | null;
  /** 引用 / 解除成功後給 caller refetch / 顯示 toast。 */
  onLinked?: () => void;
}

export default function LinkSharedKeyPopover({
  projectKeyId,
  keyPath,
  linkedSharedKeyId,
  onLinked,
}: LinkSharedKeyPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();

  // 一次抓全部共用 keys（flat 格式）。資料量小，popover 開啟時 lazy-fetch。
  const { data: flatList } = trpc.sharedKey.listAllFlat.useQuery(undefined, {
    enabled: open,
  });

  const filtered = useMemo(() => {
    const list = flatList ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r: any) =>
        r.keyPath.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q)
    );
  }, [flatList, search]);

  const linkMutation = trpc.sharedKey.linkProjectKey.useMutation({
    onSuccess: () => {
      toast.success("已引用共用 key");
      utils.translationKey.listWithTranslations.invalidate();
      utils.translationKey.listByProject.invalidate();
      setOpen(false);
      onLinked?.();
    },
    onError: (e) => toast.error(`引用失敗：${e.message}`),
  });

  const unlinkMutation = trpc.sharedKey.unlinkProjectKey.useMutation({
    onSuccess: () => {
      toast.success("已解除引用，保留當前值");
      utils.translationKey.listWithTranslations.invalidate();
      utils.translationKey.listByProject.invalidate();
      setOpen(false);
      onLinked?.();
    },
    onError: (e) => toast.error(`解除失敗：${e.message}`),
  });

  const isLinked = linkedSharedKeyId != null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`shrink-0 inline-flex items-center justify-center h-5 w-5 rounded transition-colors ${
            isLinked
              ? "text-primary hover:bg-primary/10"
              : "text-muted-foreground/50 hover:text-foreground hover:bg-muted"
          }`}
          title={isLinked ? "已引用共用 key，點擊變更或解除" : "引用共用字典中的 key"}
          aria-label="引用共用 key"
        >
          <Link2 className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[360px] p-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b text-xs">
          <div className="flex items-center gap-1.5 mb-1.5 text-muted-foreground">
            <Library className="h-3.5 w-3.5" />
            為 <code className="text-foreground">{keyPath}</code> 引用共用 key
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋 key…"
              autoFocus
              className="pl-6 h-7 text-xs"
            />
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground p-4 text-center">
              {(flatList ?? []).length === 0
                ? "目前還沒有任何共用 key 可引用"
                : "沒有符合的 key"}
            </p>
          ) : (
            filtered.map((r: any) => {
              const selected = linkedSharedKeyId === r.keyId;
              return (
                <button
                  key={r.keyId}
                  type="button"
                  disabled={linkMutation.isPending}
                  onClick={() => {
                    linkMutation.mutate({
                      projectKeyId,
                      sharedKeyId: r.keyId,
                    });
                  }}
                  className={`w-full text-left px-3 py-2 text-xs border-b last:border-b-0 hover:bg-muted/50 transition-colors flex items-start gap-2 ${
                    selected ? "bg-primary/5" : ""
                  }`}
                >
                  <KeyRound className="h-3 w-3 mt-0.5 opacity-50 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <code className="truncate">{r.keyPath}</code>
                    </div>
                    {r.description && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {r.description}
                      </p>
                    )}
                  </div>
                  {selected && (
                    <span className="text-[10px] text-primary shrink-0">
                      已引用
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {isLinked && (
          <div className="border-t px-3 py-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive"
              disabled={unlinkMutation.isPending}
              onClick={() => unlinkMutation.mutate({ projectKeyId })}
            >
              解除引用
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
