import { useEffect, useState, useCallback } from "react";
import { API, fmtErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2, Rocket, FilePlus, Archive, Copy } from "lucide-react";
import { toast } from "sonner";

const SET_TYPES = ["straight", "top_set", "back_off", "drop_set", "rest_pause", "superset", "amrap"];
const EMPTY_EX = { name: "", sets: 3, reps: "8-12", rest_sec: 90, tempo: "", rpe: "", set_type: "straight", notes: "", video_url: "" };

export default function TrainingBuilder({ clientId }) {
  const [plans, setPlans] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, e] = await Promise.all([API.get("/plans/training", { params: { client_id: clientId } }), API.get("/exercises")]);
    setPlans(p.data);
    setExercises(e.data);
    if (!sel && p.data.length) setSel(p.data[0]);
  }, [clientId, sel]);

  useEffect(() => { load(); }, [clientId]); // eslint-disable-line

  const createPlan = async () => {
    try {
      const { data } = await API.post("/plans/training", { client_id: clientId, name: "Training Program", content: { duration_weeks: 8, split: "custom", days: [{ label: "Hari 1", exercises: [{ ...EMPTY_EX }] }] } });
      setPlans([data, ...plans]);
      setSel(data);
      toast.success("Draft program dibuat");
    } catch (e) { toast.error(fmtErr(e)); }
  };

  const save = async () => {
    setBusy(true);
    try {
      await API.put(`/plans/training/${sel.plan_id}`, { name: sel.name, content: sel.content, start_date: sel.start_date, end_date: sel.end_date, notes: sel.notes, change_reason: sel.change_reason });
      toast.success("Draft tersimpan");
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  };

  const publish = async () => {
    setBusy(true);
    try {
      await API.post(`/plans/training/${sel.plan_id}/publish`, {});
      toast.success("Program dipublish — klien sekarang melihat versi ini");
      load();
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  };

  const revise = async () => {
    try {
      const { data } = await API.post(`/plans/training/${sel.plan_id}/revise`, { change_reason: sel.change_reason || "" });
      toast.success(`Versi ${data.version} dibuat sebagai draft`);
      setPlans([data, ...plans]);
      setSel(data);
    } catch (e) { toast.error(fmtErr(e)); }
  };

  const archive = async () => {
    try { await API.post(`/plans/training/${sel.plan_id}/archive`); toast.success("Diarsipkan"); setSel(null); load(); }
    catch (e) { toast.error(fmtErr(e)); }
  };

  const days = sel?.content?.days || [];
  const setDays = (d) => setSel({ ...sel, content: { ...sel.content, days: d } });
  const setEx = (di, ei, k, v) => { const d = [...days]; d[di].exercises[ei][k] = v; setDays(d); };
  const editable = sel && (sel.status === "draft" || sel.status === "scheduled");

  return (
    <div className="space-y-4" data-testid="training-builder">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 flex-wrap">
          {plans.map((p) => (
            <button key={p.plan_id} data-testid={`tp-version-${p.plan_id}`} onClick={() => setSel(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 ${sel?.plan_id === p.plan_id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>
              v{p.version} <Badge variant="secondary" className="text-[9px] uppercase">{p.status}</Badge>
            </button>
          ))}
        </div>
        <Button data-testid="tp-create" size="sm" onClick={createPlan}><FilePlus className="w-3 h-3" /> Program Baru</Button>
      </div>

      {!sel && <p className="text-sm text-muted-foreground bg-card border border-border rounded-lg p-6 text-center">Belum ada program latihan.</p>}

      {sel && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-4 flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-40"><Label>Nama Program</Label><Input data-testid="tp-name" disabled={!editable} className="mt-1 bg-background" value={sel.name} onChange={(e) => setSel({ ...sel, name: e.target.value })} /></div>
            <div><Label>Durasi (minggu)</Label><Input data-testid="tp-weeks" type="number" disabled={!editable} className="mt-1 bg-background w-28" value={sel.content?.duration_weeks || 8} onChange={(e) => setSel({ ...sel, content: { ...sel.content, duration_weeks: Number(e.target.value) } })} /></div>
            <div><Label>Mulai</Label><Input data-testid="tp-start" type="date" disabled={!editable} className="mt-1 bg-background" value={sel.start_date || ""} onChange={(e) => setSel({ ...sel, start_date: e.target.value })} /></div>
            <div className="w-full"><Label>Instruksi untuk klien</Label><Input data-testid="tp-notes" disabled={!editable} className="mt-1 bg-background" value={sel.notes || ""} onChange={(e) => setSel({ ...sel, notes: e.target.value })} /></div>
          </div>

          {days.map((d, di) => (
            <div key={di} className="bg-card border border-border rounded-lg p-4" data-testid={`tp-day-${di}`}>
              <div className="flex items-center gap-2 mb-3">
                <Input disabled={!editable} value={d.label} className="h-9 bg-background font-display font-bold uppercase w-48"
                  onChange={(e) => { const x = [...days]; x[di].label = e.target.value; setDays(x); }} />
                {editable && (<>
                  <Button size="sm" variant="ghost" onClick={() => { const x = [...days]; x.splice(di, 0, JSON.parse(JSON.stringify(d))); setDays(x); }} title="Duplikasi hari"><Copy className="w-3 h-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setDays(days.filter((_, i) => i !== di))}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                </>)}
              </div>
              <div className="space-y-2">
                <div className="hidden sm:grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground px-1">
                  <span className="col-span-3">Exercise</span><span>Set</span><span>Reps</span><span>Rest s</span><span>Tempo</span><span>RPE</span><span className="col-span-2">Tipe</span><span className="col-span-2">Catatan</span><span></span>
                </div>
                {d.exercises.map((ex, ei) => (
                  <div key={ei} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center bg-background rounded p-2" data-testid={`tp-ex-${di}-${ei}`}>
                    <div className="col-span-2 sm:col-span-3">
                      <Input list={`ex-list-${di}-${ei}`} disabled={!editable} value={ex.name} placeholder="Nama latihan" className="h-8 bg-card text-xs"
                        onChange={(e) => setEx(di, ei, "name", e.target.value)} data-testid={`tp-ex-name-${di}-${ei}`} />
                      <datalist id={`ex-list-${di}-${ei}`}>{exercises.map((x) => <option key={x.exercise_id} value={x.name} />)}</datalist>
                    </div>
                    <Input type="number" disabled={!editable} value={ex.sets} className="h-8 bg-card font-num text-xs" onChange={(e) => setEx(di, ei, "sets", Number(e.target.value))} />
                    <Input disabled={!editable} value={ex.reps} className="h-8 bg-card font-num text-xs" onChange={(e) => setEx(di, ei, "reps", e.target.value)} placeholder="8-12" />
                    <Input type="number" disabled={!editable} value={ex.rest_sec} className="h-8 bg-card font-num text-xs" onChange={(e) => setEx(di, ei, "rest_sec", Number(e.target.value))} />
                    <Input disabled={!editable} value={ex.tempo} className="h-8 bg-card font-num text-xs" onChange={(e) => setEx(di, ei, "tempo", e.target.value)} placeholder="3010" />
                    <Input disabled={!editable} value={ex.rpe} className="h-8 bg-card font-num text-xs" onChange={(e) => setEx(di, ei, "rpe", e.target.value)} placeholder="8" />
                    <div className="col-span-2">
                      <Select value={ex.set_type} onValueChange={(v) => setEx(di, ei, "set_type", v)} disabled={!editable}>
                        <SelectTrigger className="h-8 bg-card text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{SET_TYPES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Input disabled={!editable} value={ex.notes} className="col-span-2 h-8 bg-card text-xs" onChange={(e) => setEx(di, ei, "notes", e.target.value)} placeholder="Cues / instruksi" />
                    {editable && <button onClick={() => { const x = [...days]; x[di].exercises.splice(ei, 1); setDays(x); }}><Trash2 className="w-3 h-3 text-destructive" /></button>}
                  </div>
                ))}
              </div>
              {editable && (
                <Button data-testid={`tp-add-ex-${di}`} size="sm" variant="outline" className="mt-3" onClick={() => { const x = [...days]; x[di].exercises.push({ ...EMPTY_EX }); setDays(x); }}>
                  <Plus className="w-3 h-3" /> Exercise
                </Button>
              )}
            </div>
          ))}

          {editable && (
            <Button data-testid="tp-add-day" variant="outline" onClick={() => setDays([...days, { label: `Hari ${days.length + 1}`, exercises: [{ ...EMPTY_EX }] }])}>
              <Plus className="w-4 h-4" /> Tambah Hari
            </Button>
          )}

          <div className="flex flex-wrap gap-2">
            {editable && (<>
              <Button data-testid="tp-save" variant="outline" onClick={save} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Simpan Draft"}</Button>
              <Button data-testid="tp-publish" onClick={publish} disabled={busy} className="glow-primary"><Rocket className="w-4 h-4" /> Publish</Button>
            </>)}
            {sel.status === "active" && <Button data-testid="tp-revise" onClick={revise}>Buat Revisi (v{sel.version + 1})</Button>}
            {sel.status !== "archived" && <Button data-testid="tp-archive" variant="ghost" onClick={archive}><Archive className="w-4 h-4" /></Button>}
          </div>
        </div>
      )}
    </div>
  );
}
