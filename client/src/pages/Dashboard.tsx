import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { BookOpen, CheckCircle2, Globe, Languages, TrendingUp } from "lucide-react";

const LOCALE_NAMES: Record<string, { name: string; native: string; flag: string }> = {
  "zh-TW": { name: "繁體中文", native: "繁體中文", flag: "🇹🇼" },
  "zh-CN": { name: "簡體中文", native: "简体中文", flag: "🇨🇳" },
  "en": { name: "English", native: "English", flag: "🇺🇸" },
  "ja": { name: "日本語", native: "日本語", flag: "🇯🇵" },
  "ko": { name: "한국어", native: "한국어", flag: "🇰🇷" },
};

function getProgressColor(pct: number) {
  if (pct >= 90) return "bg-emerald-500";
  if (pct >= 60) return "bg-blue-500";
  if (pct >= 30) return "bg-amber-500";
  return "bg-red-400";
}

function getStatusBadge(pct: number) {
  if (pct >= 90) return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">完整</Badge>;
  if (pct >= 60) return <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">進行中</Badge>;
  if (pct >= 30) return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">部分</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">待翻譯</Badge>;
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = trpc.stats.getProjectStats.useQuery({ projectId: 1 });
  const { data: locales, isLoading: localesLoading } = trpc.locale.listActive.useQuery();
  const { data: keysData, isLoading: keysLoading } = trpc.translationKey.list.useQuery({ projectId: 1 });

  const totalKeys = keysData?.length ?? 0;
  const totalLocales = locales?.length ?? 0;

  const statsArray = stats ? Object.entries(stats).map(([code, data]: any) => ({ localeCode: code, ...data })) : [];
  const statsMap = new Map(statsArray.map((s: any) => [s.localeCode, s]));

  const overallTranslated = statsArray.reduce((sum: number, s: any) => sum + (s.translated ?? 0), 0);
  const overallTotal = totalKeys * totalLocales;
  const overallPct = overallTotal > 0 ? Math.round((overallTranslated / overallTotal) * 100) : 0;

  const fullyTranslated = statsArray.filter((s: any) => s.total > 0 && s.translated >= s.total).length;

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Page title */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">儀表板</h1>
          <p className="text-sm text-muted-foreground mt-1">翻譯進度總覽與語系完成度分析</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            icon={<BookOpen className="h-4 w-4 text-primary" />}
            label="翻譯 Key 總數"
            value={keysLoading ? null : totalKeys.toString()}
            sub="個條目"
          />
          <SummaryCard
            icon={<Globe className="h-4 w-4 text-blue-500" />}
            label="啟用語系"
            value={localesLoading ? null : totalLocales.toString()}
            sub="種語言"
          />
          <SummaryCard
            icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
            label="整體完成度"
            value={statsLoading ? null : `${overallPct}%`}
            sub={`${overallTranslated} / ${overallTotal}`}
          />
          <SummaryCard
            icon={<CheckCircle2 className="h-4 w-4 text-amber-500" />}
            label="完整語系"
            value={statsLoading ? null : fullyTranslated.toString()}
            sub={`/ ${totalLocales} 種語系`}
          />
        </div>

        {/* Overall progress */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Languages className="h-4 w-4 text-primary" />
              整體翻譯進度
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">所有語系合計</span>
                  <span className="font-semibold tabular-nums">{overallPct}%</span>
                </div>
                <div className="h-3 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${getProgressColor(overallPct)}`}
                    style={{ width: `${overallPct}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Per-locale breakdown */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">各語系翻譯進度</CardTitle>
          </CardHeader>
          <CardContent>
            {localesLoading || statsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-2 w-full" />
                  </div>
                ))}
              </div>
            ) : locales && locales.length > 0 ? (
              <div className="space-y-5">
                {locales.map((locale: any) => {
                  const stat = statsMap.get(locale.code) ?? { total: 0, translated: 0 };
                  const translated = (stat as any).translated ?? 0;
                  const total = totalKeys;
                  const pct = total > 0 ? Math.round((translated / total) * 100) : 0;
                  const meta = LOCALE_NAMES[locale.code];

                  return (
                    <div key={locale.code} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="text-lg leading-none">{meta?.flag ?? "🌐"}</span>
                          <div>
                            <span className="text-sm font-medium">{locale.nativeName}</span>
                            <span className="text-xs text-muted-foreground ml-2 font-mono">{locale.code}</span>
                          </div>
                          {getStatusBadge(pct)}
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-semibold tabular-nums">{pct}%</span>
                          <span className="text-xs text-muted-foreground ml-2 tabular-nums">
                            {translated}/{total}
                          </span>
                        </div>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${getProgressColor(pct)}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Globe className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">尚未設定任何語系</p>
                <p className="text-xs mt-1">請前往語系管理頁面新增語系</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  sub: string;
}) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            {value === null ? (
              <Skeleton className="h-7 w-16 mt-1.5" />
            ) : (
              <p className="text-2xl font-bold tracking-tight mt-1 tabular-nums">{value}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
