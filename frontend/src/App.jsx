import { useState, useEffect, useRef } from "react";

const CONTEXTS = {
  arkadas: { label: "Arkadaş", emoji: "👫", color: "#25D366", light: "#E8F5E9", dark: "#1a8f45" },
  hoca: { label: "Hoca", emoji: "👨‍🏫", color: "#2196F3", light: "#E3F2FD", dark: "#1565C0" },
  is: { label: "İş", emoji: "💼", color: "#9C27B0", light: "#F3E5F5", dark: "#6A1B9A" },
  spor: { label: "Spor", emoji: "⚽", color: "#FF5722", light: "#FBE9E7", dark: "#BF360C" },
  gundelik: { label: "Gündelik", emoji: "☀️", color: "#FF9800", light: "#FFF3E0", dark: "#E65100" },
};

const RESEARCH_DATA = {
  chiSquare: [
    { sentence: "Bugün hava", chi2: 72.00, p: "<0.001", result: "Anlamlı" },
    { sentence: "Bu hafta sonu", chi2: 119.27, p: "<0.001", result: "Anlamlı" },
    { sentence: "Seni çok", chi2: 34.16, p: "<0.001", result: "Anlamlı" },
    { sentence: "Sınav için", chi2: 121.48, p: "<0.001", result: "Anlamlı" },
    { sentence: "Mükedder", chi2: 274.69, p: "<0.001", result: "En Anlamlı" },
    { sentence: "Bence en iyisi", chi2: 108.38, p: "<0.001", result: "Anlamlı" },
  ],
  entropy: {
    iphone: [2.71, 2.67, 2.52, 2.91, 2.67, 3.19],
    samsung: [3.28, 4.00, 3.51, 4.79, 3.20, 2.75],
    xiaomi: [3.45, 3.44, 2.83, 3.20, 3.44, 3.76],
  },
  sentences: ["Bugün hava", "Bu hafta sonu", "Seni çok", "Sınav için", "Mükedder", "Bence en iyisi"],
  keyFindings: [
    { icon: "📱", title: "Telefon Markası Belirleyici", desc: "Cinsiyet, yaş, bölüm etkisiz. Sadece marka farklılaştırıyor." },
    { icon: "🍎", title: "iPhone En Homojen", desc: "Tüm cümlelerde en düşük entropy. iOS kullanıcıları en standart önerileri alıyor." },
    { icon: "💬", title: "'Seni çok' → %87 'seviyorum'", desc: "Duygusal dil en standartlaşmış bağlam. Sistem duyguları homojenleştiriyor." },
    { icon: "🔤", title: "Nadir Kelime Testi", desc: "'Mükedder' için markalar tamamen farklı öneri veriyor. En yüksek chi2: 274.69" },
  ],
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
  const [page, setPage] = useState("chat");
  const [compareResult, setCompareResult] = useState(null);
  const [warning, setWarning] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [warningLoading, setWarningLoading] = useState(false);
  const inputRef = useRef(null);
  const chatRef = useRef(null);
  const ctx = CONTEXTS[context];

  const bg = darkMode ? "#1a1a2e" : "#ECE5DD";
  const surface = darkMode ? "#16213e" : "white";
  const textColor = darkMode ? "#e0e0e0" : "#1a1a1a";
  const subText = darkMode ? "#888" : "#666";
  const borderColor = darkMode ? "#333" : "#E0E0E0";
  const inputBg = darkMode ? "#0f3460" : "white";

  useEffect(() => {
    if (!text.trim()) { setSuggestions([]); return; }
    const t = setTimeout(fetchSuggestions, 200);
    return () => clearTimeout(t);
  }, [text, context]);

  useEffect(() => {
    chatRef.current?.scrollTo(0, chatRef.current.scrollHeight);
  }, [messages]);

  // AI warning check — debounced
  useEffect(() => {
    if (!text.trim() || text.length < 5) { setWarning(null); return; }
    const t = setTimeout(checkWarning, 800);
    return () => clearTimeout(t);
  }, [text, context]);

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

  async function checkWarning() {
    setWarningLoading(true);
    try {
      const res = await fetch(`${API}/check-warning`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context }),
      });
      const data = await res.json();
      setWarning(data.warning ? data : null);
    } catch { setWarning(null); }
    setWarningLoading(false);
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
    setWarning(null);
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
    setWarning(null);
  }

  const navItems = [
    { id: "chat", label: "💬 Chat" },
    { id: "compare", label: "🔍 Karşılaştır" },
    { id: "research", label: "📊 Araştırma" },
  ];

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: bg, fontFamily: "Arial, sans-serif", transition: "all 0.3s" }}>

      {/* HEADER */}
      <div style={{ background: ctx.color, color: "white", padding: "0 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.2)", zIndex: 10 }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
              {ctx.emoji}
            </div>
            <div>
              <div style={{ fontWeight: "bold", fontSize: 15 }}>Bağlam Duyarlı Öneri Sistemi</div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>Bitirme Projesi — WP Araştırması</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {navItems.map(n => (
              <button key={n.id} onClick={() => setPage(n.id)} style={{
                padding: "5px 12px", borderRadius: 14, border: "none", fontSize: 12,
                fontWeight: "bold", cursor: "pointer",
                background: page === n.id ? "rgba(255,255,255,0.3)" : "transparent",
                color: "white",
              }}>{n.label}</button>
            ))}
            <button onClick={() => setDarkMode(!darkMode)} style={{
              padding: "5px 10px", borderRadius: 14, border: "none", cursor: "pointer",
              background: "rgba(255,255,255,0.2)", color: "white", fontSize: 14,
            }}>{darkMode ? "☀️" : "🌙"}</button>
          </div>
        </div>
      </div>

      {/* CONTEXT SELECTOR */}
      {page !== "research" && (
        <div style={{ background: surface, borderBottom: `1px solid ${borderColor}`, padding: "8px 16px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: 8, overflowX: "auto" }}>
            {Object.entries(CONTEXTS).map(([key, val]) => (
              <button key={key} onClick={() => { setContext(key); setCompareResult(null); setWarning(null); }} style={{
                padding: "6px 14px", borderRadius: 16, whiteSpace: "nowrap",
                border: `2px solid ${context === key ? val.color : borderColor}`,
                background: context === key ? val.light : surface,
                color: context === key ? val.dark : subText,
                fontWeight: context === key ? "bold" : "normal",
                cursor: "pointer", fontSize: 13,
              }}>
                {val.emoji} {val.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── CHAT PAGE ── */}
      {page === "chat" && (
        <>
          <div ref={chatRef} style={{ flex: 1, overflowY: "auto", padding: 16, maxWidth: 760, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <span style={{ background: darkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.7)", padding: "4px 12px", borderRadius: 12, fontSize: 12, color: subText }}>
                {ctx.emoji} {ctx.label} bağlamı aktif
              </span>
            </div>

            {messages.length === 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: subText, textAlign: "center", marginBottom: 8 }}>Örnek cümleler dene:</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                  {EXAMPLES[context].map((ex, i) => (
                    <button key={i} onClick={() => { setText(ex); inputRef.current?.focus(); }} style={{
                      padding: "6px 12px", borderRadius: 16,
                      border: `1px solid ${ctx.color}`, background: surface,
                      color: ctx.dark, cursor: "pointer", fontSize: 13,
                    }}>{ex}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <div style={{ maxWidth: "72%" }}>
                  <div style={{
                    background: darkMode ? CONTEXTS[msg.context].dark : CONTEXTS[msg.context].light,
                    border: `1px solid ${CONTEXTS[msg.context].color}`,
                    borderRadius: "12px 12px 2px 12px",
                    padding: "8px 12px",
                  }}>
                    <div style={{ fontSize: 14, color: darkMode ? "white" : "#1a1a1a" }}>{msg.text}</div>
                    <div style={{ fontSize: 11, color: darkMode ? "rgba(255,255,255,0.5)" : "#888", textAlign: "right", marginTop: 2 }}>
                      {CONTEXTS[msg.context].emoji} {msg.time}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* AI WARNING */}
          {warning && (
            <div style={{ background: darkMode ? "#2d1b00" : "#FFF3E0", borderTop: `2px solid #FF9800`, padding: "10px 16px" }}>
              <div style={{ maxWidth: 760, margin: "0 auto" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>⚠️</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: "bold", color: "#E65100" }}>{warning.message}</div>
                    {warning.suggestion && (
                      <div style={{ fontSize: 12, color: subText, marginTop: 4 }}>
                        💡 Öneri: <em>{warning.suggestion}</em>
                      </div>
                    )}
                  </div>
                  <button onClick={() => setWarning(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: subText, fontSize: 16 }}>✕</button>
                </div>
              </div>
            </div>
          )}

          {/* SUGGESTION BAR */}
          {suggestions.length > 0 && (
            <div style={{ background: darkMode ? "#0f3460" : "#F0F0F0", borderTop: `1px solid ${borderColor}`, padding: "8px 16px" }}>
              <div style={{ maxWidth: 760, margin: "0 auto", display: "flex" }}>
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => acceptSuggestion(s)} style={{
                    flex: 1, padding: "8px 4px", border: "none",
                    borderRight: i < suggestions.length - 1 ? `1px solid ${borderColor}` : "none",
                    background: "transparent", color: textColor, cursor: "pointer", fontSize: 14, fontWeight: "500",
                  }}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {/* INPUT */}
          <div style={{ background: darkMode ? "#0f3460" : "#F0F0F0", padding: "8px 16px", borderTop: `1px solid ${borderColor}` }}>
            <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ flex: 1, background: inputBg, borderRadius: 24, padding: "8px 16px", display: "flex", alignItems: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
                <input
                  ref={inputRef}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendMessage()}
                  placeholder={`${ctx.emoji} ${ctx.label} bağlamında yaz...`}
                  style={{ flex: 1, border: "none", outline: "none", fontSize: 15, color: textColor, background: "transparent" }}
                />
                {warningLoading && <span style={{ fontSize: 12, color: subText }}>🔍</span>}
              </div>
              <button onClick={sendMessage} style={{
                width: 44, height: 44, borderRadius: "50%", border: "none",
                background: ctx.color, color: "white", cursor: "pointer", fontSize: 18,
              }}>➤</button>
            </div>
          </div>
        </>
      )}

      {/* ── COMPARE PAGE ── */}
      {page === "compare" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <div style={{ background: surface, borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <p style={{ margin: "0 0 12px", fontWeight: "bold", color: textColor }}>Aynı kelimeyi tüm bağlamlarda karşılaştır:</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && fetchCompare()}
                  placeholder="Örnek: hocam, kanka, toplantı, maç..."
                  style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: `1px solid ${borderColor}`, fontSize: 15, outline: "none", background: inputBg, color: textColor }}
                />
                <button onClick={fetchCompare} style={{
                  padding: "10px 20px", background: ctx.color, color: "white",
                  border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold",
                }}>Karşılaştır</button>
              </div>
            </div>

            {compareResult && (
              <div style={{ background: surface, borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                <p style={{ fontWeight: "bold", color: textColor, marginBottom: 16 }}>"{text}" için bağlam karşılaştırması:</p>
                {Object.entries(compareResult).map(([ctx_key, preds]) => (
                  <div key={ctx_key} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 14px", borderRadius: 10,
                    background: darkMode ? "rgba(255,255,255,0.05)" : CONTEXTS[ctx_key].light,
                    marginBottom: 8,
                  }}>
                    <span style={{ fontSize: 22 }}>{CONTEXTS[ctx_key].emoji}</span>
                    <span style={{ fontWeight: "bold", color: CONTEXTS[ctx_key].color, minWidth: 80, fontSize: 14 }}>
                      {CONTEXTS[ctx_key].label}
                    </span>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {preds.length > 0 ? preds.map((p, i) => (
                        <span key={i} style={{
                          padding: "4px 12px", borderRadius: 14,
                          background: surface, border: `1px solid ${CONTEXTS[ctx_key].color}`,
                          color: CONTEXTS[ctx_key].color, fontSize: 13, fontWeight: "bold",
                        }}>{p}</span>
                      )) : <span style={{ color: subText, fontSize: 13 }}>öneri yok</span>}
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 16, padding: "12px 16px", background: darkMode ? "rgba(63,81,181,0.2)" : "#E8EAF6", borderRadius: 8, borderLeft: "4px solid #3F51B5" }}>
                  <p style={{ margin: 0, fontSize: 13, color: "#3F51B5" }}>
                    <strong>Araştırma bağlantısı:</strong> WP sistemi bu farklılaşmayı yapamıyor. Bu prototip bağlama duyarlı alternatifdır.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── RESEARCH PAGE ── */}
      {page === "research" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>

            {/* Title */}
            <div style={{ background: surface, borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <h2 style={{ margin: "0 0 8px", color: textColor, fontSize: 18 }}>📊 Araştırma Bulguları</h2>
              <p style={{ margin: 0, color: subText, fontSize: 13 }}>
                94 katılımcı • 6 test cümlesi • WhatsApp klavye öneri sistemi analizi
              </p>
            </div>

            {/* Key Findings */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              {RESEARCH_DATA.keyFindings.map((f, i) => (
                <div key={i} style={{ background: surface, borderRadius: 12, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{f.icon}</div>
                  <div style={{ fontWeight: "bold", color: textColor, fontSize: 14, marginBottom: 4 }}>{f.title}</div>
                  <div style={{ color: subText, fontSize: 12 }}>{f.desc}</div>
                </div>
              ))}
            </div>

            {/* Chi-Square Table */}
            <div style={{ background: surface, borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <h3 style={{ margin: "0 0 16px", color: textColor, fontSize: 16 }}>Chi-Square Test Sonuçları</h3>
              <p style={{ margin: "0 0 12px", color: subText, fontSize: 12 }}>Telefon markası farkı istatistiksel olarak anlamlı mı?</p>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: darkMode ? "#1F4E79" : "#1F4E79" }}>
                    {["Test Cümlesi", "Chi²", "p değeri", "Sonuç"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", color: "white", fontSize: 12, textAlign: "left", fontWeight: "bold" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RESEARCH_DATA.chiSquare.map((row, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? (darkMode ? "rgba(255,255,255,0.05)" : "#E3F2FD") : surface }}>
                      <td style={{ padding: "8px 12px", color: textColor, fontSize: 13 }}>{row.sentence}</td>
                      <td style={{ padding: "8px 12px", color: textColor, fontSize: 13, fontWeight: "bold" }}>{row.chi2}</td>
                      <td style={{ padding: "8px 12px", color: "#4CAF50", fontSize: 13, fontWeight: "bold" }}>{row.p}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13 }}>
                        <span style={{ background: "#E8F5E9", color: "#2E7D32", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: "bold" }}>
                          ✅ {row.result}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Entropy Chart */}
            <div style={{ background: surface, borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <h3 style={{ margin: "0 0 8px", color: textColor, fontSize: 16 }}>Marka Bazında Entropy</h3>
              <p style={{ margin: "0 0 16px", color: subText, fontSize: 12 }}>Düşük entropy = daha homojen öneriler (iOS en standart)</p>
              {RESEARCH_DATA.sentences.map((sentence, si) => (
                <div key={si} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: "bold", color: textColor, marginBottom: 6 }}>"{sentence}"</div>
                  {[
                    { label: "iPhone", color: "#555", val: RESEARCH_DATA.entropy.iphone[si] },
                    { label: "Samsung", color: "#1428A0", val: RESEARCH_DATA.entropy.samsung[si] },
                    { label: "Xiaomi", color: "#FF6900", val: RESEARCH_DATA.entropy.xiaomi[si] },
                  ].map((m, mi) => (
                    <div key={mi} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ width: 60, fontSize: 11, color: subText }}>{m.label}</span>
                      <div style={{ flex: 1, background: darkMode ? "#333" : "#eee", borderRadius: 4, height: 16, position: "relative" }}>
                        <div style={{
                          width: `${(m.val / 5) * 100}%`,
                          background: m.color, borderRadius: 4, height: "100%",
                          transition: "width 0.5s"
                        }} />
                      </div>
                      <span style={{ width: 32, fontSize: 11, color: textColor, fontWeight: "bold" }}>{m.val}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Conclusion */}
            <div style={{ background: darkMode ? "rgba(63,81,181,0.2)" : "#E8EAF6", borderRadius: 12, padding: 20, borderLeft: "4px solid #3F51B5" }}>
              <h3 style={{ margin: "0 0 8px", color: "#3F51B5", fontSize: 15 }}>🎯 Ana Sonuç</h3>
              <p style={{ margin: 0, fontSize: 13, color: darkMode ? "#aaa" : "#333", lineHeight: 1.6 }}>
                Mobil klavye öneri sistemi <strong>kullanıcıyı değil, işletim sistemini tanımaktadır.</strong> Telefon markası tek belirleyici faktördür; cinsiyet, yaş ve kullanım alışkanlıkları etkisizdir. Bu prototip, araştırmanın ortaya koyduğu eksikliğe bağlam duyarlı bir çözüm sunmaktadır.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}