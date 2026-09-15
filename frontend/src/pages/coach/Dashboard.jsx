import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API, fmtErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ClipboardList, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const GOAL_LABELS = { fat_loss: "Fat Loss", muscle_gain: "Muscle Gain", recomposition: "Recomp", strength: "Strength", lifestyle: "Lifestyle" };

export default function CoachDashboard() {
  const [clients, setClients] = useState(null);

  const load = () => API.get("/coach/clients").then((r) => setClients(r.data)).catch(() => setClients([]));
  useEffect(() => { load(); }, []);

  const openCheckin = async (clientId) => {
    try {
      await API.post("/checkins/open", { client_id: clientId });
      toast.success("Check-in dibuka untuk klien");
      load();
    } catch (e) { toast.error(fmtErr(e)); }
  };

  if (!clients) return <p className="text-muted-foreground">Memuat...</p>;

  return (
    <div data-testid="coach-dashboard" className="space-y-6">
      <div>
        <p className="eyebrow">Coach</p>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase">Klien Saya</h1>
        <p className="text-sm text-muted-foreground mt-1">{clients.length} klien aktif · {clients.reduce((s, c) => s + c.pending_checkins, 0)} check-in menunggu review</p>
      </div>

      {clients.length === 0 && (
        <div className="bg-card border border-border rounded-lg p-10 text-center">
          <p className="text-muted-foreground">Belum ada klien yang ditugaskan. Admin dapat menugaskan klien dari menu Pengguna.</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.map((c) => (
          <div key={c.client.user_id} data-testid={`client-card-${c.client.user_id}`} className="bg-card border border-border rounded-lg p-5 space-y-3 hover:border-primary/40 transition-colors">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-xl font-bold uppercase">{c.client.name}</h3>
                <p className="text-xs text-muted-foreground">{c.client.email}</p>
              </div>
              {c.safety_flags > 0 && (
                <Badge data-testid={`flag-badge-${c.client.user_id}`} variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" /> {c.safety_flags}</Badge>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-background rounded p-2">
                <p className="font-num font-bold">{c.last_weight ? `${c.last_weight}` : "—"}</p>
                <p className="text-[10px] text-muted-foreground">kg terakhir</p>
              </div>
              <div className="bg-background rounded p-2">
                <p className="font-num font-bold">{c.adherence_7d}%</p>
                <p className="text-[10px] text-muted-foreground">log 7 hari</p>
              </div>
              <div className="bg-background rounded p-2">
                <p className="font-num font-bold">{GOAL_LABELS[c.goal] || "—"}</p>
                <p className="text-[10px] text-muted-foreground">goal</p>
              </div>
            </div>
            {c.pending_checkins > 0 && <p className="text-xs text-amber-500 font-semibold">{c.pending_checkins} check-in menunggu review Anda</p>}
            {c.onboarding !== "complete" && <p className="text-xs text-muted-foreground">Onboarding: {c.completeness}%</p>}
            <div className="flex gap-2 pt-1">
              <Link to={`/app/clients/${c.client.user_id}`} className="flex-1">
                <Button data-testid={`open-client-${c.client.user_id}`} className="w-full" size="sm">Buka Workspace <ArrowRight className="w-3 h-3" /></Button>
              </Link>
              <Button data-testid={`open-checkin-${c.client.user_id}`} size="sm" variant="outline" onClick={() => openCheckin(c.client.user_id)} title="Buka check-in mingguan">
                <ClipboardList className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
