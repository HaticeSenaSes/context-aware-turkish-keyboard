import { useState, useEffect, useRef } from "react";

const CONTEXTS = {
  arkadas: { label: "Arkadaş", emoji: "👫", color: "#25D366", light: "#E8F5E9", dark: "#1a8f45" },
  hoca: { label: "Hoca", emoji: "👨‍🏫", color: "#2196F3", light: "#E3F2FD", dark: "#1565C0" },
  is: { label: "İş", emoji: "💼", color: "#9C27B0", light: "#F3E5F5", dark: "#6A1B9A" },
  spor: { label: "Spor", emoji: "⚽", color: "#FF5722", light: "#FBE9E7", dark: "#BF360C" },
  gundelik: { label: "Gündelik", emoji: "☀️", color: "#FF9800", light: "#FFF3E0", dark: "#E65100" },
};

const API = "http://localhost:8000";

const EXAMPLES = {
  arkadas: ["lan bugün ne yapıyorsun", "kanka akşam buluşalım", "ya çok komik oldu"],
  hoca: ["Hocam iyi günler", "Ödev hakkında sorum var", "Hocam randevu alabilir miyim"],
  is: ["Toplantı saatini değiştirmemiz gerekiyor", "Raporu teslim edebilir misiniz"],
  spor: ["Maçı izledin mi", "Takım çok kötü oynadı", "Gol attı sonunda"],
  gundelik: ["Bugün hava çok güzel", "Akşam ne yapıyorsun", "Kahve içelim mi"],
};

export default function App() {
  const [context, setContext] = useState("arkadas");
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [mode, setMode] = useState("chat");
  const [compareResult, setCompareResult] = useState(null);
  const inputRef = useRef(null);
  const chatRef = useRef(null);
  const ctx = CONTEXTS[context];

  useEffect(() => {
    if (!text.trim()) { setSuggestions([]); return; }
    const t = setTimeout(fetchSuggestions, 200);
    return () => clearTimeout(t);
  }, [text, context]);

  useEffect(() => {
    chatRef.current?.scrollTo(0, chatRef.current.scrollHeight);
  }, [messages]);

  async function fetchSuggestions() {
    try {
      const res = await fetch(`${API}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context, n_suggestions: 3 }),
      });
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch { setSuggestions([]); }
  }

  async function fetchCompare() {
    if (!text.trim()) return;
    try {
      const res = await fetch(`${API}/compare?text=${encodeURIComponent(text)}`);
      const data = await res.json();
      setCompareResult(data.context_predictions);
    } catch { setCompareResult(null); }
  }

  function acceptSuggestion(word) {
    const parts = text.split(" ");
    parts[parts.length - 1] = word;
    setText(parts.join(" ") + " ");
    inputRef.current?.focus();
  }

  function sendMessage() {
    if (!text.trim()) return;
    setMessages(prev => [...prev, {
      text, context,
      time: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    }]);
    setText("");
    setSuggestions([]);
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#ECE5DD", fontFamily: "Arial, sans-serif" }}>

      {/* HEADER */}
      <div style={{ background: ctx.color, color: "white", padding: "0 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
              {ctx.emoji}
            </div>
            <div>
              <div style={{ fontWeight: "bold", fontSize: 16 }}>Bağlam Duyarlı Öneri Sistemi</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>{ctx.label} bağlamı aktif</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {["chat", "compare"].map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                padding: "6px 14px", borderRadius: 16, border: "none", fontSize: 12,
                fontWeight: "bold", cursor: "pointer",
                background: mode === m ? "rgba(255,255,255,0.3)" : "transparent",
                color: "white",
              }}>
                {m === "chat" ? "💬 Chat" : "🔍 Karşılaştır"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CONTEXT SELECTOR */}
      <div style={{ background: "white", borderBottom: "1px solid #ddd", padding: "8px 16px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", gap: 8, overflowX: "auto" }}>
          {Object.entries(CONTEXTS).map(([key, val]) => (
            <button key={key} onClick={() => { setContext(key); setCompareResult(null); }} style={{
              padding: "6px 14px", borderRadius: 16, whiteSpace: "nowrap",
              border: `2px solid ${context === key ? val.color : "#E0E0E0"}`,
              background: context === key ? val.light : "white",
              color: context === key ? val.dark : "#666",
              fontWeight: context === key ? "bold" : "normal",
              cursor: "pointer", fontSize: 13,
            }}>
              {val.emoji} {val.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "chat" ? (
        <>
          {/* CHAT AREA */}
          <div ref={chatRef} style={{ flex: 1, overflowY: "auto", padding: 16, maxWidth: 720, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <span style={{ background: "rgba(255,255,255,0.7)", padding: "4px 12px", borderRadius: 12, fontSize: 12, color: "#666" }}>
                {ctx.emoji} {ctx.label} bağlamı — sistem bu bağlama özel öneriler sunuyor
              </span>
            </div>

            {messages.length === 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: "#888", textAlign: "center", marginBottom: 8 }}>Örnek cümleler:</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                  {EXAMPLES[context].map((ex, i) => (
                    <button key={i} onClick={() => { setText(ex); inputRef.current?.focus(); }} style={{
                      padding: "6px 12px", borderRadius: 16,
                      border: `1px solid ${ctx.color}`, background: "white",
                      color: ctx.dark, cursor: "pointer", fontSize: 13,
                    }}>
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <div style={{ maxWidth: "70%" }}>
                  <div style={{
                    background: CONTEXTS[msg.context].light,
                    border: `1px solid ${CONTEXTS[msg.context].color}`,
                    borderRadius: "12px 12px 2px 12px",
                    padding: "8px 12px",
                  }}>
                    <div style={{ fontSize: 14, color: "#1a1a1a" }}>{msg.text}</div>
                    <div style={{ fontSize: 11, color: "#888", textAlign: "right", marginTop: 2 }}>
                      {CONTEXTS[msg.context].emoji} {CONTEXTS[msg.context].label} · {msg.time}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* SUGGESTION BAR */}
          {suggestions.length > 0 && (
            <div style={{ background: "#F0F0F0", borderTop: "1px solid #ddd", padding: "8px 16px" }}>
              <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", gap: 1 }}>
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => acceptSuggestion(s)} style={{
                    flex: 1, padding: "8px 4px", border: "none",
                    borderRight: i < suggestions.length - 1 ? "1px solid #ddd" : "none",
                    background: "transparent", color: "#333", cursor: "pointer", fontSize: 14, fontWeight: "500",
                  }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* INPUT */}
          <div style={{ background: "#F0F0F0", padding: "8px 16px", borderTop: "1px solid #ddd" }}>
            <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ flex: 1, background: "white", borderRadius: 24, padding: "8px 16px", display: "flex", alignItems: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
                <input
                  ref={inputRef}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendMessage()}
                  placeholder={`${ctx.emoji} ${ctx.label} bağlamında yaz...`}
                  style={{ flex: 1, border: "none", outline: "none", fontSize: 15, color: "#333", background: "transparent" }}
                />
              </div>
              <button onClick={sendMessage} style={{
                width: 44, height: 44, borderRadius: "50%", border: "none",
                background: ctx.color, color: "white", cursor: "pointer", fontSize: 18,
              }}>
                ➤
              </button>
            </div>
          </div>
        </>
      ) : (
        /* COMPARE MODE */
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{ background: "white", borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <p style={{ margin: "0 0 12px", fontWeight: "bold", color: "#333" }}>Bir kelime veya cümle gir:</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && fetchCompare()}
                  placeholder="Örnek: hocam, kanka, toplantı..."
                  style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd", fontSize: 15, outline: "none" }}
                />
                <button onClick={fetchCompare} style={{
                  padding: "10px 20px", background: ctx.color, color: "white",
                  border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold",
                }}>
                  Karşılaştır
                </button>
              </div>
            </div>

            {compareResult && (
              <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                <p style={{ fontWeight: "bold", color: "#333", marginBottom: 16 }}>"{text}" için bağlam karşılaştırması:</p>
                {Object.entries(compareResult).map(([ctx_key, preds]) => (
                  <div key={ctx_key} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 14px", borderRadius: 10,
                    background: CONTEXTS[ctx_key].light, marginBottom: 8,
                  }}>
                    <span style={{ fontSize: 22 }}>{CONTEXTS[ctx_key].emoji}</span>
                    <span style={{ fontWeight: "bold", color: CONTEXTS[ctx_key].dark, minWidth: 80, fontSize: 14 }}>
                      {CONTEXTS[ctx_key].label}
                    </span>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {preds.length > 0 ? preds.map((p, i) => (
                        <span key={i} style={{
                          padding: "4px 12px", borderRadius: 14,
                          background: "white", border: `1px solid ${CONTEXTS[ctx_key].color}`,
                          color: CONTEXTS[ctx_key].dark, fontSize: 13, fontWeight: "bold",
                        }}>{p}</span>
                      )) : <span style={{ color: "#bbb", fontSize: 13 }}>öneri yok</span>}
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 16, padding: "12px 16px", background: "#E8EAF6", borderRadius: 8, borderLeft: "4px solid #3F51B5" }}>
                  <p style={{ margin: 0, fontSize: 13, color: "#3F51B5" }}>
                    <strong>Araştırma bağlantısı:</strong> WhatsApp araştırması sistemin bağlama duyarsız olduğunu kanıtladı. Bu prototip bağlama duyarlı alternatifi gösteriyor.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}