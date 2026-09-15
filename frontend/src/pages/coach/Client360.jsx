import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { API, fmtErr, fmtDate } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { toast } from "sonner";
import NutritionBuilder from "./NutritionBuilder";
import TrainingBuilder from "./TrainingBuilder";
import ChatThread from "@/components/ChatThread";

const GOAL_LABELS = { fat_loss: "Fat Loss", muscle_gain: "Muscle Gain", recomposition: "Recomposition", strength: "Strength", lifestyle: "Lifestyle" };

function Overview({ data, reload }) {
  const [note, setNote] = useState("");
  const p = data.profile?.data || {};
  const resolveFlag = async (fid) => {
    try {
      await API.post(`/clients/${data.client.user_id}/flags/${fid}/resolve`);
      toast.success("Flag ditutup");
      reload();
    } catch (e) { toast.error(fmtErr(e)); }
  };
  const addNote = async () => {
    if (!note.trim()) return;
    try {
      await API.post(`/clients/${data.client.user_id}/notes`, { text: note });
      setNote("");
      toast.success("Catatan tersimpan (privat, tidak terlihat klien)");
      reload();
    } catch (e) { toast.error(fmtErr(e)); }
  };
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        <h3 className="font-display text-lg font-bold uppercase">Profil & Assessment</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Goal</dt><dd>{GOAL_LABELS[p.goal] || "-"}</dd>
          <dt className="text-muted-foreground">Tinggi</dt><dd className="font-num">{p.height_cm ? `${p.height_cm} cm` : "-"}</dd>
          <dt className="text-muted-foreground">Berat awal</dt><dd className="font-num">{p.weight_kg ? `${p.weight_kg} kg` : "-"}</dd>
          <dt className="text-muted-foreground">Target berat</dt><dd className="font-num">{p.target_weight ? `${p.target_weight} kg` : "-"}</dd>
          <dt className="text-muted-foreground">Hari latihan</dt><dd>{p.training_days ? `${p.training_days}x/minggu` : "-"}</dd>
          <dt className="text-muted-foreground">Equipment</dt><dd>{p.equipment || "-"}</dd>
          <dt className="text-muted-foreground">Makan/hari</dt><dd>{p.meals_per_day || "-"}</dd>
          <dt className="text-muted-foreground">Alergi</dt><dd>{p.allergies || "-"}</dd>
          <dt className="text-muted-foreground">Cedera</dt><dd>{p.injuries || "-"}</dd>
          <dt className="text-muted-foreground">Onboarding</dt><dd>{data.profile?.status === "complete" ? `${data.profile.completeness}% (selesai)` : `${data.profile?.completeness || 0}%`}</dd>
        </dl>
        {data.enrollment && (
          <p className="text-xs text-muted-foreground border-t border-border/50 pt-2">
            Paket: <b className="text-foreground">{data.enrollment.package_name}</b> · s.d. {fmtDate(data.enrollment.end_date)}
          </p>
        )}
      </div>
      <div className="space-y-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="font-display text-lg font-bold uppercase flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Safety Flags</h3>
          {data.safety_flags.length === 0 && <p className="text-sm text-muted-foreground mt-2">Tidak ada flag terbuka.</p>}
          {data.safety_flags.map((f) => (
            <div key={f.flag_id} data-testid={`flag-${f.flag_id}`} className="mt-2 bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-sm flex justify-between gap-3">
              <div><p className="font-semibold text-amber-400">{f.type}</p><p className="text-xs text-amber-200/80">{f.note}</p></div>
              <Button size="sm" variant="outline" data-testid={`resolve-flag-${f.flag_id}`} onClick={() => resolveFlag(f.flag_id)}>Tutup</Button>
            </div>
          ))}
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="font-display text-lg font-bold uppercase">Coach Notes (Privat)</h3>
          <div className="flex gap-2 mt-3">
            <Textarea data-testid="coach-note-input" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="bg-background" placeholder="Catatan internal..." />
            <Button data-testid="coach-note-add" onClick={addNote} size="sm" className="self-end">Simpan</Button>
          </div>
          <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
            {data.coach_notes.map((n) => (
              <div key={n.note_id} className="text-xs bg-background rounded p-2">
                <p>{n.text}</p><p className="text-muted-foreground mt-1">{n.coach_name} · {fmtDate(n.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckinsTab({ clientId }) {
  const [checkins, setCheckins] = useState([]);
  const [resp, setResp] = useState({});
  const load = useCallback(() => API.get("/checkins", { params: { client_id: clientId } }).then((r) => setCheckins(r.data)), [clientId]);
  useEffect(() => { load(); }, [load]);
  const respond = async (cid) => {
    try {
      await API.post(`/checkins/${cid}/respond`, resp[cid] || {});
      toast.success("Respons terkirim ke klien");
      setResp({ ...resp, [cid]: {} });
      load();
    } catch (e) { toast.error(fmtErr(e)); }
  };
  const STATUS = { open: "Menunggu klien", submitted: "Perlu review", responded: "Sudah direspons" };
  return (
    <div className="space-y-4" data-testid="checkins-tab">
      {checkins.length === 0 && <p className="text-sm text-muted-foreground">Belum ada check-in. Buka dari dashboard klien.</p>}
      {checkins.map((c) => (
        <div key={c.checkin_id} data-testid={`checkin-${c.checkin_id}`} className="bg-card border border-border rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Minggu {fmtDate(c.week_of)}</p>
            <Badge variant={c.status === "submitted" ? "default" : "secondary"}>{STATUS[c.status] || c.status}</Badge>
          </div>
          {c.status !== "open" && (
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              {Object.entries(c.data || {}).map(([k, v]) => (
                <div key={k} className="bg-background rounded p-2"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.replace(/_/g, " ")}</p><p className="mt-0.5">{String(v)}</p></div>
              ))}
            </div>
          )}
          {(c.photos || []).length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {c.photos.map((ph, i) => (
                <a key={i} href={ph.startsWith("http") ? ph : `${process.env.REACT_APP_BACKEND_URL}${ph}`} target="_blank" rel="noreferrer">
                  <img src={ph.startsWith("http") ? ph : `${process.env.REACT_APP_BACKEND_URL}${ph}`} alt={`progress-${i}`} className="w-20 h-20 object-cover rounded border border-border" data-testid={`checkin-photo-${c.checkin_id}-${i}`} />
                </a>
              ))}
            </div>
          )}
          {c.status === "submitted" && (
            <div className="space-y-2 border-t border-border/50 pt-3">
              <Textarea data-testid={`respond-text-${c.checkin_id}`} placeholder="Feedback utama untuk klien..." rows={2} className="bg-background"
                value={resp[c.checkin_id]?.text || ""} onChange={(e) => setResp({ ...resp, [c.checkin_id]: { ...(resp[c.checkin_id] || {}), text: e.target.value } })} />
              <Textarea data-testid={`respond-adj-${c.checkin_id}`} placeholder="Ringkasan penyesuaian program (opsional)" rows={2} className="bg-background"
                value={resp[c.checkin_id]?.adjustments || ""} onChange={(e) => setResp({ ...resp, [c.checkin_id]: { ...(resp[c.checkin_id] || {}), adjustments: e.target.value } })} />
              <Button data-testid={`respond-submit-${c.checkin_id}`} size="sm" onClick={() => respond(c.checkin_id)} disabled={!resp[c.checkin_id]?.text}>Kirim Respons</Button>
            </div>
          )}
          {c.coach_response && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-md p-3 text-sm">
              <p className="text-[10px] uppercase tracking-wider text-emerald-400">Respons Anda</p>
              <p className="mt-1">{c.coach_response.text}</p>
              {c.coach_response.adjustments && <p className="text-xs text-muted-foreground mt-1">Penyesuaian: {c.coach_response.adjustments}</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ProgressTab({ clientId }) {
  const [prog, setProg] = useState(null);
  useEffect(() => { API.get(`/clients/${clientId}/progress`, { params: { days: 90 } }).then((r) => setProg(r.data)); }, [clientId]);
  if (!prog) return <Loader2 className="w-5 h-5 animate-spin text-primary" />;
  return (
    <div className="space-y-4" data-testid="progress-tab">
      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="font-display text-lg font-bold uppercase mb-3">Tren Berat (90 hari)</h3>
        {prog.weight_series.length < 2 ? <p className="text-sm text-muted-foreground">Data berat belum cukup.</p> : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={prog.weight_series}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#A1A1AA" }} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#A1A1AA" }} width={40} />
              <Tooltip contentStyle={{ background: "#18181F", border: "1px solid rgba(255,255,255,0.1)", fontSize: 12 }} />
              <Line type="monotone" dataKey="weight" stroke="#71717a" dot={false} name="Harian" />
              <Line type="monotone" dataKey="avg7" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Rata-rata 7 hari" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="font-display text-lg font-bold uppercase mb-2">Nutrisi Harian</h3>
          <div className="max-h-56 overflow-y-auto space-y-1">
            {prog.nutrition_daily.slice().reverse().map((n) => (
              <div key={n.date} className="flex justify-between text-xs border-b border-border/40 py-1.5">
                <span className="text-muted-foreground">{fmtDate(n.date)}</span>
                <span className="font-num">{n.calories} kkal · P{n.protein} C{n.carbs} F{n.fat}</span>
              </div>
            ))}
            {prog.nutrition_daily.length === 0 && <p className="text-sm text-muted-foreground">Belum ada log makanan.</p>}
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="font-display text-lg font-bold uppercase mb-2">Sesi Latihan</h3>
          <div className="max-h-56 overflow-y-auto space-y-1">
            {prog.workouts.slice().reverse().map((w, i) => (
              <div key={i} className="flex justify-between text-xs border-b border-border/40 py-1.5">
                <span>{w.day_label || "Workout"} {w.pain_flag && <span className="text-destructive">(nyeri)</span>}</span>
                <span className="text-muted-foreground">{fmtDate(w.date)} · {w.duration_min} mnt</span>
              </div>
            ))}
            {prog.workouts.length === 0 && <p className="text-sm text-muted-foreground">Belum ada log latihan.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function EnhancedTab({ clientId }) {
  const [entries, setEntries] = useState([]);
  useEffect(() => { API.get("/enhanced", { params: { client_id: clientId } }).then((r) => setEntries(r.data)); }, [clientId]);
  return (
    <div className="space-y-4" data-testid="enhanced-tab">
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-xs text-amber-200/90">
        Data di bawah adalah <b>self-report klien</b> (provenance: self_report). Coach tidak dapat meresepkan, mengubah, atau merekomendasikan regimen. Bila ada kekhawatiran medis, rujuk ke tenaga kesehatan.
      </div>
      {entries.length === 0 && <p className="text-sm text-muted-foreground">Belum ada catatan self-report.</p>}
      {entries.map((e) => (
        <div key={e.entry_id} className="bg-card border border-border rounded-lg p-4">
          <div className="flex justify-between items-center">
            <p className="font-semibold text-sm">Minggu {fmtDate(e.week_of)}</p>
            <Badge variant="secondary" className="text-[10px] uppercase">self-report</Badge>
          </div>
          <div className="mt-2 space-y-1">
            {(e.entries || []).map((en, i) => (
              <p key={i} className="text-xs text-muted-foreground">{en.name} — {en.note || "-"}</p>
            ))}
          </div>
          {e.notes && <p className="text-xs mt-2 border-t border-border/50 pt-2">{e.notes}</p>}
        </div>
      ))}
    </div>
  );
}

export default function Client360() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const load = useCallback(() => API.get(`/clients/${id}/overview`).then((r) => setData(r.data)).catch((e) => toast.error(fmtErr(e))), [id]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div data-testid="client-360" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Client 360°</p>
          <h1 className="font-display text-3xl font-extrabold uppercase">{data.client?.name}</h1>
          <p className="text-xs text-muted-foreground">{data.client?.email}</p>
        </div>
        {data.assignment && <Badge variant="outline">Coach: {data.assignment.coach_name}</Badge>}
      </div>
      <Tabs defaultValue="overview">
        <TabsList className="bg-card border border-border flex-wrap h-auto" data-testid="client360-tabs">
          <TabsTrigger data-testid="tab-overview" value="overview">Overview</TabsTrigger>
          <TabsTrigger data-testid="tab-nutrition" value="nutrition">Nutrisi</TabsTrigger>
          <TabsTrigger data-testid="tab-training" value="training">Latihan</TabsTrigger>
          <TabsTrigger data-testid="tab-checkins" value="checkins">Check-in</TabsTrigger>
          <TabsTrigger data-testid="tab-progress" value="progress">Progres</TabsTrigger>
          <TabsTrigger data-testid="tab-messages" value="messages">Pesan</TabsTrigger>
          <TabsTrigger data-testid="tab-enhanced" value="enhanced">Enhanced</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4"><Overview data={data} reload={load} /></TabsContent>
        <TabsContent value="nutrition" className="mt-4"><NutritionBuilder clientId={id} /></TabsContent>
        <TabsContent value="training" className="mt-4"><TrainingBuilder clientId={id} /></TabsContent>
        <TabsContent value="checkins" className="mt-4"><CheckinsTab clientId={id} /></TabsContent>
        <TabsContent value="progress" className="mt-4"><ProgressTab clientId={id} /></TabsContent>
        <TabsContent value="messages" className="mt-4"><div className="bg-card border border-border rounded-lg p-4"><ChatThread partnerId={id} partnerName={data.client?.name} /></div></TabsContent>
        <TabsContent value="enhanced" className="mt-4"><EnhancedTab clientId={id} /></TabsContent>
      </Tabs>
    </div>
  );
}
