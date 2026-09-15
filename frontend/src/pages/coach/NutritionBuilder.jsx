import { useEffect, useState, useCallback } from "react";
import { API, fmtErr, fmtDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Calculator, Loader2, Rocket, FilePlus, Archive } from "lucide-react";
import { toast } from "sonner";

const EMPTY_TARGETS = { calories: 2000, protein: 150, carbs: 200, fat: 65, fiber: 25, water_ml: 2500 };
const ACTIVITY = [
  { v: "1.2", l: "Sedentari (kerja duduk)" }, { v: "1.375", l: "Ringan (1-3x/minggu)" },
  { v: "1.55", l: "Sedang (3-5x/minggu)" }, { v: "1.725", l: "Berat (6-7x/minggu)" }, { v: "1.9", l: "Sangat berat (atlet)" },
];

export default function NutritionBuilder({ clientId }) {
  const [plans, setPlans] = useState([]);
  const [foods, setFoods] = useState([]);
  const [sel, setSel] = useState(null);
  const [calc, setCalc] = useState({ sex: "male", age: 28, weight: 75, height: 170, activity: "1.55", goal: "cut" });
  const [foodPick, setFoodPick] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, f] = await Promise.all([API.get("/plans/nutrition", { params: { client_id: clientId } }), API.get("/foods")]);
    setPlans(p.data);
    setFoods(f.data);
    if (!sel && p.data.length) setSel(p.data[0]);
  }, [clientId, sel]);

  useEffect(() => { load(); }, [clientId]); // eslint-disable-line

  const createPlan = async () => {
    try {
      const { data } = await API.post("/plans/nutrition", { client_id: clientId, name: "Nutrition Plan", content: { targets: EMPTY_TARGETS, meals: [] } });
      setPlans([data, ...plans]);
      setSel(data);
      toast.success("Draft plan dibuat");
    } catch (e) { toast.error(fmtErr(e)); }
  };

  const save = async () => {
    setBusy(true);
    try {
      await API.put(`/plans/nutrition/${sel.plan_id}`, { name: sel.name, content: sel.content, start_date: sel.start_date, end_date: sel.end_date, notes: sel.notes, change_reason: sel.change_reason });
      toast.success("Draft tersimpan");
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  };

  const publish = async (confirm = false) => {
    setBusy(true);
    try {
      await API.post(`/plans/nutrition/${sel.plan_id}/publish`, { confirm });
      toast.success("Plan dipublish — klien sekarang melihat versi ini");
      load();
    } catch (e) {
      if (e?.response?.status === 409) {
        if (window.confirm(e.response.data.detail + "\n\nTetap publish?")) publish(true);
      } else toast.error(fmtErr(e));
    } finally { setBusy(false); }
  };

  const revise = async () => {
    try {
      const { data } = await API.post(`/plans/nutrition/${sel.plan_id}/revise`, { change_reason: sel.change_reason || "" });
      toast.success(`Versi ${data.version} dibuat sebagai draft`);
      setPlans([data, ...plans]);
      setSel(data);
    } catch (e) { toast.error(fmtErr(e)); }
  };

  const archive = async () => {
    try { await API.post(`/plans/nutrition/${sel.plan_id}/archive`); toast.success("Plan diarsipkan"); setSel(null); load(); }
    catch (e) { toast.error(fmtErr(e)); }
  };

  // Calculator
  const bmr = calc.sex === "male"
    ? 10 * Number(calc.weight) + 6.25 * Number(calc.height) - 5 * Number(calc.age) + 5
    : 10 * Number(calc.weight) + 6.25 * Number(calc.height) - 5 * Number(calc.age) - 161;
  const tdee = bmr * Number(calc.activity);
  const goalCal = calc.goal === "cut" ? tdee - 500 : calc.goal === "bulk" ? tdee + 300 : tdee;
  const sugProtein = Math.round(2.4 * Number(calc.weight));
  const sugFat = Math.round((goalCal * 0.25) / 9);
  const sugCarbs = Math.round((goalCal - sugProtein * 4 - sugFat * 9) / 4);

  const applyCalc = () => {
    setSel({ ...sel, content: { ...sel.content, targets: { ...sel.content.targets, calories: Math.round(goalCal), protein: sugProtein, carbs: Math.max(0, sugCarbs), fat: sugFat } } });
    toast.success("Estimasi diterapkan ke target — tinjau sebelum publish");
  };

  const t = sel?.content?.targets || EMPTY_TARGETS;
  const macroCal = Math.round(t.protein * 4 + t.carbs * 4 + t.fat * 9);
  const diffPct = t.calories ? Math.round(Math.abs(macroCal - t.calories) / t.calories * 100) : 0;

  const setTarget = (k, v) => setSel({ ...sel, content: { ...sel.content, targets: { ...t, [k]: Number(v) } } });
  const meals = sel?.content?.meals || [];
  const setMeals = (m) => setSel({ ...sel, content: { ...sel.content, meals: m } });

  const addMeal = () => setMeals([...meals, { name: `Meal ${meals.length + 1}`, time: "12:00", items: [] }]);
  const addItem = (mi) => {
    const fid = foodPick[mi];
    const food = foods.find((f) => f.food_id === fid);
    if (!food) return;
    const m = [...meals];
    m[mi].items.push({ food_id: food.food_id, name: food.name, qty: 1, unit: `${food.serving_size} ${food.serving_unit}`, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat });
    setMeals(m);
  };
  const mealTotals = (m) => m.items.reduce((s, i) => ({ calories: s.calories + i.calories * i.qty, protein: s.protein + i.protein * i.qty, carbs: s.carbs + i.carbs * i.qty, fat: s.fat + i.fat * i.qty }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const editable = sel && (sel.status === "draft" || sel.status === "scheduled");

  return (
    <div className="space-y-4" data-testid="nutrition-builder">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 flex-wrap">
          {plans.map((p) => (
            <button key={p.plan_id} data-testid={`np-version-${p.plan_id}`} onClick={() => setSel(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 ${sel?.plan_id === p.plan_id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>
              v{p.version} <Badge variant="secondary" className="text-[9px] uppercase">{p.status}</Badge>
            </button>
          ))}
        </div>
        <Button data-testid="np-create" size="sm" onClick={createPlan}><FilePlus className="w-3 h-3" /> Plan Baru</Button>
      </div>

      {!sel && <p className="text-sm text-muted-foreground bg-card border border-border rounded-lg p-6 text-center">Belum ada plan nutrisi. Buat plan pertama untuk klien ini.</p>}

      {sel && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-40"><Label>Nama Plan</Label><Input data-testid="np-name" disabled={!editable} className="mt-1 bg-background" value={sel.name} onChange={(e) => setSel({ ...sel, name: e.target.value })} /></div>
                <div><Label>Mulai</Label><Input data-testid="np-start" type="date" disabled={!editable} className="mt-1 bg-background" value={sel.start_date || ""} onChange={(e) => setSel({ ...sel, start_date: e.target.value })} /></div>
                <div><Label>Selesai</Label><Input data-testid="np-end" type="date" disabled={!editable} className="mt-1 bg-background" value={sel.end_date || ""} onChange={(e) => setSel({ ...sel, end_date: e.target.value })} /></div>
              </div>
              <div><Label>Alasan perubahan (wajib diisi saat revisi)</Label><Input data-testid="np-reason" disabled={!editable} className="mt-1 bg-background" value={sel.change_reason || ""} onChange={(e) => setSel({ ...sel, change_reason: e.target.value })} /></div>
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-display text-lg font-bold uppercase mb-3">Target Harian</h3>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {[["calories", "Kkal"], ["protein", "Protein g"], ["carbs", "Karbo g"], ["fat", "Lemak g"], ["fiber", "Serat g"], ["water_ml", "Air ml"]].map(([k, l]) => (
                  <div key={k}><Label className="text-xs">{l}</Label><Input data-testid={`np-target-${k}`} type="number" disabled={!editable} className="mt-1 bg-background font-num" value={t[k]} onChange={(e) => setTarget(k, e.target.value)} /></div>
                ))}
              </div>
              <p data-testid="np-macro-check" className={`text-xs mt-3 font-num ${diffPct > 10 ? "text-amber-500" : "text-success"}`}>
                Kalori dari makro: {macroCal} kkal vs target {t.calories} kkal (selisih {diffPct}%){diffPct > 10 && " — di atas 10%, akan diminta konfirmasi saat publish"}
              </p>
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-lg font-bold uppercase">Meal Plan</h3>
                {editable && <Button data-testid="np-add-meal" size="sm" variant="outline" onClick={addMeal}><Plus className="w-3 h-3" /> Meal</Button>}
              </div>
              {meals.length === 0 && <p className="text-xs text-muted-foreground">Belum ada meal. Tambahkan meal dengan makanan dari database (makanan Indonesia).</p>}
              <div className="space-y-3">
                {meals.map((m, mi) => {
                  const tot = mealTotals(m);
                  return (
                    <div key={mi} className="bg-background rounded-md p-3" data-testid={`np-meal-${mi}`}>
                      <div className="flex gap-2 items-center">
                        <Input disabled={!editable} value={m.name} className="h-8 bg-card font-semibold" onChange={(e) => { const x = [...meals]; x[mi].name = e.target.value; setMeals(x); }} />
                        <Input disabled={!editable} type="time" value={m.time} className="h-8 w-28 bg-card" onChange={(e) => { const x = [...meals]; x[mi].time = e.target.value; setMeals(x); }} />
                        {editable && <Button size="icon" variant="ghost" onClick={() => setMeals(meals.filter((_, i) => i !== mi))}><Trash2 className="w-3 h-3 text-destructive" /></Button>}
                      </div>
                      <div className="mt-2 space-y-1">
                        {m.items.map((it, ii) => (
                          <div key={ii} className="flex items-center gap-2 text-xs">
                            <span className="flex-1">{it.name} <span className="text-muted-foreground">({it.unit})</span></span>
                            <Input disabled={!editable} type="number" step="0.5" min="0.5" value={it.qty} className="h-7 w-16 bg-card font-num"
                              onChange={(e) => { const x = [...meals]; x[mi].items[ii].qty = Number(e.target.value); setMeals(x); }} />
                            <span className="font-num text-muted-foreground w-24 text-right">{Math.round(it.calories * it.qty)} kkal</span>
                            {editable && <button onClick={() => { const x = [...meals]; x[mi].items.splice(ii, 1); setMeals(x); }}><Trash2 className="w-3 h-3 text-destructive" /></button>}
                          </div>
                        ))}
                      </div>
                      {editable && (
                        <div className="flex gap-2 mt-2">
                          <Select value={foodPick[mi] || ""} onValueChange={(v) => setFoodPick({ ...foodPick, [mi]: v })}>
                            <SelectTrigger data-testid={`np-food-pick-${mi}`} className="h-8 bg-card text-xs"><SelectValue placeholder="Tambah makanan..." /></SelectTrigger>
                            <SelectContent className="max-h-64">{foods.map((f) => <SelectItem key={f.food_id} value={f.food_id}>{f.name} ({f.serving_size}{f.serving_unit})</SelectItem>)}</SelectContent>
                          </Select>
                          <Button data-testid={`np-food-add-${mi}`} size="sm" variant="secondary" onClick={() => addItem(mi)}>+</Button>
                        </div>
                      )}
                      <p className="text-[10px] font-num text-muted-foreground mt-2">Total: {Math.round(tot.calories)} kkal · P{Math.round(tot.protein)} C{Math.round(tot.carbs)} F{Math.round(tot.fat)}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {editable && (<>
                <Button data-testid="np-save" variant="outline" onClick={save} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Simpan Draft"}</Button>
                <Button data-testid="np-publish" onClick={() => publish(false)} disabled={busy} className="glow-primary"><Rocket className="w-4 h-4" /> Publish</Button>
              </>)}
              {sel.status === "active" && <Button data-testid="np-revise" onClick={revise}>Buat Revisi (v{sel.version + 1})</Button>}
              {sel.status !== "archived" && <Button data-testid="np-archive" variant="ghost" onClick={archive}><Archive className="w-4 h-4" /></Button>}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4 space-y-3 self-start lg:sticky lg:top-20">
            <h3 className="font-display text-lg font-bold uppercase flex items-center gap-2"><Calculator className="w-4 h-4 text-primary" /> Kalkulator (Estimasi)</h3>
            <p className="text-[11px] text-muted-foreground">Mifflin-St Jeor. Angka ini estimasi awal — coach wajib mengonfirmasi angka final.</p>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Gender</Label>
                <Select value={calc.sex} onValueChange={(v) => setCalc({ ...calc, sex: v })}>
                  <SelectTrigger data-testid="calc-sex" className="mt-1 h-9 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="male">Pria</SelectItem><SelectItem value="female">Wanita</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Usia</Label><Input data-testid="calc-age" type="number" className="mt-1 h-9 bg-background" value={calc.age} onChange={(e) => setCalc({ ...calc, age: e.target.value })} /></div>
              <div><Label className="text-xs">Berat kg</Label><Input data-testid="calc-weight" type="number" className="mt-1 h-9 bg-background" value={calc.weight} onChange={(e) => setCalc({ ...calc, weight: e.target.value })} /></div>
              <div><Label className="text-xs">Tinggi cm</Label><Input data-testid="calc-height" type="number" className="mt-1 h-9 bg-background" value={calc.height} onChange={(e) => setCalc({ ...calc, height: e.target.value })} /></div>
            </div>
            <div><Label className="text-xs">Aktivitas</Label>
              <Select value={calc.activity} onValueChange={(v) => setCalc({ ...calc, activity: v })}>
                <SelectTrigger data-testid="calc-activity" className="mt-1 h-9 bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>{ACTIVITY.map((a) => <SelectItem key={a.v} value={a.v}>{a.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Goal</Label>
              <Select value={calc.goal} onValueChange={(v) => setCalc({ ...calc, goal: v })}>
                <SelectTrigger data-testid="calc-goal" className="mt-1 h-9 bg-background"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="cut">Fat loss (-500 kkal)</SelectItem><SelectItem value="maintain">Maintenance</SelectItem><SelectItem value="bulk">Muscle gain (+300 kkal)</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="bg-background rounded-md p-3 font-num text-xs space-y-1">
              <p>BMR (est): <b>{Math.round(bmr)}</b> kkal</p>
              <p>TDEE (est): <b>{Math.round(tdee)}</b> kkal</p>
              <p className="text-primary">Target: <b>{Math.round(goalCal)}</b> kkal</p>
              <p className="text-muted-foreground">P {sugProtein}g · C {Math.max(0, sugCarbs)}g · F {sugFat}g</p>
            </div>
            <Button data-testid="calc-apply" size="sm" variant="secondary" onClick={applyCalc} disabled={!editable} className="w-full">Terapkan ke Target</Button>
          </div>
        </div>
      )}
    </div>
  );
}
