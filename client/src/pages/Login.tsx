import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Globe, Lock, Mail } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const loginMutation = trpc.auth.localLogin.useMutation({
    onSuccess: () => {
      window.location.href = "/dashboard";
    },
    onError: (err) => {
      setErrorMsg(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    loginMutation.mutate({ email: email.trim(), password });
  };

  const appTitle = import.meta.env.VITE_APP_TITLE || "多語系翻譯管理系統";

  return (
    <div className="relative min-h-screen flex items-center justify-center aurora-bg overflow-hidden px-4">
      {/* Theme toggle (top-right) */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle align="end" />
      </div>
      {/* Decorative ambient blurs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full opacity-40 blur-3xl"
        style={{ background: "var(--gradient-primary)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full opacity-30 blur-3xl"
        style={{ background: "var(--gradient-accent)" }}
      />

      <div className="relative w-full max-w-sm animate-fade-in-up">
        {/* Brand mark */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div
            className="h-14 w-14 rounded-2xl flex items-center justify-center glow"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Globe className="h-7 w-7 text-white" strokeWidth={2.2} />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight">{appTitle}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              登入以管理你的翻譯專案
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="surface-glass rounded-2xl p-6 shadow-[var(--shadow-elevated)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70 pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-9 h-10"
                  placeholder="user@example.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                密碼
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70 pointer-events-none" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-9 h-10"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {errorMsg && (
              <p
                role="alert"
                className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2"
              >
                {errorMsg}
              </p>
            )}

            <Button
              type="submit"
              className="w-full h-10 font-medium"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? "登入中…" : "登入"}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          安全連線 · 由 Manus OAuth 保護
        </p>
      </div>
    </div>
  );
}
