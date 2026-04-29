import { useEffect, useState } from "react";
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
import { CornerDownRight } from "lucide-react";

interface CreateKeyModalProps {
  isOpen: boolean;
  /**
   * Optional parent path. When provided the user only types the leaf segment
   * (Apifox-style sibling/child insertion). The full path passed to onConfirm
   * is `${parentPath}.${leaf}`.
   */
  parentPath?: string;
  /** Optional human-readable hint about what's being inserted (sibling vs child). */
  insertMode?: "sibling" | "child" | "root";
  onConfirm: (keyPath: string, description: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function CreateKeyModal({
  isOpen,
  parentPath,
  insertMode = "root",
  onConfirm,
  onCancel,
  isLoading = false,
}: CreateKeyModalProps) {
  // When inserting at root, user types the full path. When inserting under a
  // parent, user only types the leaf segment.
  const [leaf, setLeaf] = useState("");
  const [fullPath, setFullPath] = useState("");
  const [description, setDescription] = useState("");

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setLeaf("");
      setFullPath("");
      setDescription("");
    }
  }, [isOpen]);

  const usingParent = !!parentPath;
  const finalPath = usingParent
    ? `${parentPath}.${leaf.trim()}`.replace(/\.+$/g, "")
    : fullPath.trim();
  const canSubmit = usingParent ? !!leaf.trim() : !!fullPath.trim();

  const handleConfirm = () => {
    if (!canSubmit) return;
    onConfirm(finalPath, description.trim());
  };

  const handleCancel = () => {
    onCancel();
  };

  const titleText =
    insertMode === "child"
      ? "新增子層 Key"
      : insertMode === "sibling"
        ? "新增同層 Key"
        : "新增翻譯 Key";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titleText}</DialogTitle>
          <DialogDescription>
            {usingParent
              ? "輸入葉節點名稱即可，完整路徑會自動組合"
              : "支援巢狀結構，使用點號（.）分隔層級，例如：home.header.title"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Key path field — split when parent is provided */}
          {usingParent ? (
            <div className="space-y-2">
              <Label htmlFor="keyLeaf" className="flex items-center gap-1.5">
                <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                {insertMode === "child" ? "子層" : "同層"} Key 名稱 *
              </Label>
              <div className="flex items-stretch rounded-md border border-input overflow-hidden focus-within:ring-2 focus-within:ring-primary/25 focus-within:border-primary transition-colors">
                <span
                  className="flex items-center gap-1 px-2.5 py-2 bg-muted text-xs font-mono text-muted-foreground border-r border-input max-w-[60%] truncate"
                  title={parentPath}
                >
                  {parentPath}
                  <span className="text-muted-foreground/60">.</span>
                </span>
                <Input
                  id="keyLeaf"
                  placeholder="leafName"
                  value={leaf}
                  onChange={(e) => setLeaf(e.target.value)}
                  disabled={isLoading}
                  className="border-0 rounded-none focus-visible:ring-0 focus-visible:border-0 font-mono"
                  autoFocus
                />
              </div>
              {leaf.trim() && (
                <p className="text-xs text-muted-foreground">
                  完整路徑：
                  <code className="font-mono bg-muted px-1.5 py-0.5 rounded">
                    {finalPath}
                  </code>
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="keyPath">Key 路徑 *</Label>
              <Input
                id="keyPath"
                placeholder="例如：home.header.title"
                value={fullPath}
                onChange={(e) => setFullPath(e.target.value)}
                disabled={isLoading}
                className="font-mono"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                使用點號（.）分隔層級，例如：module.section.item
              </p>
            </div>
          )}

          {/* Description */}
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
            disabled={isLoading || !canSubmit}
          >
            {isLoading ? "建立中…" : "建立"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
