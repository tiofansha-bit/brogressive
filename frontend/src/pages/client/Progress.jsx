import { useEffect, useState } from "react";
import { API, fmtDate } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Loader2, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function ClientProgress() {
  const { user } = useAuth();
  const [prog, setProg] = useState(null);
  const [range, setRange] = useState(30);

  useEffect(() => {
    if (!user?.user_id) return;
    API.get(`/clients/${user.user_id}/progress`, { params: { days: range } }).then((r) => setProg(r.data));
  }, [user?.user_id, range]);

  if (!prog) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const ws = prog.weight_series;
  const first = ws[0]?.weight, last = ws[ws.length - 1]?.weight;
  const change = first && last ? (last - first).toFixed(1) : null;
  const Icon = change == null ? Minus : change < 0 ? TrendingDown : change > 0 ? TrendingUp : Minus;

  return (
    <div className="max-w-lg mx-auto space-y-5" data-testid="client-progress">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-extrabold uppercase">Progres</h1>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button key={d} data-testid={`range-${d}`} onClick={() => { setProg(null); setRange(d); }}
              className={`px-3 py-1.5 rounded-md text-xs font-num font-semibold ${range === d ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>
              {d}h
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="eyebrow">Berat Badan</p>
          {change != null && (
            <p className="font-num text-sm font-bold flex items-center gap-1" data-testid="weight-change">
              <Icon className="w-4 h-4 text-primary" /> {change > 0 ? "+" : ""}{change} kg
            </p>
          )}
        </div>
        {ws.length < 2 ? (
          <p className="text-sm text-muted-foreground">Catat berat badan beberapa hari untuk melihat tren.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={ws}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#A1A1AA" }} tickFormatter={(d) => d.slice(5)} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "#A1A1AA" }} width={36} />
              <Tooltip contentStyle={{ background: "#18181F", border: "1px solid rgba(255,255,255,0.1)", fontSize: 12 }} />
              <Line type="monotone" dataKey="weight" stroke="#71717a" dot={false} name="Harian" />
              <Line type="monotone" dataKey="avg7" stroke="#FF2E00" strokeWidth={2} dot={false} name="Rata-rata 7 hari" />
            </LineChart>
          </ResponsiveContainer>
        )}
        <p className="text-[11px] text-muted-foreground mt-2">Garis merah = rata-rata 7 hari. Tren mingguan lebih bermakna daripada satu penimbangan.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="font-num text-2xl font-bold" data-testid="stat-workout-count">{prog.workouts.length}</p>
          <p className="text-xs text-muted-foreground">Sesi latihan ({range} hari)</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="font-num text-2xl font-bold" data-testid="stat-meal-days">{prog.nutrition_daily.length}</p>
          <p className="text-xs text-muted-foreground">Hari tercatat makan</p>
        </div>
      </div>

      <details className="bg-card border border-border rounded-xl p-5" data-testid="progress-detail">
        <summary className="font-display text-lg font-bold uppercase cursor-pointer">Analisis Lengkap</summary>
        <div className="mt-3 max-h-64 overflow-y-auto space-y-1">
          {prog.nutrition_daily.slice().reverse().map((n) => (
            <div key={n.date} className="flex justify-between text-xs border-b border-border/40 py-1.5">
              <span className="text-muted-foreground">{fmtDate(n.date)}</span>
              <span className="font-num">{n.calories} kkal · P{n.protein} C{n.carbs} F{n.fat}</span>
            </div>
          ))}
          {prog.nutrition_daily.length === 0 && <p className="text-sm text-muted-foreground">Belum ada data.</p>}
        </div>
      </details>
    </div>
  );
}
