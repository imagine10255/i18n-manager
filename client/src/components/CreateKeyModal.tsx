import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface CreateKeyModalProps {
  isOpen: boolean;
  onConfirm: (keyPath: string, description: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function CreateKeyModal({
  isOpen,
  onConfirm,
  onCancel,
  isLoading = false,
}: CreateKeyModalProps) {
  const [keyPath, setKeyPath] = useState("");
  const [description, setDescription] = useState("");

  const handleConfirm = () => {
    if (keyPath.trim()) {
      onConfirm(keyPath.trim(), description.trim());
      setKeyPath("");
      setDescription("");
    }
  };

  const handleCancel = () => {
    setKeyPath("");
    setDescription("");
    onCancel();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增翻譯 Key</DialogTitle>
          <DialogDescription>
            建立新的翻譯 Key，支援巢狀結構（例如：home.header.title）
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Key 路徑 */}
          <div className="space-y-2">
            <Label htmlFor="keyPath">Key 路徑 *</Label>
            <Input
              id="keyPath"
              placeholder="例如：home.header.title"
              value={keyPath}
              onChange={(e) => setKeyPath(e.target.value)}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              使用點號（.）分隔層級，例如：module.section.item
            </p>
          </div>

          {/* 描述 */}
          <div className="space-y-2">
            <Label htmlFor="description">描述（可選）</Label>
            <Textarea
              id="description"
              placeholder="描述這個 Key 的用途..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || !keyPath.trim()}
          >
            建立
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
