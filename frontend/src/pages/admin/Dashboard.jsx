import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API, fmtDate } from "@/lib/api";
import { Users, ClipboardList, Dumbbell, UtensilsCrossed, CreditCard, UserX } from "lucide-react";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    API.get("/admin/stats").then((r) => setStats(r.data)).catch(() => {});
  }, []);

  if (!stats) return <p className="text-muted-foreground">Memuat...</p>;

  const cards = [
    { label: "Klien Aktif", value: stats.clients_active, sub: `${stats.clients_total} total`, icon: Users, testid: "stat-clients" },
    { label: "Coach Aktif", value: stats.coaches, sub: "", icon: Dumbbell, testid: "stat-coaches" },
    { label: "Belum Ada Coach", value: stats.unassigned_clients, sub: "klien", icon: UserX, testid: "stat-unassigned" },
    { label: "Check-in Menunggu Review", value: stats.checkins_awaiting_review, sub: `${stats.checkins_open} terbuka`, icon: ClipboardList, testid: "stat-checkins" },
    { label: "Plan Nutrisi Aktif", value: stats.active_nutrition_plans, sub: "", icon: UtensilsCrossed, testid: "stat-nutrition" },
    { label: "Plan Latihan Aktif", value: stats.active_training_plans, sub: "", icon: Dumbbell, testid: "stat-training" },
    { label: "Pembayaran Pending", value: stats.payments_pending, sub: "", icon: CreditCard, testid: "stat-payments" },
  ];

  return (
    <div data-testid="admin-dashboard" className="space-y-8">
      <div>
        <p className="eyebrow">Admin</p>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase">Dashboard Operasional</h1>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} data-testid={c.testid} className="bg-card border border-border rounded-lg p-4">
            <c.icon className="w-4 h-4 text-primary mb-2" />
            <p className="font-num text-3xl font-bold">{c.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{c.label} {c.sub && <span>· {c.sub}</span>}</p>
          </div>
        ))}
      </div>
      <div className="bg-card border border-border rounded-lg">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display text-xl font-bold uppercase">Aktivitas Terakhir</h2>
          <Link to="/app/users" data-testid="admin-goto-users" className="text-xs text-primary hover:underline">Kelola pengguna →</Link>
        </div>
        <div className="divide-y divide-border/50">
          {stats.recent_activity.length === 0 && <p className="p-4 text-sm text-muted-foreground">Belum ada aktivitas.</p>}
          {stats.recent_activity.map((a) => (
            <div key={a.audit_id} className="p-3 px-4 flex justify-between gap-4 text-sm">
              <span><span className="font-semibold text-primary">{a.action}</span> <span className="text-muted-foreground">{a.entity} {a.detail}</span></span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(a.created_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
