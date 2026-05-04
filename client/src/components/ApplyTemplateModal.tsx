/**
 * ApplySharedKeysModal — 把共用字典池中挑選的 keys「插入」到目前的專案。
 *
 * 兩種模式（對應使用者問卷的「混合」需求）：
 *   • reference  ─ 引用同步：專案 key 透過 sharedKeyId 連結 shared key。
 *                  以後改 shared，所有引用方一起改 (Apifox $ref 風格)。
 *   • copy       ─ 一次性複製：把 shared 當前值塞進專案 translations，
 *                  之後專案獨立維護，不再跟 shared 同步。
 */

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Library, KeyRound, Search } from "lucide-react";

export interface ApplySharedKeysModalProps {
  open: boolean;
  projectId: number | null;
  onClose: () => void;
  onSubmit: (input: {
    mode: "reference" | "copy";
    sharedKeyIds?: number[];
  }) => void;
  pending?: boolean;
}

export default function ApplySharedKeysModal({
  open,
  projectId,
  onClose,
  onSubmit,
  pending,
}: ApplySharedKeysModalProps) {
  const { data: keys } = trpc.sharedKey.list.useQuery(undefined, {
    enabled: open,
  });
  const [mode, setMode] = useState<"reference" | "copy">("reference");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Reset state every time the dialog opens
  useEffect(() => {
    if (open) {
      setMode("reference");
      setSearch("");
      setSelectedIds(new Set());
    }
  }, [open]);

  // Default to "select all" once keys arrive
  useEffect(() => {
    if (keys) {
      setSelectedIds(new Set((keys as any[]).map((k) => k.id as number)));
    }
  }, [keys]);

  const filteredKeys = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (keys ?? []) as any[];
    if (!q) return list;
    return list.filter(
      (k) =>
        k.keyPath.toLowerCase().includes(q) ||
        (k.description ?? "").toLowerCase().includes(q)
    );
  }, [keys, search]);

  const allFilteredSelected =
    filteredKeys.length > 0 &&
    filteredKeys.every((k) => selectedIds.has(k.id as number));

  function toggleAllFiltered(check: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const k of filteredKeys) {
        const id = k.id as number;
        if (check) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function toggleOne(id: number, check: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (check) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-4 w-4" /> 從共用字典插入
          </DialogTitle>
          <DialogDescription>
            從共用字典池挑選要套用到此專案的 keys，並決定要採用「同步引用」還是「一次性複製」。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode picker */}
          <div className="grid grid-cols-[100px_1fr] items-start gap-3">
            <Label className="pt-1">套用模式</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as "reference" | "copy")}
              className="space-y-2"
            >
              <label className="flex items-start gap-2 cursor-pointer">
                <RadioGroupItem value="reference" id="m-ref" className="mt-0.5" />
                <div>
                  <div className="text-sm font-medium">引用同步（推薦）</div>
                  <div className="text-xs text-muted-foreground">
                    建立專案 key 並指向共用字典。改共用字典會即時反映到此專案。
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <RadioGroupItem value="copy" id="m-copy" className="mt-0.5" />
                <div>
                  <div className="text-sm font-medium">一次性複製</div>
                  <div className="text-xs text-muted-foreground">
                    把共用字典現在的值複製到專案，之後互不影響。
                  </div>
                </div>
              </label>
            </RadioGroup>
          </div>

          {/* Keys multi-select */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="m-0">挑選要套用的 Keys</Label>
              <Badge variant="secondary" className="text-[10px]">
                已選 {selectedIds.size}
              </Badge>
              <div className="flex-1" />
              <div className="relative w-48">
                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="搜尋…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-7 h-7 text-xs"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto border rounded-md">
              <div className="px-2 py-1.5 border-b bg-muted/30 flex items-center gap-2">
                <Checkbox
                  checked={allFilteredSelected}
                  onCheckedChange={(v) => toggleAllFiltered(v === true)}
                />
                <span className="text-xs">
                  全選（{filteredKeys.length} 筆）
                </span>
              </div>
              {filteredKeys.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3">
                  共用字典目前沒有可選 keys
                </p>
              ) : (
                filteredKeys.map((k: any) => (
                  <label
                    key={k.id}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/40 cursor-pointer text-sm border-b last:border-b-0"
                  >
                    <Checkbox
                      checked={selectedIds.has(k.id)}
                      onCheckedChange={(v) =>
                        toggleOne(k.id, v === true)
                      }
                    />
                    <KeyRound className="h-3 w-3 opacity-50" />
                    <code className="text-xs">{k.keyPath}</code>
                    {k.description && (
                      <span className="text-[11px] text-muted-foreground truncate ml-2">
                        — {k.description}
                      </span>
                    )}
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={!projectId || selectedIds.size === 0 || pending}
            onClick={() => {
              if (!projectId) return;
              onSubmit({
                mode,
                sharedKeyIds: Array.from(selectedIds),
              });
            }}
          >
            套用
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
