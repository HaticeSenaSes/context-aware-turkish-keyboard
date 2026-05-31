import { useState, useEffect, useRef } from "react";

const CONTEXTS = {
  arkadas: { label: "Arkadaş", emoji: "👫", color: "#10b981", light: "#ECFDF5", dark: "#059669" },
  hoca: { label: "Hoca", emoji: "👨‍🏫", color: "#6366f1", light: "#EEF2FF", dark: "#4338ca" },
  is: { label: "İş", emoji: "💼", color: "#8b5cf6", light: "#F5F3FF", dark: "#6d28d9" },
  spor: { label: "Spor", emoji: "⚽", color: "#f59e0b", light: "#FFFBEB", dark: "#d97706" },
  gundelik: { label: "Gündelik", emoji: "☀️", color: "#f97316", light: "#FFF7ED", dark: "#ea580c" },
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

const DEFAULT_CONTACTS = [
  { id: 1, name: "Hocam", context: "hoca", emoji: "👨‍🏫" },
  { id: 2, name: "Kankam", context: "arkadas", emoji: "👫" },
  { id: 3, name: "Müdürüm", context: "is", emoji: "💼" },
];

const DEFAULT_TEMPLATES = [
  { id: 1, title: "Randevu İsteği", text: "Hocam müsait olduğunuzda görüşebilir miyiz?", context: "hoca" },
  { id: 2, title: "Haftalık Duyuru", text: "Merhaba, bu haftaki toplantı saat 14:00'de.", context: "is" },
  { id: 3, title: "Buluşma Teklifi", text: "Kanka akşam çıkalım mı bir yerlere?", context: "arkadas" },
];

export default function App() {
  const [context, setContext] = useState("arkadas");
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return !localStorage.getItem("onboarding_done"); } catch { return true; }
  });
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [page, setPage] = useState("chat");
  const [compareResult, setCompareResult] = useState(null);
  const [compareTab, setCompareTab] = useState("context");
  const [warning, setWarning] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [warningLoading, setWarningLoading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const [contacts, setContacts] = useState(() => {
    try { const s = localStorage.getItem("contacts"); return s ? JSON.parse(s) : DEFAULT_CONTACTS; } catch { return DEFAULT_CONTACTS; }
  });
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactContext, setNewContactContext] = useState("arkadas");
  const [templates, setTemplates] = useState(() => {
    try { const s = localStorage.getItem("templates"); return s ? JSON.parse(s) : DEFAULT_TEMPLATES; } catch { return DEFAULT_TEMPLATES; }
  });
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState("");
  const [newTemplateText, setNewTemplateText] = useState("");
  const [newTemplateContext, setNewTemplateContext] = useState("gundelik");
  const [copied, setCopied] = useState(null);
  const [reminders, setReminders] = useState(() => {
    try { const s = localStorage.getItem("reminders"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [newReminderText, setNewReminderText] = useState("");
  const [newReminderTime, setNewReminderTime] = useState("");
  const [newReminderContact, setNewReminderContact] = useState("");
  const inputRef = useRef(null);
  const chatRef = useRef(null);
  const ctx = CONTEXTS[context];

  const bg = darkMode ? "#0f0f0f" : "#f4f4f5";
  const surface = darkMode ? "#1c1c1e" : "#ffffff";
  const textColor = darkMode ? "#e0e0e0" : "#1a1a1a";
  const subText = darkMode ? "#888" : "#666";
  const borderColor = darkMode ? "#333" : "#E0E0E0";
  const inputBg = darkMode ? "#0f3460" : "white";

  const navItems = [
    { id: "chat", label: "💬 Chat" },
    { id: "contacts", label: "👤 Kişiler" },
    { id: "templates", label: "📝 Şablonlar" },
    { id: "reminders", label: "⏰ Hatırlatıcı" },
    { id: "compare", label: "🔍 Karşılaştır" },
    { id: "research", label: "📊 Araştırma" },
  ];

  useEffect(() => {
    if (!text.trim()) { setSuggestions([]); return; }
    const t = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(t);
  }, [text, context]);

  useEffect(() => {
    chatRef.current?.scrollTo(0, chatRef.current.scrollHeight);
  }, [messages]);

  useEffect(() => {
    setWarning(null);
  }, [text, context]);

  async function fetchSuggestions() {
    try {
      const history = messages.slice(-5).map(m => m.text);
      // Kişisel öğrenme verisi
      let personal_data = [];
      try {
        const stored = localStorage.getItem(`personal_ngram_${context}`);
        if (stored) personal_data = JSON.parse(stored).slice(-100);
      } catch {}
      const res = await fetch(`${API}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context, n_suggestions: 3, history, personal_data }),
      });
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch { setSuggestions([]); }
  }

  async function checkWarning(currentText) {
    if (!currentText || currentText.length < 10) return;
    setWarningLoading(true);
    try {
      const res = await fetch(`${API}/check-warning`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: currentText, context }),
      });
      const data = await res.json();
      setWarning(data.warning ? data : null);
    } catch { setWarning(null); }
    setWarningLoading(false);
  }

  // Yazarken gerçek zamanlı uyarı — 1.5 saniye debounce
  useEffect(() => {
    if (!text || text.length < 15) { setWarning(null); return; }
    const timer = setTimeout(() => {
      checkWarning(text);
    }, 1500);
    return () => clearTimeout(timer);
  }, [text, context]);

  async function fetchCompare() {
    if (!text.trim()) return;
    try {
      const res = await fetch(`${API}/compare?text=${encodeURIComponent(text)}`);
      const data = await res.json();
      setCompareResult(data.context_predictions);
    } catch { setCompareResult(null); }
  }

  async function completeSentence() {
    if (!text.trim()) return;
    setCompleting(true);
    try {
      const res = await fetch(`${API}/suggest-sentence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context }),
      });
      const data = await res.json();
      if (data.suggestion) setText(data.suggestion);
    } catch { }
    setCompleting(false);
  }

  function acceptSuggestion(word) {
    const parts = text.split(" ");
    const prevWord = parts[parts.length - 1];
    parts[parts.length - 1] = word;
    setText(parts.join(" ") + " ");
    setWarning(null);
    inputRef.current?.focus();

    // Longitudinal learning: kabul edilen öneriyi kaydet
    try {
      const key = `personal_ngram_${context}`;
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      existing.push({ prev: prevWord.toLowerCase(), word: word.toLowerCase(), ts: Date.now() });
      // Son 500 kaydı tut
      if (existing.length > 500) existing.splice(0, existing.length - 500);
      localStorage.setItem(key, JSON.stringify(existing));
    } catch {}
  }

  async function sendMessage() {
    if (!text.trim()) return;
    const msgText = text;
    setMessages(prev => [...prev, {
      text: msgText, context,
      time: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    }]);
    setText("");
    setSuggestions([]);
    setWarning(null);
    await checkWarning(msgText);
  }

  function addContact() {
    if (!newContactName.trim()) return;
    const contact = { id: Date.now(), name: newContactName, context: newContactContext, emoji: CONTEXTS[newContactContext].emoji };
    const updated = [...contacts, contact];
    setContacts(updated);
    try { localStorage.setItem("contacts", JSON.stringify(updated)); } catch {}
    setNewContactName("");
    setShowAddContact(false);
  }

  function deleteContact(id) {
    const updated = contacts.filter(c => c.id !== id);
    setContacts(updated);
    try { localStorage.setItem("contacts", JSON.stringify(updated)); } catch {}
  }

  function selectContact(contact) {
    setSelectedContact(contact);
    setContext(contact.context);
    setPage("chat");
    setMessages([]);
    setText("");
  }

  function addTemplate() {
    if (!newTemplateTitle.trim() || !newTemplateText.trim()) return;
    const template = { id: Date.now(), title: newTemplateTitle, text: newTemplateText, context: newTemplateContext };
    const updated = [...templates, template];
    setTemplates(updated);
    try { localStorage.setItem("templates", JSON.stringify(updated)); } catch {}
    setNewTemplateTitle("");
    setNewTemplateText("");
    setShowAddTemplate(false);
  }

  function deleteTemplate(id) {
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    try { localStorage.setItem("templates", JSON.stringify(updated)); } catch {}
  }

  function copyTemplate(template) {
    navigator.clipboard.writeText(template.text);
    setCopied(template.id);
    setTimeout(() => setCopied(null), 2000);
  }

  function useTemplate(template) {
    setContext(template.context);
    setText(template.text);
    setPage("chat");
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function addReminder() {
    if (!newReminderText.trim() || !newReminderTime) return;
    const reminder = { id: Date.now(), text: newReminderText, time: newReminderTime, contact: newReminderContact, done: false };
    const updated = [...reminders, reminder];
    setReminders(updated);
    try { localStorage.setItem("reminders", JSON.stringify(updated)); } catch {}
    if (Notification.permission === "default") Notification.requestPermission();
    const diff = new Date(newReminderTime) - new Date();
    if (diff > 0) {
      setTimeout(() => {
        if (Notification.permission === "granted") {
          new Notification("⏰ Mesaj Hatırlatıcı", { body: reminder.text, icon: "/favicon.svg" });
        }
      }, diff);
    }
    setNewReminderText("");
    setNewReminderTime("");
    setNewReminderContact("");
    setShowAddReminder(false);
  }

  function deleteReminder(id) {
    const updated = reminders.filter(r => r.id !== id);
    setReminders(updated);
    try { localStorage.setItem("reminders", JSON.stringify(updated)); } catch {}
  }

  function toggleReminderDone(id) {
    const updated = reminders.map(r => r.id === id ? { ...r, done: !r.done } : r);
    setReminders(updated);
    try { localStorage.setItem("reminders", JSON.stringify(updated)); } catch {}
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: bg, fontFamily: "Arial, sans-serif" }}>

      {/* ── ONBOARDING MODAL ── */}
      {showOnboarding && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "white", borderRadius: 20, padding: 32, maxWidth: 480, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
              <h2 style={{ margin: "0 0 8px", color: "#1a1a1a", fontSize: 22 }}>ChatSense</h2>
              <p style={{ margin: 0, color: "#666", fontSize: 14 }}>Kime yazdığına göre öneri sunan akıllı sistem</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
              {[
                { emoji: "👫", title: "Arkadaşa yazıyorsun", desc: "Sistem samimi, gündelik kelimeler önerir" },
                { emoji: "👨‍🏫", title: "Hocana yazıyorsun", desc: "Sistem resmi, akademik ifadeler önerir" },
                { emoji: "💼", title: "İş arkadaşına yazıyorsun", desc: "Sistem profesyonel ton önerir" },
                { emoji: "⚠️", title: "Bağlam uyuşmazsa uyarır", desc: "Hocana argo yazarsan sistem seni uyarır" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, background: "#f8f9fa" }}>
                  <span style={{ fontSize: 24 }}>{item.emoji}</span>
                  <div>
                    <div style={{ fontWeight: "bold", fontSize: 13, color: "#1a1a1a" }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ background: "#f4f4f5", borderRadius: 10, padding: "10px 14px", marginBottom: 20, borderLeft: "4px solid #6366f1" }}>
              <p style={{ margin: 0, fontSize: 12, color: "#18181b" }}>
                <strong>Araştırma:</strong> 94 WhatsApp kullanıcısından toplanan veri ile telefon markasının öneri içeriğini belirlediği kanıtlandı. Bu sistem bağlamı belirleyici yapıyor.
              </p>
            </div>
            <button onClick={() => {
              setShowOnboarding(false);
              try { localStorage.setItem("onboarding_done", "1"); } catch {}
            }} style={{ width: "100%", padding: "14px", background: "#18181b", color: "white", border: "none", borderRadius: 12, fontSize: 16, fontWeight: "bold", cursor: "pointer" }}>
              Başlayalım 🚀
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div style={{ background: "#18181b", color: "white", padding: "0 16px", boxShadow: "0 1px 0 rgba(0,0,0,0.1)", zIndex: 10 }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
              {selectedContact ? selectedContact.emoji : ctx.emoji}
            </div>
            <div>
              <div style={{ fontWeight: "bold", fontSize: 15 }}>
                {selectedContact ? selectedContact.name : "ChatSense"}
              </div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>
                {selectedContact ? `${ctx.label} bağlamı` : "Bağlam Duyarlı Türkçe Öneri"}
              </div>
            </div>
          </div>
          <button onClick={() => setDarkMode(!darkMode)} style={{
            padding: "6px 10px", borderRadius: 14, border: "none", cursor: "pointer",
            background: "rgba(255,255,255,0.2)", color: "white", fontSize: 16,
          }}>{darkMode ? "☀️" : "🌙"}</button>
        </div>
      </div>

      {/* TAB NAVİGASYON */}
      <div style={{ background: surface, borderBottom: `1px solid ${borderColor}`, overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex" }}>
          {navItems.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)} style={{
              padding: "10px 14px", border: "none", background: "transparent",
              borderBottom: page === n.id ? `3px solid ${ctx.color}` : "3px solid transparent",
              color: page === n.id ? ctx.color : subText,
              cursor: "pointer", fontSize: 12, fontWeight: page === n.id ? "bold" : "normal",
              whiteSpace: "nowrap", flexShrink: 0, transition: "all 0.2s",
            }}>{n.label}</button>
          ))}
        </div>
      </div>

      {/* CONTEXT SELECTOR */}
      {(page === "chat" || page === "compare") && (
        <div style={{ background: surface, borderBottom: `1px solid ${borderColor}`, padding: "8px 16px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: 8, overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", paddingBottom: 2 }}>
            {Object.entries(CONTEXTS).map(([key, val]) => (
              <button key={key} onClick={() => { setContext(key); setCompareResult(null); setWarning(null); setSelectedContact(null); }} style={{
                padding: "5px 12px", borderRadius: 16, whiteSpace: "nowrap",
                border: `2px solid ${context === key ? val.color : borderColor}`,
                background: context === key ? val.light : surface,
                color: context === key ? val.dark : subText,
                fontWeight: context === key ? "bold" : "normal",
                cursor: "pointer", fontSize: 12,
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
                {ctx.emoji} {selectedContact ? selectedContact.name + " — " : ""}{ctx.label} bağlamı aktif
              </span>
            </div>
            {messages.length === 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: subText, textAlign: "center", marginBottom: 8 }}>Örnek cümleler dene:</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                  {EXAMPLES[context].map((ex, i) => (
                    <button key={i} onClick={() => { setText(ex); inputRef.current?.focus(); }} style={{
                      padding: "6px 12px", borderRadius: 16, border: `1px solid ${ctx.color}`,
                      background: surface, color: ctx.dark, cursor: "pointer", fontSize: 13,
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
                    borderRadius: "12px 12px 2px 12px", padding: "8px 12px",
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

          {warning && (
            <div style={{ background: darkMode ? "#2d1b00" : "#FFF3E0", borderTop: "2px solid #FF9800", padding: "10px 16px" }}>
              <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: "bold", color: "#E65100" }}>{warning.message}</div>
                  {warning.suggestion && <div style={{ fontSize: 12, color: subText, marginTop: 4 }}>💡 <em>{warning.suggestion}</em></div>}
                </div>
                <button onClick={() => setWarning(null)} style={{ background: "none", border: "none", cursor: "pointer", color: subText, fontSize: 16 }}>✕</button>
              </div>
            </div>
          )}

          {text.trim().length > 3 && (
            <div style={{ background: darkMode ? "#0d2137" : "#F8F8F8", padding: "6px 16px", borderTop: `1px solid ${borderColor}` }}>
              <div style={{ maxWidth: 760, margin: "0 auto" }}>
                <button onClick={completeSentence} disabled={completing} style={{
                  padding: "5px 14px", borderRadius: 16, border: `1px solid ${ctx.color}`,
                  background: "transparent", color: ctx.color, cursor: "pointer", fontSize: 12, fontWeight: "bold",
                  opacity: completing ? 0.6 : 1,
                }}>
                  {completing ? "⏳ Tamamlanıyor..." : "✨ Cümleyi Tamamla"}
                </button>
              </div>
            </div>
          )}

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

          <div style={{ background: darkMode ? "#0f3460" : "#F0F0F0", padding: "8px 16px", borderTop: `1px solid ${borderColor}` }}>
            <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ flex: 1, background: inputBg, borderRadius: 24, padding: "8px 16px", display: "flex", alignItems: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
                <input
                  ref={inputRef}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendMessage()}
                  placeholder={`${ctx.emoji} ${selectedContact ? selectedContact.name + "'e" : ctx.label + " bağlamında"} yaz...`}
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

      {/* ── CONTACTS PAGE ── */}
      {page === "contacts" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, color: textColor, fontSize: 18 }}>👤 Kişiler</h2>
                <p style={{ margin: "4px 0 0", color: subText, fontSize: 12 }}>Kişi seçince sistem o bağlamda öneri verir</p>
              </div>
              <button onClick={() => setShowAddContact(!showAddContact)} style={{
                padding: "8px 16px", borderRadius: 20, border: "none",
                background: ctx.color, color: "white", cursor: "pointer", fontWeight: "bold", fontSize: 13,
              }}>+ Kişi Ekle</button>
            </div>
            {showAddContact && (
              <div style={{ background: surface, borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", border: `2px solid ${ctx.color}` }}>
                <h3 style={{ margin: "0 0 16px", color: textColor, fontSize: 15 }}>Yeni Kişi</h3>
                <input
                  value={newContactName}
                  onChange={e => setNewContactName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addContact()}
                  placeholder="Kişi adı (örn. Hocam, Annem)"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${borderColor}`, fontSize: 14, outline: "none", background: inputBg, color: textColor, marginBottom: 12, boxSizing: "border-box" }}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                  {Object.entries(CONTEXTS).map(([key, val]) => (
                    <button key={key} onClick={() => setNewContactContext(key)} style={{
                      padding: "6px 14px", borderRadius: 16,
                      border: `2px solid ${newContactContext === key ? val.color : borderColor}`,
                      background: newContactContext === key ? val.light : surface,
                      color: newContactContext === key ? val.dark : subText,
                      cursor: "pointer", fontSize: 13, fontWeight: newContactContext === key ? "bold" : "normal",
                    }}>{val.emoji} {val.label}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={addContact} style={{ padding: "8px 20px", background: ctx.color, color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}>Kaydet</button>
                  <button onClick={() => setShowAddContact(false)} style={{ padding: "8px 20px", background: "transparent", color: subText, border: `1px solid ${borderColor}`, borderRadius: 8, cursor: "pointer" }}>İptal</button>
                </div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {contacts.map(contact => (
                <div key={contact.id} style={{
                  background: surface, borderRadius: 12, padding: 16,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.08)", cursor: "pointer",
                  border: `2px solid ${selectedContact?.id === contact.id ? CONTEXTS[contact.context].color : "transparent"}`,
                  position: "relative",
                }} onClick={() => selectContact(contact)}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>{contact.emoji}</div>
                  <div style={{ fontWeight: "bold", color: textColor, fontSize: 15, marginBottom: 4 }}>{contact.name}</div>
                  <div style={{ display: "inline-block", padding: "2px 10px", borderRadius: 10, background: CONTEXTS[contact.context].light, color: CONTEXTS[contact.context].dark, fontSize: 12, fontWeight: "bold" }}>
                    {CONTEXTS[contact.context].label}
                  </div>
                  <button onClick={e => { e.stopPropagation(); deleteContact(contact.id); }} style={{ position: "absolute", top: 10, right: 10, background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: 16 }}>✕</button>
                </div>
              ))}
            </div>
            {contacts.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: subText }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
                <p>Henüz kişi eklemediniz.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TEMPLATES PAGE ── */}
      {page === "templates" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, color: textColor, fontSize: 18 }}>📝 Şablon Mesajlar</h2>
                <p style={{ margin: "4px 0 0", color: subText, fontSize: 12 }}>Sık kullandığın mesajları kaydet, tek tıkla kullan</p>
              </div>
              <button onClick={() => setShowAddTemplate(!showAddTemplate)} style={{
                padding: "8px 16px", borderRadius: 20, border: "none",
                background: ctx.color, color: "white", cursor: "pointer", fontWeight: "bold", fontSize: 13,
              }}>+ Şablon Ekle</button>
            </div>
            {showAddTemplate && (
              <div style={{ background: surface, borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", border: `2px solid ${ctx.color}` }}>
                <h3 style={{ margin: "0 0 16px", color: textColor, fontSize: 15 }}>Yeni Şablon</h3>
                <input
                  value={newTemplateTitle}
                  onChange={e => setNewTemplateTitle(e.target.value)}
                  placeholder="Başlık (örn. Randevu İsteği)"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${borderColor}`, fontSize: 14, outline: "none", background: inputBg, color: textColor, marginBottom: 10, boxSizing: "border-box" }}
                />
                <textarea
                  value={newTemplateText}
                  onChange={e => setNewTemplateText(e.target.value)}
                  placeholder="Mesaj içeriği..."
                  rows={3}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${borderColor}`, fontSize: 14, outline: "none", background: inputBg, color: textColor, marginBottom: 10, boxSizing: "border-box", resize: "vertical" }}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                  {Object.entries(CONTEXTS).map(([key, val]) => (
                    <button key={key} onClick={() => setNewTemplateContext(key)} style={{
                      padding: "5px 12px", borderRadius: 14,
                      border: `2px solid ${newTemplateContext === key ? val.color : borderColor}`,
                      background: newTemplateContext === key ? val.light : surface,
                      color: newTemplateContext === key ? val.dark : subText,
                      cursor: "pointer", fontSize: 12, fontWeight: newTemplateContext === key ? "bold" : "normal",
                    }}>{val.emoji} {val.label}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={addTemplate} style={{ padding: "8px 20px", background: ctx.color, color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}>Kaydet</button>
                  <button onClick={() => setShowAddTemplate(false)} style={{ padding: "8px 20px", background: "transparent", color: subText, border: `1px solid ${borderColor}`, borderRadius: 8, cursor: "pointer" }}>İptal</button>
                </div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {templates.map(template => (
                <div key={template.id} style={{ background: surface, borderRadius: 12, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", borderLeft: `4px solid ${CONTEXTS[template.context].color}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div>
                      <span style={{ fontWeight: "bold", color: textColor, fontSize: 14 }}>{template.title}</span>
                      <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 10, background: CONTEXTS[template.context].light, color: CONTEXTS[template.context].dark, fontSize: 11, fontWeight: "bold" }}>
                        {CONTEXTS[template.context].emoji} {CONTEXTS[template.context].label}
                      </span>
                    </div>
                    <button onClick={() => deleteTemplate(template.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: 16 }}>✕</button>
                  </div>
                  <p style={{ margin: "0 0 12px", color: subText, fontSize: 13, lineHeight: 1.5 }}>{template.text}</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => copyTemplate(template)} style={{
                      padding: "6px 14px", borderRadius: 14, border: `1px solid ${CONTEXTS[template.context].color}`,
                      background: "transparent", color: CONTEXTS[template.context].color, cursor: "pointer", fontSize: 12, fontWeight: "bold",
                    }}>{copied === template.id ? "✅ Kopyalandı!" : "📋 Kopyala"}</button>
                    <button onClick={() => useTemplate(template)} style={{
                      padding: "6px 14px", borderRadius: 14, border: "none",
                      background: CONTEXTS[template.context].color, color: "white", cursor: "pointer", fontSize: 12, fontWeight: "bold",
                    }}>✍️ Chat'e Aktar</button>
                  </div>
                </div>
              ))}
              {templates.length === 0 && (
                <div style={{ textAlign: "center", padding: 40, color: subText }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📝</div>
                  <p>Henüz şablon eklemediniz.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── REMINDERS PAGE ── */}
      {page === "reminders" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, color: textColor, fontSize: 18 }}>⏰ Hatırlatıcılar</h2>
                <p style={{ margin: "4px 0 0", color: subText, fontSize: 12 }}>Mesaj göndermek için hatırlatıcı ekle</p>
              </div>
              <button onClick={() => setShowAddReminder(!showAddReminder)} style={{
                padding: "8px 16px", borderRadius: 20, border: "none",
                background: ctx.color, color: "white", cursor: "pointer", fontWeight: "bold", fontSize: 13,
              }}>+ Hatırlatıcı Ekle</button>
            </div>
            {showAddReminder && (
              <div style={{ background: surface, borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", border: `2px solid ${ctx.color}` }}>
                <h3 style={{ margin: "0 0 16px", color: textColor, fontSize: 15 }}>Yeni Hatırlatıcı</h3>
                <textarea
                  value={newReminderText}
                  onChange={e => setNewReminderText(e.target.value)}
                  placeholder="Göndermek istediğin mesaj..."
                  rows={3}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${borderColor}`, fontSize: 14, outline: "none", background: inputBg, color: textColor, marginBottom: 10, boxSizing: "border-box", resize: "vertical" }}
                />
                <input
                  type="text"
                  value={newReminderContact}
                  onChange={e => setNewReminderContact(e.target.value)}
                  placeholder="Kime? (örn. Hocam) — isteğe bağlı"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${borderColor}`, fontSize: 14, outline: "none", background: inputBg, color: textColor, marginBottom: 10, boxSizing: "border-box" }}
                />
                <input
                  type="datetime-local"
                  value={newReminderTime}
                  onChange={e => setNewReminderTime(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${borderColor}`, fontSize: 14, outline: "none", background: inputBg, color: textColor, marginBottom: 16, boxSizing: "border-box" }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={addReminder} style={{ padding: "8px 20px", background: ctx.color, color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}>Kaydet</button>
                  <button onClick={() => setShowAddReminder(false)} style={{ padding: "8px 20px", background: "transparent", color: subText, border: `1px solid ${borderColor}`, borderRadius: 8, cursor: "pointer" }}>İptal</button>
                </div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {reminders.map(reminder => (
                <div key={reminder.id} style={{
                  background: surface, borderRadius: 12, padding: 16,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                  opacity: reminder.done ? 0.6 : 1,
                  borderLeft: `4px solid ${reminder.done ? "#ccc" : ctx.color}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      {reminder.contact && <div style={{ fontSize: 12, color: subText, marginBottom: 4 }}>📤 {reminder.contact}</div>}
                      <div style={{ fontSize: 14, color: textColor, marginBottom: 8, textDecoration: reminder.done ? "line-through" : "none" }}>{reminder.text}</div>
                      <div style={{ fontSize: 12, color: ctx.color, fontWeight: "bold" }}>
                        🕐 {new Date(reminder.time).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginLeft: 12 }}>
                      <button onClick={() => toggleReminderDone(reminder.id)} style={{
                        padding: "4px 10px", borderRadius: 12, border: `1px solid ${ctx.color}`,
                        background: reminder.done ? ctx.color : "transparent",
                        color: reminder.done ? "white" : ctx.color,
                        cursor: "pointer", fontSize: 12,
                      }}>{reminder.done ? "✅" : "○"}</button>
                      <button onClick={() => deleteReminder(reminder.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: 16 }}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
              {reminders.length === 0 && (
                <div style={{ textAlign: "center", padding: 40, color: subText }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>⏰</div>
                  <p>Henüz hatırlatıcı eklemediniz.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── COMPARE PAGE ── */}
      {page === "compare" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div style={{ maxWidth: 800, margin: "0 auto" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {[{ key: "context", label: "🔍 Bağlam Karşılaştırması" }, { key: "whatsapp", label: "📱 WhatsApp vs Sistemimiz" }].map(tab => (
                <button key={tab.key} onClick={() => setCompareTab(tab.key)} style={{
                  padding: "9px 18px", borderRadius: 20, border: "none", cursor: "pointer", fontWeight: "bold", fontSize: 13,
                  background: compareTab === tab.key ? "#25D366" : (darkMode ? "#333" : "#eee"),
                  color: compareTab === tab.key ? "white" : textColor, transition: "all 0.2s"
                }}>{tab.label}</button>
              ))}
            </div>

            {compareTab === "context" && (
              <>
                <div style={{ background: surface, borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                  <p style={{ margin: "0 0 12px", fontWeight: "bold", color: textColor }}>Aynı kelimeyi tüm bağlamlarda karşılaştır:</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && fetchCompare()}
                      placeholder="Örnek: hocam, kanka, toplantı, maç..."
                      style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: `1px solid ${borderColor}`, fontSize: 15, outline: "none", background: inputBg, color: textColor }} />
                    <button onClick={fetchCompare} style={{ padding: "10px 20px", background: "#25D366", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}>Karşılaştır</button>
                  </div>
                </div>
                {compareResult && (
                  <div style={{ background: surface, borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                    <p style={{ fontWeight: "bold", color: textColor, marginBottom: 16 }}>"{text}" için bağlam karşılaştırması:</p>
                    {Object.entries(compareResult).map(([ctx_key, preds]) => (
                      <div key={ctx_key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, background: darkMode ? "rgba(255,255,255,0.05)" : CONTEXTS[ctx_key].light, marginBottom: 8 }}>
                        <span style={{ fontSize: 22 }}>{CONTEXTS[ctx_key].emoji}</span>
                        <span style={{ fontWeight: "bold", color: CONTEXTS[ctx_key].color, minWidth: 80, fontSize: 14 }}>{CONTEXTS[ctx_key].label}</span>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {preds.length > 0 ? preds.map((p, i) => (
                            <span key={i} style={{ padding: "4px 12px", borderRadius: 14, background: surface, border: `1px solid ${CONTEXTS[ctx_key].color}`, color: CONTEXTS[ctx_key].color, fontSize: 13, fontWeight: "bold" }}>{p}</span>
                          )) : <span style={{ color: subText, fontSize: 13 }}>öneri yok</span>}
                        </div>
                      </div>
                    ))}
                    <div style={{ marginTop: 16, padding: "12px 16px", background: darkMode ? "rgba(63,81,181,0.2)" : "#E8EAF6", borderRadius: 8, borderLeft: "4px solid #3F51B5" }}>
                      <p style={{ margin: 0, fontSize: 13, color: "#3F51B5" }}><strong>Araştırma bağlantısı:</strong> WhatsApp bu bağlam farklılaşmasını yapamıyor. Bu prototip bağlama duyarlı alternatiftir.</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {compareTab === "whatsapp" && (
              <div>
                <div style={{ background: surface, borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", borderLeft: "4px solid #6366f1" }}>
                  <p style={{ margin: 0, fontSize: 13, color: subText }}>
                    <strong style={{ color: textColor }}>Araştırma bulgusu:</strong> 94 katılımcıdan toplanan WhatsApp öneri verileri ile sistemimizin bağlam duyarlı önerileri karşılaştırılmaktadır. WhatsApp cihaz markasına göre standart öneri sunarken, sistemimiz alıcıya göre farklılaştırır.
                  </p>
                </div>
                {[
                  { sentence: "Bugün hava", wp: { iphone: ["nasıl","çok","güzel"], samsung: ["çok","nasıl","iyi"], xiaomi: ["nasıl","durumu","iyi"] }, system: { arkadas: ["çok","güzel","nasıl"], hoca: ["iyi","bugün","hocam"], is: ["raporunu","toplantı","iyi"] } },
                  { sentence: "Bu hafta sonu", wp: { iphone: ["bir","için","da"], samsung: ["da","bir","ne"], xiaomi: ["da","ne","bir"] }, system: { arkadas: ["buluşalım","plan","çıkalım"], hoca: ["müsait","randevu","görüşelim"], is: ["toplantı","rapor","sunum"] } },
                  { sentence: "Seni çok", wp: { iphone: ["seviyorum","özledim","seviyor"], samsung: ["seviyorum","özledim","seviyor"], xiaomi: ["seviyorum","özledim","seviyor"] }, system: { arkadas: ["özledim","seviyorum","özledik"], hoca: ["teşekkür","saygılarımla","bilgi"], is: ["takdir","değerli","teşekkür"] } },
                  { sentence: "Sınav için", wp: { iphone: ["de","bir","da"], samsung: ["mi","çok","bir"], xiaomi: ["hemen","tıkladığınızda","için"] }, system: { arkadas: ["çalışalım","hazırlandın","korktum"], hoca: ["bilgi","tarih","kapsam"], is: ["rapor","hazırlık","sunum"] } },
                  { sentence: "Mükedder", wp: { iphone: ["sokak","abi","bey"], samsung: ["nasılsın","merhaba","iyi"], xiaomi: ["bu","bir","da"] }, system: { arkadas: ["ne","bir","bu"], hoca: ["hocam","sayın","iyi"], is: ["toplantı","rapor","bir"] } },
                  { sentence: "Bence en iyisi", wp: { iphone: ["sen","bu","bir"], samsung: ["bu","mi","bir"], xiaomi: ["bu","mi","bir"] }, system: { arkadas: ["bu","senin","hadi"], hoca: ["kaynak","yöntem","çalışma"], is: ["strateji","yaklaşım","plan"] } },
                ].map((item, idx) => (
                  <div key={idx} style={{ background: surface, borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                      <span style={{ background: "#25D366", color: "white", borderRadius: 8, padding: "4px 12px", fontWeight: "bold", fontSize: 15 }}>"{item.sentence}"</span>
                      <span style={{ fontSize: 12, color: subText }}>Chi² = {RESEARCH_DATA.chiSquare[idx]?.chi2} • p &lt; 0.001</span>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: "bold", color: subText, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>📱 WhatsApp (Anket Verisi — 94 Katılımcı)</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {[{ brand: "🍎 iPhone", color: "#555", words: item.wp.iphone }, { brand: "🔵 Samsung", color: "#1428A0", words: item.wp.samsung }, { brand: "🟠 Xiaomi", color: "#FF6900", words: item.wp.xiaomi }].map(({ brand, color, words }) => (
                          <div key={brand} style={{ flex: 1, minWidth: 160, padding: "10px 12px", borderRadius: 8, background: darkMode ? "rgba(255,255,255,0.05)" : "#f5f5f5", border: `1px solid ${darkMode ? "#444" : "#ddd"}` }}>
                            <div style={{ fontSize: 11, fontWeight: "bold", color, marginBottom: 6 }}>{brand}</div>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {words.map((w, i) => <span key={i} style={{ padding: "2px 8px", borderRadius: 10, background: color, color: "white", fontSize: 12, fontWeight: "bold" }}>{w}</span>)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: "bold", color: "#25D366", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>✨ Sistemimiz (Bağlama Göre)</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {[{ ctx: "arkadas", words: item.system.arkadas }, { ctx: "hoca", words: item.system.hoca }, { ctx: "is", words: item.system.is }].map(({ ctx: cKey, words }) => (
                          <div key={cKey} style={{ flex: 1, minWidth: 160, padding: "10px 12px", borderRadius: 8, background: darkMode ? "rgba(37,211,102,0.1)" : CONTEXTS[cKey].light, border: `1px solid ${CONTEXTS[cKey].color}` }}>
                            <div style={{ fontSize: 11, fontWeight: "bold", color: CONTEXTS[cKey].color, marginBottom: 6 }}>{CONTEXTS[cKey].emoji} {CONTEXTS[cKey].label}</div>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {words.map((w, i) => <span key={i} style={{ padding: "2px 8px", borderRadius: 10, background: CONTEXTS[cKey].color, color: "white", fontSize: 12, fontWeight: "bold" }}>{w}</span>)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {item.sentence === "Seni çok" && (
                      <div style={{ marginTop: 10, padding: "8px 12px", background: darkMode ? "rgba(255,152,0,0.15)" : "#FFF8E1", borderRadius: 6, borderLeft: "3px solid #FF9800" }}>
                        <span style={{ fontSize: 12, color: "#E65100" }}>⚠️ WhatsApp'ta %87.2 kullanıcı "seviyorum" aldı. Sistemimiz bağlama göre duygusal/resmi/profesyonel ayrımı yapıyor.</span>
                      </div>
                    )}
                    {item.sentence === "Mükedder" && (
                      <div style={{ marginTop: 10, padding: "8px 12px", background: darkMode ? "rgba(255,152,0,0.15)" : "#FFF8E1", borderRadius: 6, borderLeft: "3px solid #FF9800" }}>
                        <span style={{ fontSize: 12, color: "#E65100" }}>⚠️ En yüksek chi² (274.69): Nadir kelimede markalar tamamen farklı varsayılan modele düştü.</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── RESEARCH PAGE ── */}
      {page === "research" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <div style={{ background: surface, borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <h2 style={{ margin: "0 0 8px", color: textColor, fontSize: 18 }}>📊 Araştırma Bulguları</h2>
              <p style={{ margin: 0, color: subText, fontSize: 13 }}>94 katılımcı • 6 test cümlesi • WhatsApp klavye öneri sistemi analizi</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              {RESEARCH_DATA.keyFindings.map((f, i) => (
                <div key={i} style={{ background: surface, borderRadius: 12, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{f.icon}</div>
                  <div style={{ fontWeight: "bold", color: textColor, fontSize: 14, marginBottom: 4 }}>{f.title}</div>
                  <div style={{ color: subText, fontSize: 12 }}>{f.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ background: surface, borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              <h3 style={{ margin: "0 0 16px", color: textColor, fontSize: 16 }}>Chi-Square Test Sonuçları</h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#1F4E79" }}>
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
                        <span style={{ background: "#f4f4f5", color: "#2E7D32", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: "bold" }}>✅ {row.result}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                      <div style={{ flex: 1, background: darkMode ? "#333" : "#eee", borderRadius: 4, height: 16 }}>
                        <div style={{ width: `${(m.val / 5) * 100}%`, background: m.color, borderRadius: 4, height: "100%", transition: "width 0.5s" }} />
                      </div>
                      <span style={{ width: 32, fontSize: 11, color: textColor, fontWeight: "bold" }}>{m.val}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ background: darkMode ? "rgba(63,81,181,0.2)" : "#E8EAF6", borderRadius: 12, padding: 20, borderLeft: "4px solid #3F51B5" }}>
              <h3 style={{ margin: "0 0 8px", color: "#3F51B5", fontSize: 15 }}>🎯 Ana Sonuç</h3>
              <p style={{ margin: 0, fontSize: 13, color: darkMode ? "#aaa" : "#333", lineHeight: 1.6 }}>
                Mobil klavye öneri sistemi <strong>kullanıcıyı değil, işletim sistemini tanımaktadır.</strong> Telefon markası tek belirleyici faktördür. Bu prototip araştırmanın ortaya koyduğu eksikliğe bağlam duyarlı bir çözüm sunmaktadır.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}