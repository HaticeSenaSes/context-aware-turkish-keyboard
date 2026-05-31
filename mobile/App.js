import { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, StatusBar, KeyboardAvoidingView, Platform, SafeAreaView
} from "react-native";

const API = "http://localhost:8000";

const CONTEXTS = {
  arkadaş: { label: "Arkadaş", emoji: "👫", color: "#25D366" },
  hoca:    { label: "Hoca",    emoji: "👨‍🏫", color: "#2196F3" },
  is:      { label: "İş",      emoji: "💼",  color: "#9C27B0" },
  spor:    { label: "Spor",    emoji: "⚽",  color: "#FF5722" },
  gundelik:{ label: "Gündelik",emoji: "☀️",  color: "#FF9800" },
};

export default function App() {
  const [context, setContext] = useState("arkadaş");
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [warning, setWarning] = useState(null);
  const scrollRef = useRef(null);
  const ctx = CONTEXTS[context];

  useEffect(() => {
    if (!text.trim()) { setSuggestions([]); return; }
    const t = setTimeout(fetchSuggestions);
    return () => clearTimeout(t);
  }, [text, context]);

  useEffect(() => {
    if (!text || text.length < 10) { setWarning(null); return; }
    const t = setTimeout(() => checkWarning(text), 1500);
    return () => clearTimeout(t);
  }, [text, context]);

  async function fetchSuggestions() {
    try {
      setSuggestions([]);
      const res = await fetch(API + "/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context, n_suggestions: 3, history: [] }),
      });
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch { setSuggestions([]); }
  }

  async function checkWarning(t) {
    try {
      const res = await fetch(API + "/check-warning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t, context }),
      });
      const data = await res.json();
      setWarning(data.warning ? data : null);
    } catch {}
  }

  function acceptSuggestion(word) {
    const parts = text.split(" ");
    parts[parts.length - 1] = word;
    setText(parts.join(" ") + " ");
  }

  function sendMessage() {
    if (!text.trim()) return;
    setMessages(prev => [...prev, {
      text: text.trim(), context,
      time: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    }]);
    setText("");
    setSuggestions([]);
    setWarning(null);
    setTimeout(() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }), 100);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f5f5f5" }}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.header, { backgroundColor: ctx.color }]}>
        <Text style={styles.headerTitle}>Bağlam Duyarlı Öneri</Text>
        <Text style={styles.headerSub}>{ctx.emoji} {ctx.label} bağlamı aktif</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ backgroundColor: "white", maxHeight: 52, borderBottomWidth: 1, borderColor: "#eee" }}
        contentContainerStyle={{ padding: 8, gap: 8 }}>
        {Object.entries(CONTEXTS).map(([key, val]) => (
          <TouchableOpacity key={key} onPress={() => setContext(key)}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5,
              borderColor: val.color, backgroundColor: context === key ? val.color : "white", marginRight: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: context === key ? "white" : val.color }}>
              {val.emoji} {val.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {messages.length === 0 && (
          <Text style={{ textAlign: "center", color: "#aaa", marginTop: 40, fontSize: 14 }}>
            Yazmaya başla, sistem bağlama göre öneri sunsun
          </Text>
        )}
        {messages.map((m, i) => (
          <View key={i} style={{ alignSelf: "flex-end", backgroundColor: "#DCF8C6",
            borderRadius: 12, padding: 10, marginBottom: 8, maxWidth: "80%" }}>
            <Text style={{ fontSize: 15, color: "#1a1a1a" }}>{m.text}</Text>
            <Text style={{ fontSize: 10, color: "#888", marginTop: 4, textAlign: "right" }}>
              {CONTEXTS[m.context].emoji} {m.time}
            </Text>
          </View>
        ))}
      </ScrollView>

      {warning && (
        <View style={{ backgroundColor: "#FFF8E1", padding: 12, borderLeftWidth: 4,
          borderLeftColor: "#FF9800", margin: 8, borderRadius: 8 }}>
          <Text style={{ color: "#E65100", fontSize: 13, fontWeight: "bold" }}>⚠️ {warning.message}</Text>
          {warning.suggestion && (
            <Text style={{ color: "#666", fontSize: 12, marginTop: 4 }}>💡 {warning.suggestion}</Text>
          )}
        </View>
      )}

      {suggestions.length > 0 && (
        <View style={{ flexDirection: "row", backgroundColor: "#F0F0F0",
          borderTopWidth: 1, borderColor: "#ddd" }}>
          {suggestions.map((s, i) => (
            <TouchableOpacity key={i} onPress={() => acceptSuggestion(s)}
              style={{ flex: 1, padding: 12, alignItems: "center",
                borderRightWidth: i < suggestions.length - 1 ? 1 : 0, borderRightColor: "#ddd" }}>
              <Text style={{ fontSize: 14, color: "#333", fontWeight: "500" }}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flexDirection: "row", padding: 8, backgroundColor: "white",
          alignItems: "flex-end", borderTopWidth: 1, borderColor: "#eee" }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={ctx.emoji + " " + ctx.label + " bağlamında yaz......"}
            style={{ flex: 1, backgroundColor: "#f5f5f5", borderRadius: 20,
              paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100 }}
            multiline
          />
          <TouchableOpacity onPress={sendMessage}
            style={{ width: 44, height: 44, borderRadius: 22, justifyContent: "center",
              alignItems: "center", marginLeft: 8, backgroundColor: ctx.color }}>
            <Text style={{ color: "white", fontSize: 18 }}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { padding: 16, paddingTop: 8 },
  headerTitle: { color: "white", fontSize: 18, fontWeight: "bold" },
  headerSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
});
