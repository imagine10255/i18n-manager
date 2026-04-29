import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Key, Loader2 } from "lucide-react";

interface ChangePasswordDialogProps {
  open: boolean;
  /** Whether the user already has a password set; if not, current is optional. */
  hasExistingPassword?: boolean;
  onClose: () => void;
}

export default function ChangePasswordDialog({
  open,
  hasExistingPassword = true,
  onClose,
}: ChangePasswordDialogProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [open]);

  const mutation = trpc.user.changeOwnPassword.useMutation({
    onSuccess: () => {
      toast.success("密碼已更新");
      onClose();
    },
    onError: (e: any) => toast.error(`更新失敗：${e.message}`),
  });

  const mismatch = !!confirmPassword && confirmPassword !== newPassword;
  const tooShort = !!newPassword && newPassword.length < 6;
  const canSubmit =
    !!newPassword &&
    !mismatch &&
    !tooShort &&
    (!hasExistingPassword || !!currentPassword);

  const handleSubmit = () => {
    if (!canSubmit) return;
    mutation.mutate({
      currentPassword,
      newPassword,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" />
            變更密碼
          </DialogTitle>
          <DialogDescription>
            {hasExistingPassword
              ? "輸入目前的密碼後設定新密碼。"
              : "首次設定密碼。設定後即可用 email + 密碼登入。"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {hasExistingPassword && (
            <div>
              <Label htmlFor="current-password" className="text-xs">
                目前密碼 *
              </Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="目前的密碼"
                className="mt-1 font-mono"
                autoFocus
              />
            </div>
          )}
          <div>
            <Label htmlFor="new-password" className="text-xs">
              新密碼 *<span className="text-muted-foreground/70 ml-1">至少 6 個字</span>
            </Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="新密碼"
              className={`mt-1 font-mono ${tooShort ? "border-destructive focus-visible:ring-destructive/30" : ""}`}
              autoFocus={!hasExistingPassword}
            />
            {tooShort && (
              <p className="text-xs text-destructive mt-1">
                密碼至少 6 個字
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="confirm-password" className="text-xs">
              再次輸入新密碼 *
            </Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次輸入新密碼"
              className={`mt-1 font-mono ${mismatch ? "border-destructive focus-visible:ring-destructive/30" : ""}`}
            />
            {mismatch && (
              <p className="text-xs text-destructive mt-1">
                兩次輸入的密碼不一致
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || mutation.isPending}
            className="gap-2"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                儲存中…
              </>
            ) : (
              "儲存新密碼"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
