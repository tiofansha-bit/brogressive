import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { API } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const check = useCallback(async () => {
    try {
      const { data } = await API.get("/auth/me");
      setUser(data);
    } catch {
      setUser(false);
    }
  }, []);

  useEffect(() => {
    // CRITICAL: OAuth callback must exchange session_id before /me runs
    if (window.location.hash?.includes("session_id=")) return;
    check();
  }, [check]);

  const logout = useCallback(async () => {
    try {
      await API.post("/auth/logout");
    } catch {}
    setUser(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, logout, refresh: check }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
