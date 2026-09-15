import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API, fmtErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Loader2, ArrowLeft, ArrowRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const STEPS = ["Identitas", "Tubuh", "Tujuan", "Latihan", "Nutrisi", "Kesehatan", "Persetujuan"];

const PARQ = [
  { key: "parq_heart", q: "Apakah Anda pernah didiagnosis kondisi jantung atau tekanan darah tinggi?" },
  { key: "parq_chest", q: "Apakah Anda pernah merasakan nyeri dada saat istirahat atau beraktivitas?" },
  { key: "parq_dizzy", q: "Apakah Anda pernah pusing berat atau pingsan dalam 12 bulan terakhir?" },
  { key: "parq_joint", q: "Apakah Anda memiliki masalah tulang/sendi yang bisa memburuk dengan latihan?" },
  { key: "parq_medication", q: "Apakah Anda sedang mengonsumsi obat rutin dari dokter?" },
  { key: "parq_eating", q: "Apakah Anda memiliki riwayat gangguan makan?" },
  { key: "parq_pregnant", q: "Apakah Anda sedang hamil atau menyusui?" },
];

export default function Onboarding() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [data, setData] = useState({});
  const [parq, setParq] = useState({});
  const [consent, setConsent] = useState(false);
  const [completeness, setCompleteness] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (user === false) navigate("/login");
  }, [user, navigate]);

  useEffect(() => {
    (async () => {
      try {
        const { data: doc } = await API.get("/onboarding");
        setData(doc.data || {});
        setParq((doc.data || {}).parq_answers || {});
        setCompleteness(doc.completeness || 0);
      } catch {}
      setLoaded(true);
    })();
  }, []);

  if (!user || !loaded)
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const merged = () => ({ ...data, parq_answers: parq, parq_flags: Object.values(parq).some(Boolean), parq_answered: Object.keys(parq).length === PARQ.length });

  const save = async (next) => {
    setSaving(true);
    try {
      const { data: r } = await API.put("/onboarding", { data: merged() });
      setCompleteness(r.completeness);
      if (next) setStep(next);
    } catch (e) {
      toast.error(fmtErr(e));
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    try {
      await API.post("/onboarding/complete", { data: merged(), consent });
      toast.success("Onboarding selesai! Selamat datang.");
      await refresh();
      navigate("/app/today");
    } catch (e) {
      toast.error(fmtErr(e));
    } finally {
      setSaving(false);
    }
  };

  const set = (k) => (e) => setData({ ...data, [k]: e.target.value });
  const setSel = (k) => (v) => setData({ ...data, [k]: v });

  const F = ({ label, k, type = "text", placeholder = "", testid }) => (
    <div>
      <Label>{label}</Label>
      <Input data-testid={testid || `ob-${k}`} type={type} value={data[k] || ""} onChange={set(k)} placeholder={placeholder} className="mt-1 bg-background h-12" />
    </div>
  );

  const Sel = ({ label, k, options, testid }) => (
    <div>
      <Label>{label}</Label>
      <Select value={data[k] || ""} onValueChange={setSel(k)}>
        <SelectTrigger data-testid={testid || `ob-${k}`} className="mt-1 bg-background h-12"><SelectValue placeholder="Pilih..." /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="min-h-screen bg-background" data-testid="onboarding-page">
      <div className="max-w-xl mx-auto px-4 py-8">
        <p className="eyebrow">Langkah {step + 1} dari {STEPS.length}</p>
        <h1 className="font-display text-3xl font-extrabold uppercase mt-1">{STEPS[step]}</h1>
        <div className="mt-4 flex items-center gap-3">
          <Progress value={completeness} className="h-2 flex-1" data-testid="onboarding-progress" />
          <span className="font-num text-xs text-muted-foreground">{completeness}%</span>
        </div>

        <div className="mt-8 space-y-4 bg-card border border-border rounded-lg p-6">
          {step === 0 && (<>
            <F label="Nama lengkap" k="full_name" />
            <F label="Tanggal lahir" k="birth_date" type="date" />
            <Sel label="Jenis kelamin" k="gender" options={[{ v: "male", l: "Pria" }, { v: "female", l: "Wanita" }]} />
            <F label="Nomor WhatsApp" k="phone" placeholder="08xxxxxxxxxx" />
            <F label="Kota / Domisili" k="city" />
          </>)}
          {step === 1 && (<>
            <F label="Tinggi badan (cm)" k="height_cm" type="number" />
            <F label="Berat badan saat ini (kg)" k="weight_kg" type="number" />
            <F label="Target berat (kg, opsional)" k="target_weight" type="number" />
            <F label="Lingkar pinggang (cm, opsional)" k="waist_cm" type="number" />
          </>)}
          {step === 2 && (<>
            <Sel label="Tujuan utama" k="goal" options={[
              { v: "fat_loss", l: "Menurunkan lemak (fat loss)" },
              { v: "muscle_gain", l: "Menambah massa otot" },
              { v: "recomposition", l: "Rekomposisi (otot naik, lemak turun)" },
              { v: "strength", l: "Meningkatkan kekuatan" },
              { v: "lifestyle", l: "Gaya hidup sehat / maintenance" },
            ]} />
            <F label="Target tanggal (opsional)" k="target_date" type="date" />
            <div>
              <Label>Ceritakan motivasi & hambatan Anda</Label>
              <Textarea data-testid="ob-goal_notes" value={data.goal_notes || ""} onChange={set("goal_notes")} className="mt-1 bg-background" rows={3} />
            </div>
          </>)}
          {step === 3 && (<>
            <Sel label="Pengalaman latihan" k="training_experience" options={[
              { v: "beginner", l: "Pemula (< 1 tahun)" }, { v: "intermediate", l: "Menengah (1-3 tahun)" }, { v: "advanced", l: "Lanjutan (> 3 tahun)" }]} />
            <Sel label="Berapa hari per minggu Anda bisa latihan?" k="training_days" options={[2, 3, 4, 5, 6].map((n) => ({ v: String(n), l: `${n} hari` }))} />
            <Sel label="Peralatan yang tersedia" k="equipment" options={[
              { v: "full_gym", l: "Gym lengkap" }, { v: "basic_gym", l: "Gym sederhana" }, { v: "home_db", l: "Rumah (dumbbell)" }, { v: "bodyweight", l: "Tanpa alat" }]} />
            <div>
              <Label>Riwayat cedera / batasan gerak (opsional)</Label>
              <Textarea data-testid="ob-injuries" value={data.injuries || ""} onChange={set("injuries")} className="mt-1 bg-background" rows={2} />
            </div>
          </>)}
          {step === 4 && (<>
            <Sel label="Berapa kali makan per hari yang Anda inginkan?" k="meals_per_day" options={[2, 3, 4, 5].map((n) => ({ v: String(n), l: `${n}x makan` }))} />
            <Sel label="Pola makan" k="diet_pattern" options={[
              { v: "no_restriction", l: "Tidak ada pantangan" }, { v: "halal", l: "Halal" }, { v: "vegetarian", l: "Vegetarian" }, { v: "other", l: "Lainnya" }]} />
            <div>
              <Label>Alergi / intoleransi makanan (opsional)</Label>
              <Textarea data-testid="ob-allergies" value={data.allergies || ""} onChange={set("allergies")} className="mt-1 bg-background" rows={2} />
            </div>
            <F label="Makanan yang tidak Anda sukai (opsional)" k="dislikes" />
          </>)}
          {step === 5 && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-md p-3">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200/90">Jawaban Anda bersifat privat dan hanya untuk keselamatan pemrograman. Ini bukan diagnosis medis. Bila ada jawaban "Ya", coach akan meminta clearance medis sebelum program aktif.</p>
              </div>
              {PARQ.map((p) => (
                <div key={p.key} className="flex items-start justify-between gap-4 border-b border-border/50 pb-3">
                  <p className="text-sm flex-1">{p.q}</p>
                  <div className="flex gap-2">
                    {[["Ya", true], ["Tidak", false]].map(([l, v]) => (
                      <button key={l} type="button" data-testid={`parq-${p.key}-${l.toLowerCase()}`}
                        onClick={() => setParq({ ...parq, [p.key]: v })}
                        className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${parq[p.key] === v ? (v ? "bg-amber-500 text-black" : "bg-emerald-600 text-white") : "bg-secondary text-muted-foreground"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {step === 6 && (
            <div className="space-y-4">
              <div>
                <Label>Harapan Anda dari coaching ini (opsional)</Label>
                <Textarea data-testid="ob-expectations" value={data.expectations || ""} onChange={set("expectations")} className="mt-1 bg-background" rows={3} />
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox data-testid="ob-consent" checked={consent} onCheckedChange={setConsent} className="mt-1" />
                <span className="text-sm text-muted-foreground">
                  Saya memahami bahwa layanan coaching ini <b className="text-foreground">bukan pengganti layanan dokter, ahli gizi klinis, fisioterapis, atau layanan darurat</b>. Saya bertanggung jawab atas kesehatan saya dan akan berkonsultasi ke tenaga medis bila diperlukan.
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="flex justify-between mt-6">
          <Button data-testid="ob-back" variant="outline" disabled={step === 0 || saving} onClick={() => save(step - 1)}>
            <ArrowLeft className="w-4 h-4" /> Kembali
          </Button>
          {step < STEPS.length - 1 ? (
            <Button data-testid="ob-next" disabled={saving} onClick={() => save(step + 1)}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Lanjut <ArrowRight className="w-4 h-4" /></>}
            </Button>
          ) : (
            <Button data-testid="ob-finish" disabled={saving || !consent} onClick={finish} className="glow-primary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Selesai & Mulai"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
