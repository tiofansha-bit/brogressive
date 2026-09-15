import { useState } from "react";
import { Link } from "react-router-dom";
import { API, fmtErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await API.post("/auth/forgot-password", { email });
    } catch {}
    setDone(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" data-testid="forgot-password-page">
      <div className="w-full max-w-md bg-card border border-border rounded-lg p-6">
        <h1 className="font-display text-2xl font-bold uppercase">Reset Password</h1>
        {done ? (
          <p data-testid="forgot-confirmation" className="text-sm text-muted-foreground mt-4">
            Jika email terdaftar, link reset telah dikirim. Periksa kotak masuk Anda.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            <div>
              <Label htmlFor="fp-email">Email</Label>
              <Input id="fp-email" type="email" data-testid="forgot-email-input" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1 bg-background" />
            </div>
            <Button data-testid="forgot-submit-button" type="submit" disabled={loading} className="w-full">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Kirim Link Reset"}
            </Button>
          </form>
        )}
        <Link to="/login" data-testid="back-to-login" className="block text-center text-xs text-muted-foreground hover:text-primary mt-4">
          Kembali ke halaman masuk
        </Link>
      </div>
    </div>
  );
}
