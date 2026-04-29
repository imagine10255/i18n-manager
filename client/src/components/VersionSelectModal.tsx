import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface VersionSelectModalProps {
  isOpen: boolean;
  projectId?: number;
  existingVersions: Array<{ id: number; versionNumber: string }>;
  onConfirm: (versionNumber: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
  onVersionCreated?: () => void;
}

export default function VersionSelectModal({
  isOpen,
  projectId,
  existingVersions,
  onConfirm,
  onCancel,
  isLoading = false,
  onVersionCreated,
}: VersionSelectModalProps) {
  const [mode, setMode] = useState<"select" | "new">("select");
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [newVersionNumber, setNewVersionNumber] = useState("");
  const utils = trpc.useUtils();

  const createVersionMutation = trpc.translationVersion.create.useMutation({
    onSuccess: () => {
      toast.success("版本建立成功");
      if (projectId) {
        utils.translationVersion.listByProject.invalidate({ projectId });
      }
      onVersionCreated?.();
      setNewVersionNumber("");
    },
    onError: (error) => {
      toast.error(`版本建立失敗: ${error.message}`);
    },
  });

  const handleConfirm = async () => {
    if (mode === "select") {
      const selected = existingVersions.find(
        (v) => v.id.toString() === selectedVersionId
      );
      if (selected) {
        onConfirm(selected.versionNumber);
      }
    } else {
      if (newVersionNumber.trim() && projectId) {
        await createVersionMutation.mutateAsync({
          projectId,
          versionNumber: newVersionNumber.trim(),
          description: "",
        });
        onConfirm(newVersionNumber.trim());
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>選擇或建立版本號</DialogTitle>
          <DialogDescription>
            選擇現有版本號或建立新版本號來標識此次匯出
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 模式選擇 */}
          <div className="flex gap-4">
            <Button
              variant={mode === "select" ? "default" : "outline"}
              onClick={() => setMode("select")}
              className="flex-1"
            >
              選擇現有版本
            </Button>
            <Button
              variant={mode === "new" ? "default" : "outline"}
              onClick={() => setMode("new")}
              className="flex-1"
            >
              建立新版本
            </Button>
          </div>

          {/* 選擇現有版本 */}
          {mode === "select" && (
            <div className="space-y-2">
              <Label>版本號</Label>
              {existingVersions.length > 0 ? (
                <Select value={selectedVersionId} onValueChange={setSelectedVersionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="選擇版本..." />
                  </SelectTrigger>
                  <SelectContent>
                    {existingVersions.map((version) => (
                      <SelectItem key={version.id} value={version.id.toString()}>
                        {version.versionNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-sm text-muted-foreground p-2 border rounded bg-muted/50">
                  尚無現有版本，請建立新版本
                </div>
              )}
            </div>
          )}

          {/* 建立新版本 */}
          {mode === "new" && (
            <div className="space-y-2">
              <Label>版本號</Label>
              <Input
                placeholder="例如：v1.0.0 或 2024-04-29"
                value={newVersionNumber}
                onChange={(e) => setNewVersionNumber(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                版本號用於標識翻譯匯出的版本，建議使用語義化版本號（如 v1.0.0）或日期格式
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isLoading || createVersionMutation.isPending}>
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              isLoading ||
              createVersionMutation.isPending ||
              (mode === "select" && !selectedVersionId) ||
              (mode === "new" && !newVersionNumber.trim())
            }
          >
            確認
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
