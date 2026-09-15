import { useEffect, useMemo, useState } from "react";
import { API, fmtErr, todayStr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Scale, UtensilsCrossed, Droplets, Footprints, Moon, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function ClientLog() {
  const [weight, setWeight] = useState("");
  const [foods, setFoods] = useState([]);
  const [mealItems, setMealItems] = useState([]);
  const [mealName, setMealName] = useState("Makan 1");
  const [pick, setPick] = useState("");
  const [daily, setDaily] = useState({ water_ml: "", steps: "", sleep_hours: "" });
  const [enhEntries, setEnhEntries] = useState([{ name: "", note: "" }]);
  const [enhNotes, setEnhNotes] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => { API.get("/foods").then((r) => setFoods(r.data)); }, []);

  const totals = useMemo(() => mealItems.reduce((s, i) => ({
    calories: s.calories + i.calories * i.qty, protein: s.protein + i.protein * i.qty,
    carbs: s.carbs + i.carbs * i.qty, fat: s.fat + i.fat * i.qty,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 }), [mealItems]);

  const addFood = () => {
    const f = foods.find((x) => x.food_id === pick);
    if (!f) return;
    setMealItems([...mealItems, { food_id: f.food_id, name: f.name, qty: 1, unit: `${f.serving_size} ${f.serving_unit}`, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat }]);
    setPick("");
  };

  const saveWeight = async () => {
    setBusy("w");
    try { await API.post("/logs/weight", { weight: Number(weight) }); setWeight(""); toast.success("Berat tercatat"); }
    catch (e) { toast.error(fmtErr(e)); } finally { setBusy(""); }
  };

  const saveMeal = async () => {
    setBusy("m");
    try {
      await API.post("/logs/meal", { name: mealName, items: mealItems, ...totals });
      setMealItems([]);
      toast.success("Makanan tercatat");
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(""); }
  };

  const saveDaily = async () => {
    setBusy("d");
    try {
      const payload = {};
      if (daily.water_ml) payload.water_ml = Number(daily.water_ml);
      if (daily.steps) payload.steps = Number(daily.steps);
      if (daily.sleep_hours) payload.sleep_hours = Number(daily.sleep_hours);
      await API.post("/logs/daily", payload);
      toast.success("Tercatat");
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(""); }
  };

  const saveEnhanced = async () => {
    setBusy("e");
    try {
      await API.post("/enhanced", { entries: enhEntries.filter((x) => x.name.trim()), notes: enhNotes });
      setEnhEntries([{ name: "", note: "" }]);
      setEnhNotes("");
      toast.success("Catatan tersimpan sebagai self-report");
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(""); }
  };

  return (
    <div className="max-w-lg mx-auto space-y-5" data-testid="client-log">
      <h1 className="font-display text-3xl font-extrabold uppercase">Catat</h1>

      <section className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-display text-lg font-bold uppercase flex items-center gap-2 mb-3"><Scale className="w-4 h-4 text-primary" /> Berat Badan</h2>
        <div className="flex gap-2">
          <Input data-testid="log-weight-input" type="number" step="0.1" inputMode="decimal" placeholder="kg hari ini" value={weight} onChange={(e) => setWeight(e.target.value)} className="bg-background h-12 font-num text-lg" />
          <Button data-testid="log-weight-save" onClick={saveWeight} disabled={busy === "w" || !weight} className="h-12">{busy === "w" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Simpan"}</Button>
        </div>
      </section>

      <section className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-display text-lg font-bold uppercase flex items-center gap-2 mb-3"><UtensilsCrossed className="w-4 h-4 text-primary" /> Makanan</h2>
        <div className="flex gap-2 mb-3">
          <Input data-testid="log-meal-name" value={mealName} onChange={(e) => setMealName(e.target.value)} className="bg-background h-12" placeholder="Nama (mis. Makan Siang)" />
        </div>
        <div className="flex gap-2">
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger data-testid="log-food-pick" className="bg-background h-12"><SelectValue placeholder="Cari makanan..." /></SelectTrigger>
            <SelectContent className="max-h-72">{foods.map((f) => <SelectItem key={f.food_id} value={f.food_id}>{f.name} ({f.serving_size}{f.serving_unit}) · {f.calories} kkal</SelectItem>)}</SelectContent>
          </Select>
          <Button data-testid="log-food-add" variant="secondary" onClick={addFood} className="h-12"><Plus className="w-4 h-4" /></Button>
        </div>
        <div className="mt-3 space-y-2">
          {mealItems.map((it, i) => (
            <div key={i} className="flex items-center gap-2 bg-background rounded-md p-2 text-sm">
              <span className="flex-1">{it.name} <span className="text-xs text-muted-foreground">({it.unit})</span></span>
              <Input data-testid={`log-food-qty-${i}`} type="number" step="0.5" min="0.5" value={it.qty} className="h-9 w-16 bg-card font-num"
                onChange={(e) => { const x = [...mealItems]; x[i].qty = Number(e.target.value); setMealItems(x); }} />
              <span className="font-num text-xs text-muted-foreground w-20 text-right">{Math.round(it.calories * it.qty)} kkal</span>
              <button onClick={() => setMealItems(mealItems.filter((_, x) => x !== i))}><Trash2 className="w-4 h-4 text-destructive" /></button>
            </div>
          ))}
        </div>
        {mealItems.length > 0 && (
          <p className="font-num text-xs text-muted-foreground mt-3">Total: {Math.round(totals.calories)} kkal · P {Math.round(totals.protein)}g · C {Math.round(totals.carbs)}g · F {Math.round(totals.fat)}g</p>
        )}
        <Button data-testid="log-meal-save" onClick={saveMeal} disabled={busy === "m" || mealItems.length === 0} className="w-full mt-3 h-12">
          {busy === "m" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Simpan Makanan"}
        </Button>
      </section>

      <section className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-display text-lg font-bold uppercase mb-3">Harian</h2>
        <div className="grid grid-cols-3 gap-2">
          <div><Label className="text-xs flex items-center gap-1"><Droplets className="w-3 h-3" /> Air (ml)</Label><Input data-testid="log-water" type="number" inputMode="numeric" className="mt-1 bg-background h-12" value={daily.water_ml} onChange={(e) => setDaily({ ...daily, water_ml: e.target.value })} /></div>
          <div><Label className="text-xs flex items-center gap-1"><Footprints className="w-3 h-3" /> Langkah</Label><Input data-testid="log-steps" type="number" inputMode="numeric" className="mt-1 bg-background h-12" value={daily.steps} onChange={(e) => setDaily({ ...daily, steps: e.target.value })} /></div>
          <div><Label className="text-xs flex items-center gap-1"><Moon className="w-3 h-3" /> Tidur (jam)</Label><Input data-testid="log-sleep" type="number" step="0.5" inputMode="decimal" className="mt-1 bg-background h-12" value={daily.sleep_hours} onChange={(e) => setDaily({ ...daily, sleep_hours: e.target.value })} /></div>
        </div>
        <Button data-testid="log-daily-save" variant="secondary" onClick={saveDaily} disabled={busy === "d"} className="w-full mt-3 h-12">
          {busy === "d" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Simpan"}
        </Button>
      </section>

      <details className="bg-card border border-border rounded-xl p-5" data-testid="enhanced-section">
        <summary className="font-display text-lg font-bold uppercase cursor-pointer">Catatan Enhanced (Self-Report)</summary>
        <p className="text-[11px] text-amber-200/80 bg-amber-500/10 border border-amber-500/30 rounded-md p-2 mt-2">
          Bagian ini hanya untuk mencatat apa yang Anda gunakan sendiri. Bukan rekomendasi, bukan resep. Coach melihat catatan ini untuk keselamatan. Konsultasikan hal medis ke dokter.
        </p>
        <div className="mt-3 space-y-2">
          {enhEntries.map((en, i) => (
            <div key={i} className="flex gap-2">
              <Input data-testid={`enh-name-${i}`} placeholder="Nama (mis. kreatin, kafein)" className="bg-background" value={en.name}
                onChange={(e) => { const x = [...enhEntries]; x[i].name = e.target.value; setEnhEntries(x); }} />
              <Input data-testid={`enh-note-${i}`} placeholder="Catatan dosis/frekuensi" className="bg-background" value={en.note}
                onChange={(e) => { const x = [...enhEntries]; x[i].note = e.target.value; setEnhEntries(x); }} />
            </div>
          ))}
          <Button data-testid="enh-add-row" size="sm" variant="outline" onClick={() => setEnhEntries([...enhEntries, { name: "", note: "" }])}><Plus className="w-3 h-3" /> Baris</Button>
          <Input data-testid="enh-notes" placeholder="Catatan minggu ini (opsional)" className="bg-background" value={enhNotes} onChange={(e) => setEnhNotes(e.target.value)} />
          <Button data-testid="enh-save" onClick={saveEnhanced} disabled={busy === "e"} className="w-full h-12" variant="secondary">
            {busy === "e" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Simpan Self-Report"}
          </Button>
        </div>
      </details>
    </div>
  );
}
