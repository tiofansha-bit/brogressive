import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { API, fmtErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await API.post("/auth/reset-password", { token: params.get("token") || "", password });
      toast.success("Password berhasil diubah. Silakan masuk.");
      navigate("/login");
    } catch (err) {
      setError(fmtErr(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" data-testid="reset-password-page">
      <div className="w-full max-w-md bg-card border border-border rounded-lg p-6">
        <h1 className="font-display text-2xl font-bold uppercase">Password Baru</h1>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="rp-password">Password Baru (min. 8 karakter)</Label>
            <Input id="rp-password" type="password" data-testid="reset-password-input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="mt-1 bg-background" />
          </div>
          {error && <p data-testid="reset-error" className="text-sm text-destructive">{error}</p>}
          <Button data-testid="reset-submit-button" type="submit" disabled={loading} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Simpan Password"}
          </Button>
        </form>
        <Link to="/login" data-testid="reset-back-to-login" className="block text-center text-xs text-muted-foreground hover:text-primary mt-4">
          Kembali ke halaman masuk
        </Link>
      </div>
    </div>
  );
}
