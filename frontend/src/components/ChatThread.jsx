import { useEffect, useRef, useState, useCallback } from "react";
import { API, fmtErr, fmtDate } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ChatThread({ partnerId, partnerName }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const load = useCallback(async () => {
    if (!partnerId) return;
    try {
      const { data } = await API.get(`/messages/${partnerId}`);
      setMessages(data);
    } catch {}
  }, [partnerId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await API.post("/messages", { to_id: partnerId, text });
      setText("");
      load();
    } catch (e) { toast.error(fmtErr(e)); } finally { setSending(false); }
  };

  return (
    <div className="flex flex-col h-[60vh]" data-testid="chat-thread">
      {partnerName && <div className="pb-2 border-b border-border mb-2"><p className="text-sm font-semibold">{partnerName}</p></div>}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {messages.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Belum ada pesan. Mulai percakapan.</p>}
        {messages.map((m) => {
          const mine = m.from_id === user.user_id;
          return (
            <div key={m.message_id} data-testid={`msg-${m.message_id}`} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-card border border-border"}`}>
                <p>{m.text}</p>
                <p className={`text-[10px] mt-1 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {fmtDate(m.created_at)} {new Date(m.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                  {mine && (m.read ? " · dibaca" : "")}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 pt-3 border-t border-border mt-2">
        <Input data-testid="chat-input" value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Tulis pesan..." className="bg-background h-12" />
        <Button data-testid="chat-send" onClick={send} disabled={sending || !text.trim()} className="h-12 px-5">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
