import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { API, todayStr, fmtDate } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Dumbbell, UtensilsCrossed, Scale, ClipboardList, MessageCircle, CheckCircle2, Circle, Loader2 } from "lucide-react";

export default function ClientToday() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    if (!user?.user_id) return;
    const [ov, meals, workouts, weights] = await Promise.all([
      API.get(`/clients/${user.user_id}/overview`),
      API.get("/logs/meal", { params: { days: 1 } }),
      API.get("/logs/workout", { params: { days: 1 } }),
      API.get("/logs/weight", { params: { days: 1 } }),
    ]);
    setData({ ov: ov.data, meals: meals.data, workouts: workouts.data, weights: weights.data });
  }, [user?.user_id]);

  useEffect(() => { load(); }, [load]);

  if (!data || !user) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const { ov } = data;
  const openCheckin = ov.checkins.find((c) => c.status === "open");
  const responded = ov.checkins.find((c) => c.status === "responded");
  const np = ov.active_nutrition;
  const tp = ov.active_training;
  const today = todayStr();

  const consumed = data.meals.filter((m) => m.date === today).reduce((s, m) => s + m.calories, 0);
  const consumedP = data.meals.filter((m) => m.date === today).reduce((s, m) => s + m.protein, 0);
  const tasks = [
    { done: data.weights.some((w) => w.date === today), label: "Catat berat badan", icon: Scale, to: "/app/log", testid: "task-weight" },
    { done: data.meals.some((m) => m.date === today), label: "Catat makanan", icon: UtensilsCrossed, to: "/app/log", testid: "task-meal" },
    { done: data.workouts.some((w) => w.date === today), label: "Latihan hari ini", icon: Dumbbell, to: "/app/program", testid: "task-workout", hidden: !tp },
    { done: !!openCheckin && openCheckin.status !== "open", label: "Check-in mingguan", icon: ClipboardList, to: "/app/checkin", testid: "task-checkin", hidden: !openCheckin },
  ].filter((t) => !t.hidden);

  const doneCount = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 100;
  const radius = 34;
  const circ = 2 * Math.PI * radius;

  const nextAction = openCheckin
    ? { label: "Isi Check-in Mingguan", to: "/app/checkin", testid: "cta-checkin" }
    : tp && !data.workouts.some((w) => w.date === today)
    ? { label: "Mulai Latihan Hari Ini", to: "/app/program", testid: "cta-workout" }
    : { label: "Catat Makan", to: "/app/log", testid: "cta-meal" };

  return (
    <div className="max-w-lg mx-auto space-y-5" data-testid="client-today">
      <div>
        <p className="eyebrow">{fmtDate(today)}</p>
        <h1 className="font-display text-3xl font-extrabold uppercase">Halo, {user.name.split(" ")[0]}</h1>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-5">
        <div className="relative w-24 h-24 shrink-0">
          <svg viewBox="0 0 84 84" className="w-24 h-24 -rotate-90">
            <circle cx="42" cy="42" r={radius} fill="none" stroke="hsl(var(--secondary))" strokeWidth="8" />
            <circle cx="42" cy="42" r={radius} fill="none" stroke="hsl(var(--primary))" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={circ - (circ * pct) / 100} style={{ transition: "stroke-dashoffset 0.6s ease" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-num font-bold text-xl" data-testid="today-ring-pct">{pct}%</span>
          </div>
        </div>
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">{doneCount} dari {tasks.length} tugas hari ini selesai</p>
          <Link to={nextAction.to}>
            <Button data-testid={nextAction.testid} className="mt-3 w-full h-14 text-base font-bold uppercase tracking-wide glow-primary">
              {nextAction.label}
            </Button>
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        {tasks.map((t) => (
          <Link key={t.label} to={t.to} data-testid={t.testid}
            className="bg-card border border-border rounded-lg p-4 flex items-center gap-3 hover:border-primary/40 transition-colors">
            {t.done ? <CheckCircle2 className="w-5 h-5 text-success" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
            <span className={`text-sm font-medium ${t.done ? "text-muted-foreground line-through" : ""}`}>{t.label}</span>
          </Link>
        ))}
      </div>

      {np && (
        <div className="bg-card border border-border rounded-xl p-5" data-testid="today-nutrition-ring">
          <p className="eyebrow mb-2">Makanan Hari Ini</p>
          <div className="flex items-end justify-between">
            <div>
              <p className="font-num text-2xl font-bold">{Math.round(consumed)} <span className="text-sm text-muted-foreground font-normal">/ {np.content?.targets?.calories} kkal</span></p>
              <p className="text-xs text-muted-foreground mt-1">Protein: {Math.round(consumedP)} / {np.content?.targets?.protein} g</p>
            </div>
            <Link to="/app/log"><Button data-testid="today-log-meal" size="sm" variant="outline">Catat</Button></Link>
          </div>
          <div className="h-2 bg-secondary rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, (consumed / (np.content?.targets?.calories || 1)) * 100)}%` }} />
          </div>
        </div>
      )}

      {responded?.coach_response && (
        <div className="bg-card border border-border rounded-xl p-5" data-testid="today-coach-feedback">
          <p className="eyebrow mb-2 flex items-center gap-2"><MessageCircle className="w-3 h-3" /> Feedback Coach Terbaru</p>
          <p className="text-sm">{responded.coach_response.text}</p>
          {responded.coach_response.next_focus && <p className="text-xs text-primary mt-2">Fokus berikutnya: {responded.coach_response.next_focus}</p>}
        </div>
      )}

      {!np && !tp && (
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <p className="text-sm text-muted-foreground">Coach Anda sedang menyiapkan program. Anda akan mendapat notifikasi saat program aktif.</p>
        </div>
      )}
    </div>
  );
}
