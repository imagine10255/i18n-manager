import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  BookOpen,
  ChevronDown,
  Clock,
  Globe,
  Key,
  LayoutDashboard,
  Library,
  LogOut,
  PanelLeft,
  Users,
} from "lucide-react";
import { CSSProperties, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { ThemeToggle } from "./ThemeToggle";
import ChangePasswordDialog from "./ChangePasswordDialog";

// ThemeToggle is rendered in the sticky page header (and the mobile header
// fallback) so users always have access to it. We previously also rendered it
// in the sidebar footer — that was redundant and has been removed.

type MenuItem = {
  icon: React.ElementType;
  label: string;
  path: string;
  roles?: string[];
};

const menuGroups: { label: string; items: MenuItem[] }[] = [
  {
    label: "Overview",
    items: [
      { icon: LayoutDashboard, label: "儀表板", path: "/dashboard" },
    ],
  },
  {
    label: "Translation",
    items: [
      { icon: BookOpen, label: "翻譯編輯器", path: "/editor" },
      { icon: Library, label: "公版字典", path: "/shared-keys" },
      { icon: Clock, label: "修改歷程", path: "/history" },
    ],
  },
  {
    label: "Administration",
    items: [
      { icon: Globe, label: "語系管理", path: "/locales", roles: ["admin"] },
      { icon: Users, label: "使用者管理", path: "/users", roles: ["admin"] },
    ],
  },
];

/** Sidebar width — fixed (was draggable, removed per UX request). */
const SIDEBAR_WIDTH = 200;

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  editor: "Editor",
  rd: "RD",
  qa: "QA",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "role-admin",
  editor: "role-editor",
  rd: "role-rd",
  qa: "role-qa",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="relative flex items-center justify-center min-h-screen aurora-bg overflow-hidden px-4">
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
        <div className="relative flex flex-col items-center gap-8 p-10 max-w-sm w-full animate-fade-in-up">
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-2 glow"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Globe className="w-7 h-7 text-white" strokeWidth={2.2} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              多語系翻譯管理系統
            </h1>
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              請登入以存取翻譯管理後台
            </p>
          </div>
          <Button
            onClick={() => { window.location.href = getLoginUrl(); }}
            size="lg"
            className="w-full"
          >
            登入系統
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${SIDEBAR_WIDTH}px` } as CSSProperties}
    >
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const isMobile = useIsMobile();
  const userRole = (user as { role?: string })?.role ?? "rd";
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);

  const visibleGroups = menuGroups.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.roles || item.roles.includes(userRole)
    ),
  })).filter((group) => group.items.length > 0);

  const activeItem = menuGroups
    .flatMap((g) => g.items)
    .find((item) => item.path === location);

  return (
    <>
      <div className="relative">
        <Sidebar collapsible="icon" className="border-r-0">
          {/* Header */}
          <SidebarHeader className="h-16 justify-center border-b border-sidebar-border/50">
            <div
              className={`flex items-center gap-3 ${isCollapsed ? "justify-center px-0" : "px-2"}`}
            >
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors focus:outline-none shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-sidebar-foreground/60" />
              </button>
              {!isCollapsed && (
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(124,58,237,0.35)]"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    <Globe className="w-4 h-4 text-white" strokeWidth={2.4} />
                  </div>
                  <span className="font-semibold text-sm text-sidebar-foreground truncate tracking-tight">
                    i18n Manager
                  </span>
                </div>
              )}
            </div>
          </SidebarHeader>

          {/* Navigation */}
          <SidebarContent className="gap-0 py-2">
            {visibleGroups.map((group) => (
              <SidebarGroup key={group.label} className="px-2 py-1">
                {!isCollapsed && (
                  <SidebarGroupLabel className="text-sidebar-foreground/40 text-xs font-medium uppercase tracking-widest px-2 mb-1">
                    {group.label}
                  </SidebarGroupLabel>
                )}
                <SidebarMenu>
                  {group.items.map((item) => {
                    const isActive = location === item.path;
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => setLocation(item.path)}
                          tooltip={item.label}
                          className={`group/menu relative h-9 rounded-lg transition-all font-normal text-sm ${
                            isActive
                              ? "bg-sidebar-primary/15 text-sidebar-primary font-medium"
                              : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                          }`}
                        >
                          {/* Active accent bar */}
                          {isActive && !isCollapsed && (
                            <span
                              aria-hidden
                              className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full"
                              style={{ background: "var(--gradient-primary)" }}
                            />
                          )}
                          <item.icon className={`h-4 w-4 shrink-0 transition-colors ${isActive ? "text-sidebar-primary" : "group-hover/menu:text-sidebar-foreground"}`} />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </SidebarContent>

          {/* Footer */}
          <SidebarFooter className="p-3 border-t border-sidebar-border/50 gap-2">
            {!isCollapsed && (
              <>
                {/* Keyboard shortcuts cheat-sheet — visible only when expanded */}
                <div className="rounded-md border border-sidebar-border/40 bg-sidebar-accent/30 px-2 py-1.5 space-y-0.5 mb-1">
                  <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 font-medium px-0.5 mb-1">
                    快捷鍵
                  </div>
                  <ShortcutRow combo="S" label="保存變更" />
                  <ShortcutRow combo="A" label="全部展開" />
                  <ShortcutRow combo="Z" label="全部收起" />
                </div>
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 font-medium">
                    外觀
                  </span>
                  <ThemeToggle align="end" side="top" surface="sidebar" />
                </div>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`flex items-center gap-3 rounded-xl py-2 hover:bg-sidebar-accent transition-colors w-full text-left focus:outline-none group ${
                    isCollapsed ? "justify-center px-0" : "px-2"
                  }`}
                >
                  <Avatar className="h-8 w-8 shrink-0 ring-1 ring-sidebar-border">
                    <AvatarFallback className="text-xs font-semibold bg-sidebar-primary/20 text-sidebar-primary">
                      {user?.name?.charAt(0).toUpperCase() ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-sidebar-foreground truncate leading-none">
                        {user?.name ?? "User"}
                      </p>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium mt-1 ${ROLE_COLORS[userRole] ?? "role-rd"}`}>
                        {ROLE_LABELS[userRole] ?? userRole}
                      </span>
                    </div>
                  )}
                  {!isCollapsed && (
                    <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/40 shrink-0" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52" side="top">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium">{user?.name ?? "User"}</p>
                  <p className="text-xs text-muted-foreground">{user?.email ?? ""}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowPasswordDialog(true)}
                  className="cursor-pointer"
                >
                  <Key className="mr-2 h-4 w-4" />
                  <span>變更密碼</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>登出</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
      </div>

      <SidebarInset>
        {/* Mobile header — keeps the sidebar toggle accessible on small screens */}
        {isMobile && (
          <div className="flex border-b border-border/60 h-14 items-center justify-between surface-glass px-4 sticky top-0 z-40">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-8 w-8 rounded-lg" />
              <span className="font-medium text-sm">{activeItem?.label ?? "i18n Manager"}</span>
            </div>
          </div>
        )}
        {/* Desktop has no page header — saves vertical space; the active item is already
            highlighted in the sidebar nav. Theme toggle lives in the sidebar footer. */}

        <main className="flex-1 p-6 bg-background min-h-screen">{children}</main>
      </SidebarInset>

      {/* Self-service password change — accessible from the user dropdown */}
      <ChangePasswordDialog
        open={showPasswordDialog}
        hasExistingPassword={!!(user as any)?.passwordHash}
        onClose={() => setShowPasswordDialog(false)}
      />
    </>
  );
}

/**
 * Single keyboard shortcut row in the sidebar cheat-sheet.
 * Renders a compact "label   ⌘+combo" line, with platform-aware modifier:
 *   - Mac → ⌘
 *   - Windows / Linux → Ctrl
 */
function ShortcutRow({ combo, label }: { combo: string; label: string }) {
  const isMac =
    typeof navigator !== "undefined" &&
    /mac/i.test(navigator.platform || navigator.userAgent || "");
  const modKey = isMac ? "⌘" : "Ctrl";
  return (
    <div className="flex items-center justify-between gap-2 text-[11px] leading-tight">
      <span className="text-sidebar-foreground/70 truncate">{label}</span>
      <kbd className="font-mono px-1.5 py-0.5 rounded bg-sidebar-accent/60 text-sidebar-foreground/90 text-[10px] border border-sidebar-border/60 shrink-0">
        {modKey}
        <span className="opacity-60 mx-0.5">+</span>
        {combo}
      </kbd>
    </div>
  );
}
