import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API, fmtErr, fmtIDR, fmtDate, uploadFile } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dumbbell, UtensilsCrossed, CreditCard, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

export default function ClientProgram() {
  const { user } = useAuth();
  const [plans, setPlans] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [packages, setPackages] = useState([]);
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ package_id: "", note: "", file: null });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [np, tp, en, pk] = await Promise.all([
      API.get("/plans/nutrition"), API.get("/plans/training"), API.get("/enrollments"), API.get("/packages"),
    ]);
    setPlans({ nutrition: np.data.find((p) => p.status === "active"), training: tp.data.find((p) => p.status === "active") });
    setEnrollments(en.data);
    setPackages(pk.data.filter((p) => p.active));
  };

  useEffect(() => { load(); }, []);

  const submitProof = async () => {
    if (!pay.file || !pay.package_id) { toast.error("Pilih paket dan unggah bukti"); return; }
    setBusy(true);
    try {
      const url = await uploadFile(pay.file);
      const pkg = packages.find((p) => p.package_id === pay.package_id);
      await API.post("/payments/proof", { package_id: pay.package_id, package_name: pkg?.name || "", file_url: url, note: pay.note });
      toast.success("Bukti transfer terkirim. Admin akan memverifikasi.");
      setPayOpen(false);
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  };

  if (!plans) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  const { nutrition: np, training: tp } = plans;
  const t = np?.content?.targets;

  return (
    <div className="max-w-lg mx-auto space-y-5" data-testid="client-program">
      <h1 className="font-display text-3xl font-extrabold uppercase">Program Saya</h1>

      <section className="bg-card border border-border rounded-xl p-5" data-testid="program-nutrition">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl font-bold uppercase flex items-center gap-2"><UtensilsCrossed className="w-4 h-4 text-primary" /> Makanan</h2>
          {np && <Badge variant="secondary">v{np.version}</Badge>}
        </div>
        {!np ? <p className="text-sm text-muted-foreground">Belum ada program makanan aktif.</p> : (
          <>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[["Kalori", t?.calories, "kkal"], ["Protein", t?.protein, "g"], ["Karbo", t?.carbs, "g"], ["Lemak", t?.fat, "g"]].map(([l, v, u]) => (
                <div key={l} className="bg-background rounded-lg p-2">
                  <p className="font-num font-bold">{v}</p>
                  <p className="text-[10px] text-muted-foreground">{l} ({u})</p>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {(np.content?.meals || []).map((m, i) => (
                <details key={i} className="bg-background rounded-lg p-3" data-testid={`program-meal-${i}`}>
                  <summary className="text-sm font-semibold cursor-pointer">{m.name} · <span className="text-muted-foreground font-normal">{m.time}</span></summary>
                  <ul className="mt-2 space-y-1">
                    {m.items.map((it, ii) => <li key={ii} className="text-xs text-muted-foreground">{it.qty}× {it.name} ({it.unit})</li>)}
                  </ul>
                </details>
              ))}
            </div>
            {np.notes && <p className="text-xs text-muted-foreground mt-3 border-t border-border/50 pt-2">Catatan coach: {np.notes}</p>}
          </>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl p-5" data-testid="program-training">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl font-bold uppercase flex items-center gap-2"><Dumbbell className="w-4 h-4 text-primary" /> Latihan</h2>
          {tp && <Badge variant="secondary">v{tp.version} · {tp.content?.duration_weeks} minggu</Badge>}
        </div>
        {!tp ? <p className="text-sm text-muted-foreground">Belum ada program latihan aktif.</p> : (
          <div className="space-y-2">
            {(tp.content?.days || []).map((d, i) => (
              <div key={i} className="bg-background rounded-lg p-3 flex items-center justify-between" data-testid={`program-day-${i}`}>
                <div>
                  <p className="text-sm font-semibold">{d.label}</p>
                  <p className="text-xs text-muted-foreground">{d.exercises.length} latihan</p>
                </div>
                <Link to={`/app/workout?day=${i}`}>
                  <Button data-testid={`start-workout-${i}`} size="sm">Mulai</Button>
                </Link>
              </div>
            ))}
            {tp.notes && <p className="text-xs text-muted-foreground border-t border-border/50 pt-2">Instruksi: {tp.notes}</p>}
          </div>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl p-5" data-testid="program-package">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl font-bold uppercase flex items-center gap-2"><CreditCard className="w-4 h-4 text-primary" /> Paket</h2>
          <Dialog open={payOpen} onOpenChange={setPayOpen}>
            <DialogTrigger asChild><Button data-testid="open-payment-upload" size="sm" variant="outline">Upload Bukti Transfer</Button></DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle className="font-display uppercase">Bukti Pembayaran</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Select value={pay.package_id} onValueChange={(v) => setPay({ ...pay, package_id: v })}>
                  <SelectTrigger data-testid="pay-package" className="bg-background"><SelectValue placeholder="Pilih paket" /></SelectTrigger>
                  <SelectContent>{packages.map((p) => <SelectItem key={p.package_id} value={p.package_id}>{p.name} — {fmtIDR(p.price_idr)}</SelectItem>)}</SelectContent>
                </Select>
                <Input data-testid="pay-note" placeholder="Catatan (opsional)" className="bg-background" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />
                <label className="flex items-center gap-2 bg-background rounded-md p-3 cursor-pointer border border-dashed border-border">
                  <Upload className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{pay.file ? pay.file.name : "Pilih gambar/PDF bukti transfer (maks 8MB)"}</span>
                  <input data-testid="pay-file" type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setPay({ ...pay, file: e.target.files?.[0] })} />
                </label>
                <Button data-testid="pay-submit" onClick={submitProof} disabled={busy} className="w-full">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Kirim Bukti"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        {enrollments.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada paket aktif.</p> : (
          enrollments.map((e) => (
            <div key={e.enrollment_id} className="bg-background rounded-lg p-3 flex justify-between items-center" data-testid={`enrollment-${e.enrollment_id}`}>
              <div>
                <p className="text-sm font-semibold">{e.package_name}</p>
                <p className="text-xs text-muted-foreground">s.d. {fmtDate(e.end_date)}</p>
              </div>
              <Badge variant={e.status === "active" ? "default" : "secondary"}>{e.status}</Badge>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
