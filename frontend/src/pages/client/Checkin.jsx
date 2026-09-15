import { useEffect, useState } from "react";
import { API, fmtErr, fmtDate, uploadFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, ArrowLeft, ArrowRight, Camera } from "lucide-react";
import { toast } from "sonner";

const STEPS = ["Berat & Tubuh", "Foto Progres", "Kondisi Minggu Ini", "Cerita & Kirim"];
const PHOTO_SLOTS = [{ key: "front", label: "Depan" }, { key: "side", label: "Samping" }, { key: "back", label: "Belakang" }];

function ScaleInput({ label, k, data, setData }) {
  return (
    <div>
      <div className="flex justify-between"><Label className="text-sm">{label}</Label><span className="font-num text-sm text-primary">{data[k]}</span></div>
      <input data-testid={`ci-${k}`} type="range" min="1" max="10" value={data[k]} onChange={(e) => setData({ ...data, [k]: Number(e.target.value) })} className="w-full mt-2 accent-primary h-12" />
      <div className="flex justify-between text-[10px] text-muted-foreground"><span>Buruk</span><span>Sangat baik</span></div>
    </div>
  );
}

export default function ClientCheckin() {
  const [checkins, setCheckins] = useState(null);
  const [step, setStep] = useState(0);
  const [data, setData] = useState({ weight_avg: "", waist: "", adherence: 7, energy: 7, sleep: 7, stress: 5, hunger: 5, wins: "", challenges: "", questions: "" });
  const [photos, setPhotos] = useState({});
  const [busy, setBusy] = useState(false);

  const load = () => API.get("/checkins").then((r) => setCheckins(r.data)).catch(() => setCheckins([]));
  useEffect(() => { load(); }, []);

  if (!checkins) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const open = checkins.find((c) => c.status === "open");
  const history = checkins.filter((c) => c.status !== "open");

  const uploadPhoto = async (slot, file) => {
    if (!file) return;
    try {
      const url = await uploadFile(file);
      setPhotos((p) => ({ ...p, [slot]: url }));
      toast.success(`Foto ${slot} terunggah`);
    } catch (e) { toast.error(fmtErr(e)); }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const payload = { ...data, weight_avg: Number(data.weight_avg) || null, waist: Number(data.waist) || null };
      const r = await API.put(`/checkins/${open.checkin_id}`, { data: payload, photos: Object.values(photos) });
      toast.success(r.data.safety_flag ? "Check-in terkirim. Coach akan meninjau catatan Anda." : "Check-in terkirim!");
      setStep(0);
      load();
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-lg mx-auto space-y-5" data-testid="client-checkin">
      <h1 className="font-display text-3xl font-extrabold uppercase">Check-in Mingguan</h1>

      {!open && (
        <div className="bg-card border border-border rounded-xl p-6 text-center" data-testid="checkin-none">
          <p className="text-sm text-muted-foreground">Tidak ada check-in yang terbuka saat ini. Coach akan membuka check-in setiap minggu.</p>
        </div>
      )}

      {open && (
        <>
          <div className="flex items-center gap-3">
            <Progress value={((step + 1) / STEPS.length) * 100} className="h-2 flex-1" data-testid="checkin-progress" />
            <span className="font-num text-xs text-muted-foreground">{step + 1}/{STEPS.length}</span>
          </div>
          <p className="eyebrow">{STEPS[step]} · ±3 menit</p>

          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            {step === 0 && (<>
              <div><Label>Berat rata-rata minggu ini (kg)</Label><Input data-testid="ci-weight" type="number" step="0.1" inputMode="decimal" className="mt-1 bg-background h-12 font-num text-lg" value={data.weight_avg} onChange={(e) => setData({ ...data, weight_avg: e.target.value })} /></div>
              <div><Label>Lingkar pinggang (cm, opsional)</Label><Input data-testid="ci-waist" type="number" step="0.5" inputMode="decimal" className="mt-1 bg-background h-12 font-num text-lg" value={data.waist} onChange={(e) => setData({ ...data, waist: e.target.value })} /></div>
            </>)}
            {step === 1 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Gunakan pose, pencahayaan, dan waktu yang sama setiap minggu (pagi, sebelum makan). Foto hanya terlihat oleh coach Anda.</p>
                <div className="grid grid-cols-3 gap-2">
                  {PHOTO_SLOTS.map((s) => (
                    <label key={s.key} data-testid={`ci-photo-${s.key}`} className="aspect-[3/4] bg-background border border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer overflow-hidden hover:border-primary/50 transition-colors">
                      {photos[s.key] ? (
                        <img src={`${process.env.REACT_APP_BACKEND_URL}${photos[s.key]}`} alt={s.label} className="w-full h-full object-cover" />
                      ) : (<>
                        <Camera className="w-5 h-5 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">{s.label}</span>
                      </>)}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadPhoto(s.key, e.target.files?.[0])} />
                    </label>
                  ))}
                </div>
              </div>
            )}
            {step === 2 && (<>
              <ScaleInput label="Seberapa patuh Anda pada program minggu ini?" k="adherence" data={data} setData={setData} />
              <ScaleInput label="Energi" k="energy" data={data} setData={setData} />
              <ScaleInput label="Kualitas tidur" k="sleep" data={data} setData={setData} />
              <ScaleInput label="Stres (1 = sangat stres, 10 = santai)" k="stress" data={data} setData={setData} />
              <ScaleInput label="Rasa lapar (1 = sangat lapar)" k="hunger" data={data} setData={setData} />
            </>)}
            {step === 3 && (<>
              <div><Label>Hal yang berjalan baik minggu ini</Label><Textarea data-testid="ci-wins" rows={2} className="mt-1 bg-background" value={data.wins} onChange={(e) => setData({ ...data, wins: e.target.value })} /></div>
              <div><Label>Tantangan / kendala</Label><Textarea data-testid="ci-challenges" rows={2} className="mt-1 bg-background" value={data.challenges} onChange={(e) => setData({ ...data, challenges: e.target.value })} /></div>
              <div><Label>Pertanyaan untuk coach</Label><Textarea data-testid="ci-questions" rows={2} className="mt-1 bg-background" value={data.questions} onChange={(e) => setData({ ...data, questions: e.target.value })} /></div>
            </>)}
          </div>

          <div className="flex justify-between">
            <Button data-testid="ci-back" variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft className="w-4 h-4" /> Kembali</Button>
            {step < STEPS.length - 1 ? (
              <Button data-testid="ci-next" onClick={() => setStep(step + 1)}>Lanjut <ArrowRight className="w-4 h-4" /></Button>
            ) : (
              <Button data-testid="ci-submit" onClick={submit} disabled={busy || !data.weight_avg} className="glow-primary">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Kirim Check-in"}
              </Button>
            )}
          </div>
        </>
      )}

      {history.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-xl font-bold uppercase">Riwayat</h2>
          {history.map((c) => (
            <div key={c.checkin_id} data-testid={`checkin-history-${c.checkin_id}`} className="bg-card border border-border rounded-xl p-4">
              <div className="flex justify-between items-center">
                <p className="text-sm font-semibold">Minggu {fmtDate(c.week_of)}</p>
                <Badge variant={c.status === "responded" ? "default" : "secondary"}>{c.status === "responded" ? "Sudah direspons" : "Menunggu review"}</Badge>
              </div>
              {c.coach_response && (
                <div className="mt-2 bg-emerald-500/10 border border-emerald-500/30 rounded-md p-3">
                  <p className="text-[10px] uppercase tracking-wider text-emerald-400">Respons Coach</p>
                  <p className="text-sm mt-1">{c.coach_response.text}</p>
                  {c.coach_response.next_focus && <p className="text-xs text-primary mt-1">Fokus: {c.coach_response.next_focus}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
