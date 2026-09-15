import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API, fmtErr, todayStr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Loader2, Timer, Check, ArrowLeft, ArrowRight, AlertTriangle, Trophy } from "lucide-react";
import { toast } from "sonner";

export default function ClientWorkout() {
  const [params] = useSearchParams();
  const dayIdx = Number(params.get("day") || 0);
  const [plan, setPlan] = useState(null);
  const [prev, setPrev] = useState({});
  const [exIdx, setExIdx] = useState(0);
  const [logs, setLogs] = useState({});
  const [restLeft, setRestLeft] = useState(0);
  const [pain, setPain] = useState(false);
  const [notes, setNotes] = useState("");
  const [difficulty, setDifficulty] = useState(7);
  const [startTime] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const timerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const [plans, history] = await Promise.all([API.get("/plans/training"), API.get("/logs/workout", { params: { days: 30 } })]);
      const active = plans.data.find((p) => p.status === "active");
      setPlan(active);
      const pmap = {};
      for (const w of history.data) {
        for (const ex of w.exercises || []) {
          if (!pmap[ex.name]) pmap[ex.name] = ex.sets?.[0];
        }
      }
      setPrev(pmap);
    })();
  }, []);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const day = plan?.content?.days?.[dayIdx];
  const exercises = useMemo(() => day?.exercises || [], [day]);
  const ex = exercises[exIdx];

  if (plan === null) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (!plan || !day)
    return (
      <div className="max-w-lg mx-auto bg-card border border-border rounded-xl p-6 text-center" data-testid="workout-none">
        <p className="text-sm text-muted-foreground">Tidak ada sesi latihan untuk hari ini.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate("/app/program")}>Kembali ke Program</Button>
      </div>
    );

  const key = (i) => `ex_${i}`;
  const sets = logs[key(exIdx)] || Array.from({ length: ex.sets }, () => ({ reps: "", load: "", rir: "", done: false }));
  const setSets = (s) => setLogs({ ...logs, [key(exIdx)]: s });

  const updateSet = (si, k, v) => {
    const s = [...sets];
    s[si] = { ...s[si], [k]: v };
    setSets(s);
  };

  const toggleDone = (si) => {
    updateSet(si, "done", !sets[si].done);
    if (!sets[si].done && ex.rest_sec > 0) {
      clearInterval(timerRef.current);
      setRestLeft(ex.rest_sec);
      timerRef.current = setInterval(() => setRestLeft((r) => { if (r <= 1) { clearInterval(timerRef.current); return 0; } return r - 1; }), 1000);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      const exLogs = exercises.map((e, i) => ({
        name: e.name,
        sets: (logs[key(i)] || []).filter((s) => s.done).map((s) => ({ reps: Number(s.reps) || 0, load: Number(s.load) || 0, rir: s.rir === "" ? null : Number(s.rir) })),
      })).filter((e) => e.sets.length > 0);
      if (exLogs.length === 0) { toast.error("Selesaikan minimal satu set"); setBusy(false); return; }
      await API.post("/logs/workout", {
        plan_id: plan.plan_id, day_label: day.label, exercises: exLogs,
        duration_min: Math.max(1, Math.round((Date.now() - startTime) / 60000)),
        difficulty, pain_flag: pain, notes, date: todayStr(),
      });
      toast.success("Latihan tersimpan. Kerja bagus!");
      navigate("/app/today");
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  };

  const isLast = exIdx === exercises.length - 1;
  const p = prev[ex.name];

  return (
    <div className="max-w-lg mx-auto space-y-4" data-testid="client-workout">
      <div className="flex items-center gap-3">
        <Progress value={((exIdx + 1) / exercises.length) * 100} className="h-2 flex-1" data-testid="workout-progress" />
        <span className="font-num text-xs text-muted-foreground">{exIdx + 1}/{exercises.length}</span>
      </div>
      <p className="eyebrow">{day.label}</p>

      <div className="bg-card border border-border rounded-xl p-5" data-testid={`workout-exercise-${exIdx}`}>
        <h1 className="font-display text-3xl font-extrabold uppercase leading-none" data-testid="exercise-name">{ex.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Target: <span className="font-num text-foreground">{ex.sets} set × {ex.reps} reps</span>
          {ex.tempo && <> · tempo <span className="font-num">{ex.tempo}</span></>}
          {ex.rpe && <> · RPE <span className="font-num">{ex.rpe}</span></>}
        </p>
        {p && <p className="text-xs text-neon mt-1 font-num">Terakhir: {p.load} kg × {p.reps} reps</p>}
        {ex.notes && <p className="text-xs text-muted-foreground mt-2 bg-background rounded p-2">{ex.notes}</p>}
        {ex.video_url && <a href={ex.video_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block">Lihat video demo</a>}

        <div className="mt-4 space-y-2">
          <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground px-1">
            <span className="col-span-2">Set</span><span className="col-span-3">Beban kg</span><span className="col-span-3">Reps</span><span className="col-span-2">RIR</span><span className="col-span-2 text-right">OK</span>
          </div>
          {sets.map((s, si) => (
            <div key={si} className={`grid grid-cols-12 gap-2 items-center rounded-lg p-2 transition-colors ${s.done ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-background"}`} data-testid={`set-row-${si}`}>
              <span className="col-span-2 font-num font-bold text-sm">{si + 1}</span>
              <Input data-testid={`set-load-${si}`} type="number" step="0.5" inputMode="decimal" value={s.load} onChange={(e) => updateSet(si, "load", e.target.value)} className="col-span-3 h-11 bg-card font-num" placeholder={p?.load ? String(p.load) : "kg"} />
              <Input data-testid={`set-reps-${si}`} type="number" inputMode="numeric" value={s.reps} onChange={(e) => updateSet(si, "reps", e.target.value)} className="col-span-3 h-11 bg-card font-num" placeholder="reps" />
              <Input data-testid={`set-rir-${si}`} type="number" inputMode="numeric" value={s.rir} onChange={(e) => updateSet(si, "rir", e.target.value)} className="col-span-2 h-11 bg-card font-num" placeholder="-" />
              <div className="col-span-2 flex justify-end">
                <button data-testid={`set-done-${si}`} onClick={() => toggleDone(si)}
                  className={`w-11 h-11 rounded-md flex items-center justify-center transition-colors ${s.done ? "bg-emerald-600 text-white" : "bg-secondary text-muted-foreground"}`}>
                  <Check className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {restLeft > 0 && (
          <div className="mt-3 bg-primary/10 border border-primary/40 rounded-lg p-3 flex items-center justify-between" data-testid="rest-timer">
            <span className="flex items-center gap-2 text-sm font-semibold"><Timer className="w-4 h-4 text-primary" /> Istirahat</span>
            <span className="font-num text-2xl font-bold text-primary">{Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, "0")}</span>
          </div>
        )}
      </div>

      {isLast && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3" data-testid="workout-summary">
          <h2 className="font-display text-lg font-bold uppercase flex items-center gap-2"><Trophy className="w-4 h-4 text-primary" /> Ringkasan Sesi</h2>
          <div>
            <div className="flex justify-between"><Label className="text-sm">Seberapa berat sesi ini?</Label><span className="font-num text-primary">{difficulty}/10</span></div>
            <input data-testid="workout-difficulty" type="range" min="1" max="10" value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} className="w-full mt-2 accent-primary h-10" />
          </div>
          <label className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-md p-3 cursor-pointer">
            <Checkbox data-testid="workout-pain-flag" checked={pain} onCheckedChange={setPain} />
            <span className="text-xs text-amber-200/90 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Ada nyeri/rasa tidak nyaman saat latihan (coach akan diberi tahu)</span>
          </label>
          <Textarea data-testid="workout-notes" rows={2} className="bg-background" placeholder="Catatan sesi (opsional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      )}

      <div className="flex justify-between pb-4">
        <Button data-testid="workout-prev" variant="outline" disabled={exIdx === 0} onClick={() => setExIdx(exIdx - 1)}><ArrowLeft className="w-4 h-4" /> Sebelumnya</Button>
        {!isLast ? (
          <Button data-testid="workout-next" onClick={() => setExIdx(exIdx + 1)}>Latihan Berikutnya <ArrowRight className="w-4 h-4" /></Button>
        ) : (
          <Button data-testid="workout-finish" onClick={finish} disabled={busy} className="glow-primary">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Selesaikan Latihan"}
          </Button>
        )}
      </div>
    </div>
  );
}
