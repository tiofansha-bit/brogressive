import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API, fmtErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBrand } from "@/context/BrandContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dumbbell, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { setUser } = useAuth();
  const { appearance } = useBrand();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const url = mode === "login" ? "/auth/login" : "/auth/register";
      const payload = mode === "login" ? { email: form.email, password: form.password } : form;
      const { data } = await API.post(url, payload);
      const me = await API.get("/auth/me");
      setUser(me.data || data);
      toast.success(mode === "login" ? "Selamat datang kembali!" : "Akun berhasil dibuat!");
      navigate("/app");
    } catch (err) {
      setError(fmtErr(err));
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/app";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const googleEnabled = process.env.REACT_APP_GOOGLE_AUTH_ENABLED === "true";
  const resetEnabled = process.env.REACT_APP_PASSWORD_RESET_ENABLED === "true";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" data-testid="login-page">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            {appearance?.logo_url ? (
              <img src={appearance.logo_url} alt="logo" className="h-9 w-9 object-contain rounded" />
            ) : (
              <Dumbbell className="w-7 h-7 text-primary" />
            )}
            <span className="font-display font-bold text-2xl uppercase">{appearance?.brand_name || "BROGRESSIVE"}</span>
          </Link>
          <p className="text-sm text-muted-foreground mt-2">{appearance?.login_welcome || "Selamat datang kembali."}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="grid grid-cols-2 gap-1 bg-secondary rounded-md p-1 mb-6">
            <button type="button" data-testid="login-tab-masuk" onClick={() => setMode("login")}
              className={`py-2 rounded text-sm font-semibold transition-colors ${mode === "login" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              Masuk
            </button>
            <button type="button" data-testid="login-tab-daftar" onClick={() => setMode("register")}
              className={`py-2 rounded text-sm font-semibold transition-colors ${mode === "register" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              Daftar
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <div>
                <Label htmlFor="name">Nama Lengkap</Label>
                <Input id="name" name="name" autoComplete="name" autoFocus data-testid="register-name-input" value={form.name} onChange={set("name")} required className="mt-1 bg-background" />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" data-testid="login-email-input" value={form.email} onChange={set("email")} required className="mt-1 bg-background" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} data-testid="login-password-input" value={form.password} onChange={set("password")} required minLength={8} className="mt-1 bg-background" />
              {mode === "register" && <p className="text-xs text-muted-foreground mt-1">Minimal 8 karakter.</p>}
            </div>
            {error && <p data-testid="login-error" className="text-sm text-destructive">{error}</p>}
            <Button data-testid="login-submit-button" type="submit" disabled={loading} className="w-full h-11 font-bold uppercase tracking-wider">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "login" ? "Masuk" : "Buat Akun"}
            </Button>
          </form>

          {googleEnabled && (
            <>
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
                <div className="relative text-center"><span className="bg-card px-2 text-xs text-muted-foreground">atau</span></div>
              </div>
              <Button data-testid="google-login-button" variant="outline" onClick={googleLogin} className="w-full h-11">
                Lanjutkan dengan Google
              </Button>
            </>
          )}

          {mode === "login" && resetEnabled && (
            <p className="text-center mt-4">
              <Link to="/forgot-password" data-testid="forgot-password-link" className="text-xs text-muted-foreground hover:text-primary transition-colors">
                Lupa password?
              </Link>
            </p>
          )}
        </div>
        <p className="text-center text-[11px] text-muted-foreground mt-6">
          Coaching bukan pengganti layanan dokter, ahli gizi klinis, atau layanan darurat.
        </p>
      </div>
    </div>
  );
}
