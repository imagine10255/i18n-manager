import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  BookOpen,
  CheckCircle2,
  Globe,
  Languages,
  Sparkles,
  TrendingUp,
} from "lucide-react";

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
  return "bg-rose-400";
}

function getStatusPill(pct: number) {
  if (pct >= 90)
    return (
      <span className="status-complete inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium">
        完整
      </span>
    );
  if (pct >= 60)
    return (
      <span className="status-progress inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium">
        進行中
      </span>
    );
  if (pct >= 30)
    return (
      <span className="status-partial inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium">
        部分
      </span>
    );
  return (
    <span className="status-pending inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium">
      待翻譯
    </span>
  );
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
      <div className="w-full space-y-8">
        {/* Page title */}
        <div className="animate-fade-in-up">
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            Translation overview
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="gradient-text">儀表板</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            翻譯進度總覽與語系完成度分析
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            tone="violet"
            icon={<BookOpen className="h-4 w-4" />}
            label="翻譯 Key 總數"
            value={keysLoading ? null : totalKeys.toString()}
            sub="個條目"
            delayClass="stagger-1"
          />
          <SummaryCard
            tone="blue"
            icon={<Globe className="h-4 w-4" />}
            label="啟用語系"
            value={localesLoading ? null : totalLocales.toString()}
            sub="種語言"
            delayClass="stagger-2"
          />
          <SummaryCard
            tone="emerald"
            icon={<TrendingUp className="h-4 w-4" />}
            label="整體完成度"
            value={statsLoading ? null : `${overallPct}%`}
            sub={`${overallTranslated} / ${overallTotal}`}
            delayClass="stagger-3"
          />
          <SummaryCard
            tone="amber"
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="完整語系"
            value={statsLoading ? null : fullyTranslated.toString()}
            sub={`/ ${totalLocales} 種語系`}
            delayClass="stagger-4"
          />
        </div>

        {/* Overall progress — hero card with gradient */}
        <Card className="relative overflow-hidden border-border/60 hover-lift animate-fade-in-up">
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.07] pointer-events-none"
            style={{ background: "var(--gradient-primary)" }}
          />
          <CardHeader className="pb-3 relative">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <span
                className="h-7 w-7 rounded-lg flex items-center justify-center text-white shrink-0"
                style={{ background: "var(--gradient-primary)" }}
              >
                <Languages className="h-3.5 w-3.5" />
              </span>
              整體翻譯進度
            </CardTitle>
          </CardHeader>
          <CardContent className="relative">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-sm text-muted-foreground">所有語系合計</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold tabular-nums tracking-tight gradient-text">
                      {overallPct}%
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {overallTranslated} / {overallTotal}
                    </span>
                  </div>
                </div>
                <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${overallPct}%`,
                      background: "var(--gradient-primary)",
                    }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Per-locale breakdown */}
        <Card className="border-border/60 hover-lift animate-fade-in-up">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center justify-between">
              <span>各語系翻譯進度</span>
              {!localesLoading && locales && (
                <span className="text-xs font-normal text-muted-foreground tabular-nums">
                  {locales.length} 個語系
                </span>
              )}
            </CardTitle>
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
                    <div
                      key={locale.code}
                      className="space-y-2 group/locale"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-lg leading-none shrink-0">
                            {meta?.flag ?? "🌐"}
                          </span>
                          <div className="min-w-0">
                            <span className="text-sm font-medium">{locale.nativeName}</span>
                            <span className="text-xs text-muted-foreground ml-2 font-mono">
                              {locale.code}
                            </span>
                          </div>
                          {getStatusPill(pct)}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-semibold tabular-nums">{pct}%</span>
                          <span className="text-xs text-muted-foreground ml-2 tabular-nums">
                            {translated}/{total}
                          </span>
                        </div>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ease-out ${getProgressColor(pct)}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <div className="h-12 w-12 mx-auto mb-3 rounded-2xl bg-muted flex items-center justify-center">
                  <Globe className="h-6 w-6 opacity-50" />
                </div>
                <p className="text-sm font-medium">尚未設定任何語系</p>
                <p className="text-xs mt-1">請前往語系管理頁面新增語系</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

const TONE_STYLES: Record<string, { bg: string; text: string; ring: string }> = {
  violet: {
    bg: "bg-violet-500/10 dark:bg-violet-500/15",
    text: "text-violet-600 dark:text-violet-300",
    ring: "ring-violet-500/20",
  },
  blue: {
    bg: "bg-blue-500/10 dark:bg-blue-500/15",
    text: "text-blue-600 dark:text-blue-300",
    ring: "ring-blue-500/20",
  },
  emerald: {
    bg: "bg-emerald-500/10 dark:bg-emerald-500/15",
    text: "text-emerald-600 dark:text-emerald-300",
    ring: "ring-emerald-500/20",
  },
  amber: {
    bg: "bg-amber-500/10 dark:bg-amber-500/15",
    text: "text-amber-600 dark:text-amber-300",
    ring: "ring-amber-500/20",
  },
};

function SummaryCard({
  icon,
  label,
  value,
  sub,
  tone = "violet",
  delayClass = "",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  sub: string;
  tone?: keyof typeof TONE_STYLES;
  delayClass?: string;
}) {
  const t = TONE_STYLES[tone] ?? TONE_STYLES.violet;
  return (
    <Card
      className={`border-border/60 hover-lift animate-fade-in-up ${delayClass}`}
    >
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              {label}
            </p>
            {value === null ? (
              <Skeleton className="h-8 w-20 mt-2" />
            ) : (
              <p className="text-3xl font-bold tracking-tight mt-1.5 tabular-nums">
                {value}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">{sub}</p>
          </div>
          <div
            className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${t.bg} ${t.text} ring-1 ${t.ring}`}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
