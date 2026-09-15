import { useEffect, useState, useCallback } from "react";
import { Outlet, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useBrand } from "@/context/BrandContext";
import { API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  LayoutDashboard, Users, Palette, Package, Dumbbell, UtensilsCrossed,
  ClipboardList, TrendingUp, MessageCircle, Home, Bell, LogOut, Loader2,
} from "lucide-react";

const ADMIN_NAV = [
  { to: "/app/admin", label: "Dashboard", icon: LayoutDashboard, testid: "nav-admin-dashboard" },
  { to: "/app/users", label: "Pengguna", icon: Users, testid: "nav-admin-users" },
  { to: "/app/appearance", label: "Appearance", icon: Palette, testid: "nav-admin-appearance" },
  { to: "/app/packages", label: "Paket & Bayar", icon: Package, testid: "nav-admin-packages" },
];

const COACH_NAV = [
  { to: "/app/coach", label: "Klien Saya", icon: Users, testid: "nav-coach-clients" },
];

const CLIENT_NAV = [
  { to: "/app/today", label: "Hari Ini", icon: Home, testid: "client-bottom-nav-hari-ini" },
  { to: "/app/program", label: "Program", icon: UtensilsCrossed, testid: "client-bottom-nav-program" },
  { to: "/app/log", label: "Catat", icon: ClipboardList, testid: "client-bottom-nav-catat" },
  { to: "/app/progress", label: "Progres", icon: TrendingUp, testid: "client-bottom-nav-progres" },
  { to: "/app/chat", label: "Coach", icon: MessageCircle, testid: "client-bottom-nav-coach" },
];

function NotificationBell() {
  const [notifs, setNotifs] = useState([]);
  const navigate = useNavigate();
  const load = useCallback(async () => {
    try {
      const { data } = await API.get("/notifications");
      setNotifs(data);
    } catch {}
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);
  const unread = notifs.filter((n) => !n.read).length;
  return (
    <Popover onOpenChange={(open) => open && API.post("/notifications/read-all").then(load)}>
      <PopoverTrigger asChild>
        <button data-testid="notification-bell" className="relative p-2 rounded-md hover:bg-accent transition-colors">
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <span data-testid="notification-badge" className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] font-num w-4 h-4 rounded-full flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent data-testid="notification-panel" className="w-80 max-h-96 overflow-y-auto bg-popover border-border p-0" align="end">
        <div className="p-3 border-b border-border eyebrow">Notifikasi</div>
        {notifs.length === 0 && <p className="p-4 text-sm text-muted-foreground">Belum ada notifikasi.</p>}
        {notifs.map((n) => (
          <button key={n.notif_id} data-testid={`notif-${n.notif_id}`} onClick={() => n.link && navigate(n.link)}
            className={`w-full text-left p-3 border-b border-border/50 hover:bg-accent/50 transition-colors ${!n.read ? "bg-accent/30" : ""}`}>
            <p className="text-sm font-semibold">{n.title}</p>
            {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { appearance } = useBrand();
  const location = useLocation();
  const navigate = useNavigate();

  if (user === null)
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  if (user === false) return <Navigate to="/login" replace />;
  if (user.role === "client" && !user.onboarding_complete) return <Navigate to="/onboarding" replace />;

  const isClient = user.role === "client";
  const nav = user.role === "coach" ? COACH_NAV : ADMIN_NAV;

  return (
    <div className="min-h-screen bg-background" data-testid="app-shell">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/app" data-testid="app-brand" className="flex items-center gap-2">
            {appearance?.logo_url ? (
              <img src={appearance.logo_url} alt="logo" className="h-7 w-auto" />
            ) : (
              <span className="font-display font-800 text-xl font-bold uppercase tracking-wide">
                BRO<span className="text-primary">GRESSIVE</span>
              </span>
            )}
          </Link>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <span className="text-sm text-muted-foreground hidden sm:block px-2">{user.name}</span>
            <button data-testid="logout-button" onClick={async () => { await logout(); navigate("/login"); }}
              className="p-2 rounded-md hover:bg-accent transition-colors" title="Keluar">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex">
        {!isClient && (
          <aside className="hidden md:flex flex-col gap-1 w-56 shrink-0 py-6 px-3 sticky top-14 h-[calc(100vh-3.5rem)]">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} data-testid={n.testid}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  location.pathname.startsWith(n.to) ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}>
                <n.icon className="w-4 h-4" /> {n.label}
              </Link>
            ))}
            {user.role === "coach" && (
              <div className="mt-4 px-3"><p className="eyebrow">Coach</p></div>
            )}
          </aside>
        )}
        <main className={`flex-1 min-w-0 ${isClient ? "pb-24" : ""} p-4 md:p-6`}>
          {!isClient && (
            <div className="md:hidden flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
              {nav.map((n) => (
                <Link key={n.to} to={n.to} data-testid={`${n.testid}-mobile`}
                  className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap ${
                    location.pathname.startsWith(n.to) ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
                  }`}>
                  <n.icon className="w-3.5 h-3.5" /> {n.label}
                </Link>
              ))}
            </div>
          )}
          <Outlet />
        </main>
      </div>

      {isClient && (
        <nav data-testid="client-bottom-nav" className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border">
          <div className="max-w-lg mx-auto grid grid-cols-5">
            {CLIENT_NAV.map((n) => {
              const active = location.pathname.startsWith(n.to);
              return (
                <Link key={n.to} to={n.to} data-testid={n.testid}
                  className={`flex flex-col items-center justify-center h-16 gap-1 transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}>
                  <n.icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{n.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
