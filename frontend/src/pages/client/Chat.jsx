import { useEffect, useState } from "react";
import { API } from "@/lib/api";
import ChatThread from "@/components/ChatThread";
import { Loader2 } from "lucide-react";

export default function ClientChat() {
  const [threads, setThreads] = useState(null);

  useEffect(() => {
    API.get("/messages/threads").then((r) => setThreads(r.data)).catch(() => setThreads([]));
  }, []);

  if (!threads) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const coach = threads[0]?.partner;

  return (
    <div className="max-w-lg mx-auto" data-testid="client-chat">
      <h1 className="font-display text-3xl font-extrabold uppercase mb-1">Coach</h1>
      {!coach ? (
        <div className="bg-card border border-border rounded-xl p-6 text-center mt-4">
          <p className="text-sm text-muted-foreground">Anda belum terhubung dengan coach. Admin akan menugaskan coach untuk Anda.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-3">Coach biasanya merespons dalam 1×24 jam.</p>
          <ChatThread partnerId={coach.user_id} partnerName={coach.name} />
        </>
      )}
    </div>
  );
}
