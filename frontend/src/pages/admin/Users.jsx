import { useEffect, useState, useCallback } from "react";
import { API, fmtErr, fmtDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "client" });
  const [assign, setAssign] = useState({ client_id: "", coach_id: "" });
  const [busy, setBusy] = useState(false);
  const [assignLists, setAssignLists] = useState({ clients: [], coaches: [] });

  const load = useCallback(async () => {
    const params = {};
    if (filter !== "all") params.role = filter;
    if (q) params.q = q;
    const { data } = await API.get("/admin/users", { params });
    setUsers(data);
  }, [filter, q]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!assignOpen) return;
    setAssign({ client_id: "", coach_id: "" });
    (async () => {
      try {
        const [cl, co] = await Promise.all([
          API.get("/admin/users", { params: { role: "client" } }),
          API.get("/admin/users", { params: { role: "coach" } }),
        ]);
        setAssignLists({ clients: cl.data, coaches: co.data });
      } catch (e) { toast.error(fmtErr(e)); }
    })();
  }, [assignOpen]);

  const createUser = async () => {
    setBusy(true);
    try {
      await API.post("/admin/users", form);
      toast.success(`Akun ${form.role} dibuat: ${form.email}`);
      setCreateOpen(false);
      setForm({ name: "", email: "", password: "", role: "client" });
      load();
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  };

  const doAssign = async () => {
    setBusy(true);
    try {
      await API.post("/admin/assignments", assign);
      toast.success("Klien berhasil ditugaskan ke coach");
      setAssignOpen(false);
      load();
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  };

  const toggleStatus = async (u) => {
    try {
      await API.patch(`/admin/users/${u.user_id}`, { status: u.status === "active" ? "suspended" : "active" });
      toast.success("Status diperbarui");
      load();
    } catch (e) { toast.error(fmtErr(e)); }
  };

  return (
    <div data-testid="admin-users-page" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="font-display text-3xl font-extrabold uppercase">Pengguna & Penugasan</h1>
        </div>
        <div className="flex gap-2">
          <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
            <DialogTrigger asChild>
              <Button data-testid="open-assign-dialog" variant="outline"><Link2 className="w-4 h-4" /> Tugaskan Klien</Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle className="font-display uppercase">Tugaskan Klien ke Coach</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Klien</Label>
                  <Select value={assign.client_id} onValueChange={(v) => setAssign({ ...assign, client_id: v })}>
                    <SelectTrigger data-testid="assign-client-select" className="mt-1 bg-background"><SelectValue placeholder="Pilih klien" /></SelectTrigger>
                    <SelectContent>
                      {assignLists.clients.length === 0 && <SelectItem value="__empty" disabled>Belum ada klien</SelectItem>}
                      {assignLists.clients.map((c) => <SelectItem key={c.user_id} value={c.user_id}>{c.name} ({c.email})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Coach</Label>
                  <Select value={assign.coach_id} onValueChange={(v) => setAssign({ ...assign, coach_id: v })}>
                    <SelectTrigger data-testid="assign-coach-select" className="mt-1 bg-background"><SelectValue placeholder="Pilih coach" /></SelectTrigger>
                    <SelectContent>
                      {assignLists.coaches.length === 0 && <SelectItem value="__empty" disabled>Belum ada coach</SelectItem>}
                      {assignLists.coaches.map((c) => <SelectItem key={c.user_id} value={c.user_id}>{c.name} ({c.email})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button data-testid="assign-submit" onClick={doAssign} disabled={busy || !assign.client_id || !assign.coach_id} className="w-full">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Tugaskan"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="open-create-user-dialog"><UserPlus className="w-4 h-4" /> Buat Akun</Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle className="font-display uppercase">Buat Akun Baru</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nama</Label><Input data-testid="create-name" className="mt-1 bg-background" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>Email</Label><Input data-testid="create-email" type="email" className="mt-1 bg-background" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>Password awal (min. 8)</Label><Input data-testid="create-password" className="mt-1 bg-background" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
                <div>
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger data-testid="create-role" className="mt-1 bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client">Klien</SelectItem>
                      <SelectItem value="coach">Coach</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button data-testid="create-user-submit" onClick={createUser} disabled={busy} className="w-full">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buat Akun"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input data-testid="users-search" placeholder="Cari nama/email..." value={q} onChange={(e) => setQ(e.target.value)} className="w-64 bg-card" />
        <div className="flex gap-1">
          {["all", "client", "coach", "admin"].map((r) => (
            <button key={r} data-testid={`filter-${r}`} onClick={() => setFilter(r)}
              className={`px-3 py-2 rounded-md text-xs font-semibold transition-colors ${filter === r ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>
              {r === "all" ? "Semua" : r}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wider">
              <th className="p-3">Nama</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Coach</th><th className="p-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id} data-testid={`user-row-${u.user_id}`} className="border-b border-border/40 hover:bg-accent/30">
                <td className="p-3 font-medium">{u.name}</td>
                <td className="p-3 text-muted-foreground">{u.email}</td>
                <td className="p-3"><Badge variant="secondary" className="uppercase text-[10px]">{u.role}</Badge></td>
                <td className="p-3">
                  <span className={`text-xs font-semibold ${u.status === "active" ? "text-success" : "text-destructive"}`}>{u.status}</span>
                </td>
                <td className="p-3 text-muted-foreground text-xs">{u.assignment?.coach_name || "—"}</td>
                <td className="p-3">
                  <Button data-testid={`toggle-status-${u.user_id}`} size="sm" variant="ghost" onClick={() => toggleStatus(u)}>
                    {u.status === "active" ? "Nonaktifkan" : "Aktifkan"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Tidak ada pengguna.</p>}
      </div>
    </div>
  );
}
