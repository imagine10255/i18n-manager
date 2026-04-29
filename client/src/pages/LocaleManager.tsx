import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { Globe, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const PRESET_LOCALES = [
  { code: "zh-TW", name: "Traditional Chinese", nativeName: "繁體中文" },
  { code: "zh-CN", name: "Simplified Chinese", nativeName: "简体中文" },
  { code: "en", name: "English", nativeName: "English" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "es", name: "Spanish", nativeName: "Español" },
];

const FLAG_MAP: Record<string, string> = {
  "zh-TW": "🇹🇼", "zh-CN": "🇨🇳", "en": "🇺🇸", "ja": "🇯🇵",
  "ko": "🇰🇷", "fr": "🇫🇷", "de": "🇩🇪", "es": "🇪🇸",
};

export default function LocaleManager() {
  const { data: user } = trpc.auth.me.useQuery();
  const userRole = (user as { role?: string })?.role ?? "rd";
  const isAdmin = userRole === "admin";

  const { data: locales, isLoading, refetch } = trpc.locale.list.useQuery();
  const utils = trpc.useUtils();

  const createMutation = trpc.locale.create.useMutation({
    onSuccess: () => { toast.success("語系新增成功"); utils.locale.list.invalidate(); utils.locale.listActive.invalidate(); setShowAdd(false); resetForm(); },
    onError: (e) => toast.error(`新增失敗：${e.message}`),
  });

  const updateMutation = trpc.locale.update.useMutation({
    onSuccess: () => { toast.success("語系已更新"); utils.locale.list.invalidate(); utils.locale.listActive.invalidate(); },
    onError: (e) => toast.error(`更新失敗：${e.message}`),
  });

  const deleteMutation = trpc.locale.delete.useMutation({
    onSuccess: () => { toast.success("語系已刪除"); utils.locale.list.invalidate(); utils.locale.listActive.invalidate(); },
    onError: (e) => toast.error(`刪除失敗：${e.message}`),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", nativeName: "", sortOrder: 0 });

  const resetForm = () => setForm({ code: "", name: "", nativeName: "", sortOrder: 0 });

  const handlePreset = (preset: typeof PRESET_LOCALES[0]) => {
    setForm({ code: preset.code, name: preset.name, nativeName: preset.nativeName, sortOrder: 0 });
  };

  const handleSubmit = () => {
    if (!form.code || !form.name || !form.nativeName) {
      toast.error("請填寫所有必填欄位");
      return;
    }
    createMutation.mutate(form);
  };

  const existingCodes = new Set(locales?.map((l) => l.code) ?? []);

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">語系管理</h1>
            <p className="text-sm text-muted-foreground mt-1">管理系統支援的翻譯語系</p>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowAdd(true)} size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              新增語系
            </Button>
          )}
        </div>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              已設定語系
              <Badge variant="secondary" className="ml-1">{locales?.length ?? 0}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 bg-secondary/50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : locales && locales.length > 0 ? (
              <div className="space-y-2">
                {locales.map((locale) => (
                  <div
                    key={locale.id}
                    className="flex items-center gap-4 p-3 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors group"
                  >
                    <span className="text-2xl leading-none w-8 text-center">
                      {FLAG_MAP[locale.code] ?? "🌐"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{locale.nativeName}</span>
                        <span className="text-xs text-muted-foreground">{locale.name}</span>
                        <code className="text-xs font-mono bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
                          {locale.code}
                        </code>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isAdmin && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {locale.isActive ? "啟用" : "停用"}
                          </span>
                          <Switch
                            checked={locale.isActive}
                            onCheckedChange={(checked) =>
                              updateMutation.mutate({ id: locale.id, isActive: checked })
                            }
                          />
                        </div>
                      )}
                      {!isAdmin && (
                        <Badge variant={locale.isActive ? "default" : "secondary"} className="text-xs">
                          {locale.isActive ? "啟用" : "停用"}
                        </Badge>
                      )}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (confirm(`確定要刪除語系 ${locale.nativeName}（${locale.code}）嗎？`)) {
                              deleteMutation.mutate({ id: locale.id });
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Globe className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">尚未設定任何語系</p>
                {isAdmin && (
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowAdd(true)}>
                    <Plus className="h-4 w-4 mr-1" /> 新增第一個語系
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Locale Dialog */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>新增語系</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Presets */}
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">快速選擇</Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_LOCALES.filter((p) => !existingCodes.has(p.code)).map((preset) => (
                    <button
                      key={preset.code}
                      onClick={() => handlePreset(preset)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                        form.code === preset.code
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50 hover:bg-secondary"
                      }`}
                    >
                      <span>{FLAG_MAP[preset.code] ?? "🌐"}</span>
                      <span>{preset.nativeName}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="code" className="text-xs">語系代碼 *</Label>
                  <Input
                    id="code"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    placeholder="zh-TW"
                    className="mt-1 font-mono text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="sortOrder" className="text-xs">排序</Label>
                  <Input
                    id="sortOrder"
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm((f) => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="name" className="text-xs">英文名稱 *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Traditional Chinese"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="nativeName" className="text-xs">原生名稱 *</Label>
                <Input
                  id="nativeName"
                  value={form.nativeName}
                  onChange={(e) => setForm((f) => ({ ...f, nativeName: e.target.value }))}
                  placeholder="繁體中文"
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowAdd(false); resetForm(); }}>
                取消
              </Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                {createMutation.isPending ? "新增中..." : "新增語系"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
