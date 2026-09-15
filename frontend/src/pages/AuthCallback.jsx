import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

export default function AuthCallback() {
  const hasProcessed = useRef(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;
    const hash = window.location.hash;
    const sessionId = new URLSearchParams(hash.replace(/^#/, "")).get("session_id");
    (async () => {
      try {
        await API.post("/auth/google-session", { session_id: sessionId });
        const { data } = await API.get("/auth/me");
        window.history.replaceState(null, "", window.location.pathname);
        setUser(data);
        navigate("/app", { replace: true });
      } catch {
        navigate("/login", { replace: true });
      }
    })();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center" data-testid="auth-callback">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}
