import { useEffect, useState, useCallback } from "react";
import { API, fmtErr, fmtDate, fmtIDR } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";

export default function AdminPackages() {
  const [packages, setPackages] = useState([]);
  const [payments, setPayments] = useState([]);
  const [clients, setClients] = useState([]);
  const [open, setOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", duration_weeks: 12, price_idr: 0, active: true });
  const [enroll, setEnroll] = useState({ client_id: "", package_id: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, pay, u] = await Promise.all([
      API.get("/packages"), API.get("/admin/payments"), API.get("/admin/users", { params: { role: "client" } }),
    ]);
    setPackages(p.data);
    setPayments(pay.data);
    setClients(u.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      await API.post("/packages", form);
      toast.success("Paket dibuat");
      setOpen(false);
      load();
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  };

  const doEnroll = async () => {
    setBusy(true);
    try {
      await API.post("/admin/enrollments", enroll);
      toast.success("Klien didaftarkan ke paket");
      setEnrollOpen(false);
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  };

  const review = async (proof_id, status) => {
    try {
      await API.patch(`/admin/payments/${proof_id}`, { status });
      toast.success(`Pembayaran ${status}`);
      load();
    } catch (e) { toast.error(fmtErr(e)); }
  };

  return (
    <div data-testid="admin-packages-page" className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="font-display text-3xl font-extrabold uppercase">Paket & Pembayaran</h1>
        </div>
        <div className="flex gap-2">
          <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
            <DialogTrigger asChild><Button data-testid="open-enroll-dialog" variant="outline">Daftarkan Klien</Button></DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle className="font-display uppercase">Enrollment Paket</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Klien</Label>
                  <Select value={enroll.client_id} onValueChange={(v) => setEnroll({ ...enroll, client_id: v })}>
                    <SelectTrigger data-testid="enroll-client" className="mt-1 bg-background"><SelectValue placeholder="Pilih klien" /></SelectTrigger>
                    <SelectContent>{clients.map((c) => <SelectItem key={c.user_id} value={c.user_id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Paket</Label>
                  <Select value={enroll.package_id} onValueChange={(v) => setEnroll({ ...enroll, package_id: v })}>
                    <SelectTrigger data-testid="enroll-package" className="mt-1 bg-background"><SelectValue placeholder="Pilih paket" /></SelectTrigger>
                    <SelectContent>{packages.map((p) => <SelectItem key={p.package_id} value={p.package_id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button data-testid="enroll-submit" onClick={doEnroll} disabled={busy || !enroll.client_id || !enroll.package_id} className="w-full">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Daftarkan"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button data-testid="open-create-package"><Plus className="w-4 h-4" /> Paket Baru</Button></DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle className="font-display uppercase">Paket Baru</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nama</Label><Input data-testid="pkg-name" className="mt-1 bg-background" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>Deskripsi</Label><Input data-testid="pkg-desc" className="mt-1 bg-background" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Durasi (minggu)</Label><Input data-testid="pkg-duration" type="number" className="mt-1 bg-background" value={form.duration_weeks} onChange={(e) => setForm({ ...form, duration_weeks: e.target.value })} /></div>
                  <div><Label>Harga (IDR)</Label><Input data-testid="pkg-price" type="number" className="mt-1 bg-background" value={form.price_idr} onChange={(e) => setForm({ ...form, price_idr: e.target.value })} /></div>
                </div>
                <Button data-testid="pkg-submit" onClick={create} disabled={busy} className="w-full">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buat Paket"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {packages.map((p) => (
          <div key={p.package_id} data-testid={`package-${p.package_id}`} className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-start justify-between">
              <h3 className="font-display text-lg font-bold uppercase">{p.name}</h3>
              <Badge variant={p.active ? "default" : "secondary"}>{p.active ? "Aktif" : "Nonaktif"}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
            <p className="font-num text-xl font-bold mt-3 text-primary">{fmtIDR(p.price_idr)}</p>
            <p className="text-xs text-muted-foreground">{p.duration_weeks} minggu · check-in {p.checkin_frequency}</p>
            <div className="flex items-center gap-2 mt-3">
              <Switch data-testid={`pkg-toggle-${p.package_id}`} checked={p.active} onCheckedChange={(v) => API.patch(`/packages/${p.package_id}`, { active: v }).then(load)} />
              <span className="text-xs text-muted-foreground">Aktif</span>
            </div>
          </div>
        ))}
      </div>

      <section className="bg-card border border-border rounded-lg">
        <div className="p-4 border-b border-border"><h2 className="font-display text-xl font-bold uppercase">Bukti Transfer Masuk</h2></div>
        <div className="divide-y divide-border/50">
          {payments.length === 0 && <p className="p-4 text-sm text-muted-foreground">Belum ada bukti pembayaran.</p>}
          {payments.map((p) => (
            <div key={p.proof_id} data-testid={`payment-${p.proof_id}`} className="p-4 flex flex-wrap items-center gap-4 justify-between">
              <div>
                <p className="font-semibold text-sm">{p.client_name} <span className="text-muted-foreground font-normal">· {p.package_name || "Paket"}</span></p>
                <p className="text-xs text-muted-foreground">{fmtDate(p.created_at)} {p.note && `· ${p.note}`}</p>
                {p.file_url && <a data-testid={`payment-proof-link-${p.proof_id}`} href={`${process.env.REACT_APP_BACKEND_URL}${p.file_url}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Lihat bukti</a>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={p.status === "verified" ? "default" : p.status === "rejected" ? "destructive" : "secondary"} className="uppercase text-[10px]">{p.status}</Badge>
                {p.status === "pending" && (<>
                  <Button data-testid={`payment-verify-${p.proof_id}`} size="sm" onClick={() => review(p.proof_id, "verified")}><Check className="w-3 h-3" /></Button>
                  <Button data-testid={`payment-reject-${p.proof_id}`} size="sm" variant="destructive" onClick={() => review(p.proof_id, "rejected")}><X className="w-3 h-3" /></Button>
                </>)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
