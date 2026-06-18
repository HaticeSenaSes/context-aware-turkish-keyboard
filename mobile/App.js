import { useState, useEffect, useRef } from "react";
import { useColorScheme } from "react-native";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, StatusBar, KeyboardAvoidingView, Platform,
  SafeAreaView, Alert, Image, Animated as RNAnimated,
  LayoutAnimation, UIManager, TouchableWithoutFeedback, Keyboard, Dimensions
} from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { Swipeable, GestureHandlerRootView } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";


const API = "https://context-aware-turkish-keyboard.onrender.com";

const CONTEXTS = {
  arkadas: { label: "Arkadaş", emoji: "", color: "#18181b", light: "#f4f4f5" },
  hoca:    { label: "Hoca",    emoji: "", color: "#18181b", light: "#f4f4f5" },
  is:      { label: "İş",      emoji: "", color: "#18181b", light: "#f4f4f5" },
  spor:    { label: "Spor",    emoji: "", color: "#18181b", light: "#f4f4f5" },
  gundelik:{ label: "Gündelik",emoji: "", color: "#18181b", light: "#f4f4f5" },
};

const DEFAULT_CONTACTS = [
  { id: 1, name: "Hocam", context: "hoca", emoji: "👨‍🏫" },
  { id: 2, name: "Arkadaşım", context: "arkadas", emoji: "👫" },  
  { id: 3, name: "Müdürüm", context: "is", emoji: "💼" },
];

function makePersonalEntry(word, scope, scopeId, blocked = false) {
  return { id: Date.now() + Math.random(), word: word.trim().toLowerCase(), scope, scopeId, blocked };
}

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const Tab = createBottomTabNavigator();

function ChatScreen({ route, darkMode, setDarkMode }) {
  const isDark = darkMode;
  const bg = isDark ? "#0f0f0f" : "#f4f4f5";
  const surface = isDark ? "#1c1c1e" : "#ffffff";
  const textColor = isDark ? "#ffffff" : "#1a1a1a";
  const subColor = isDark ? "#888" : "#666";
  const initialContext = route?.params?.context || "arkadas";
  const [context, setContext] = useState(initialContext);
  const [personalWords, setPersonalWords] = useState([]);

  useEffect(() => {
    AsyncStorage.getItem("personal_words").then(v => { if (v) setPersonalWords(JSON.parse(v)); });
  }, []);
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [warning, setWarning] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [serverWaking, setServerWaking] = useState(false);
  const scrollRef = useRef(null);
  const suggestAnim = useRef(new RNAnimated.Value(0)).current;
  const ctx = CONTEXTS[context] || CONTEXTS.arkadas;

  useEffect(() => {
    fetch(API + "/").catch(() => {});
    const interval = setInterval(() => {
      fetch(API + "/").catch(() => {});
    }, 4 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);
  
  // Mesajları yükle
  useEffect(() => {
    setMessages([]);
    AsyncStorage.getItem("messages_" + context).then(val => {
      if (val) setMessages(JSON.parse(val));
      else setMessages([]);
    }).catch(() => { setMessages([]); });
  }, [context]);

  // Mesajları kaydet
  useEffect(() => {
    if (messages.length > 0) {
      AsyncStorage.setItem("messages_" + context, JSON.stringify(messages.slice(-50)));
    }
  }, [messages]);

  useEffect(() => {
    if (route?.params?.context) setContext(route.params.context);
  }, [route?.params]);

  useEffect(() => {
    if (!text.trim()) { setSuggestions([]); return; }
    const t = setTimeout(fetchSuggestions, 400);
    return () => clearTimeout(t);
  }, [text, context]);

  useEffect(() => {
    if (!text || text.length < 3) { setWarning(null); return; }    const t = setTimeout(() => checkWarning(text), 1500);
    return () => clearTimeout(t);
  }, [text, context]);

  async function fetchWithRetry(url, options, retries = 3, delay = 2000) {
    for (let i = 0; i < retries; i++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeout);
        return res;
      } catch (e) {
        if (i === retries - 1) throw e;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  function getActivePersonalWords() {
    // Bu konuşmaya uygulanabilecek kelimeler: bu KİŞİYE özel olanlar + bu BAĞLAMA özel olanlar
    const contactId = route?.params?.contact?.id;
    return personalWords.filter(w => {
      if (w.scope === "contact") return contactId && w.scopeId === contactId;
      if (w.scope === "context") return w.scopeId === context;
      return false;
    });
  }
  
  async function fetchSuggestions() {
    const activeWords = getActivePersonalWords();
    const blockedWords = new Set(activeWords.filter(w => w.blocked).map(w => w.word));
    const taughtPhrases = activeWords.filter(w => !w.blocked && w.word.includes(" "));
  
    // Kişisel ifade eşleşmesi kontrolü (sadece bu kişiye/bağlama öğretilmiş ifadeler)
    const lastWord = text.trim().split(/\s+/).pop()?.toLowerCase() || "";
    const phraseMatch = taughtPhrases.find(w =>
      w.word.startsWith(lastWord) && lastWord.length >= 2
    );
    if (phraseMatch) {
      setSuggestions([phraseMatch.word]);
      suggestAnim.setValue(0);
      RNAnimated.spring(suggestAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }).start();
      return;
    }
  
    try {
      setServerWaking(true);
      const timer = setTimeout(() => setServerWaking(false), 3000);
      const historyWords = activeWords.filter(w => !w.blocked).map(w => w.word);
      const res = await fetchWithRetry(API + "/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context, n_suggestions: 5, history: [...historyWords, ...messages.slice(-5).map(m => m.text)] }),
      });
      clearTimeout(timer);
      setServerWaking(false);
      const data = await res.json();
      let newSuggestions = data.suggestions || [];
      // Engellenen kelimeleri sunucu önerilerinden çıkar, sonra ilk 3'e kırp
      newSuggestions = newSuggestions.filter(sg => !blockedWords.has(sg.toLowerCase())).slice(0, 3);
      setSuggestions(newSuggestions);
      if (newSuggestions.length > 0) {
        suggestAnim.setValue(0);
        RNAnimated.spring(suggestAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }).start();
      }
    } catch(e) { console.error("FETCH ERROR:", e); setSuggestions([]); }
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

  async function completeSentence() {
    if (!text.trim()) return;
    setCompleting(true);
    try {
      const res = await fetch(API + "/suggest-sentence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context }),
      });
      const data = await res.json();
      if (data.suggestion) setText(data.suggestion);
    } catch {}
    setCompleting(false);
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
    setText(""); setSuggestions([]); setWarning(null);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="#18181b" />
      <View style={s.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Image source={require("./assets/icon.png")} style={{ width: 36, height: 36, borderRadius: 8 }} />
          <View>
            <Text style={s.headerTitle}>ChatSense</Text>
            <Text style={s.headerSub}>{ctx.emoji} {ctx.label} bağlamı</Text>
          </View>
        </View>

      </View>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled" onScrollBeginDrag={Keyboard.dismiss}>
        {messages.length === 0 && (
          <View style={{ alignItems: "center", marginTop: 60 }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>{ctx.emoji}</Text>
             <Text style={{ fontSize: 14, color: "#888", textAlign: "center" }}>Yazmaya başla, sistem bağlama göre öneri sunsun</Text>
          </View>
        )}
        {messages.map((m, i) => (
          <TouchableOpacity key={i} onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Alert.alert("Mesajı Sil", "Bu mesajı silmek istiyor musun?", [{text: "İptal", style: "cancel"}, {text: "Sil", style: "destructive", onPress: () => setMessages(prev => prev.filter((_, idx) => idx !== i))}]); }} style={[s.bubble, { backgroundColor: isDark ? "#3b2d6e" : "#e8e0ff" }]}>
            <Text style={{ fontSize: 15, color: isDark ? "#ffffff" : "#3b2d6e", lineHeight: 20 }}>{m.text}</Text>
            <Text style={{ fontSize: 10, color: isDark ? "rgba(255,255,255,0.5)" : "#7c6aad", marginTop: 4, textAlign: "right" }}>{m.time}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {serverWaking && (
        <View style={{ backgroundColor: "#EEF2FF", margin: 8, padding: 8, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 12, color: "#6366f1" }}>⏳ Sunucu uyanıyor, biraz bekle...</Text>
        </View>
      )}
      {warning && (
        <View style={s.warningBox}>
          <Text style={{ color: "#92400e", fontSize: 13, fontWeight: "bold" }}>⚠️ {warning.message}</Text>
          {warning.suggestion && <Text style={{ color: "#666", fontSize: 12, marginTop: 4 }}>💡 {warning.suggestion}</Text>}
        </View>
      )}
      {text.length > 3 && (
        <TouchableOpacity onPress={completeSentence}
          style={{ marginHorizontal: 12, marginBottom: 4, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: ctx.color, backgroundColor: ctx.color + "22", alignItems: "center" }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: ctx.color }}>{completing ? "..." : "✨ Cümleyi Tamamla"}</Text>
        </TouchableOpacity>
      )}
      {suggestions.length > 0 && (
        <RNAnimated.View style={{ flexDirection: "row", backgroundColor: isDark ? "#1c1c1e" : "#F8F8F8", borderTopWidth: 1, borderColor: isDark ? "#333" : "#eee",
          opacity: suggestAnim,
          transform: [{ translateY: suggestAnim.interpolate({ inputRange: [0,1], outputRange: [8,0] }) }] }}>
          {suggestions.map((sg, i) => (
            <TouchableOpacity key={i} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); acceptSuggestion(sg); }}
              style={{ flex: 1, padding: 12, alignItems: "center", borderRightWidth: i < suggestions.length - 1 ? 1 : 0, borderRightColor: "#e5e5e5" }}>
              <Text style={{ fontSize: 14, color: textColor, fontWeight: "500" }}>{sg}</Text>
            </TouchableOpacity>
          ))}
        </RNAnimated.View>
      )}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flexDirection: "row", padding: 10, backgroundColor: "white", alignItems: "flex-end", borderTopWidth: 1, borderColor: "#f0f0f0" }}>
          <TextInput value={text} onChangeText={setText}
            placeholder={ctx.emoji + " " + ctx.label + " bağlamında yaz..."}
            placeholderTextColor="#aaa"
            style={{ flex: 1, backgroundColor: isDark ? "#2c2c2e" : "#f4f4f5", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100, color: textColor }}
            multiline />
          <TouchableOpacity onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); sendMessage(); }} style={[s.sendBtn, { backgroundColor: ctx.color }]}>
            <Text style={{ color: "white", fontSize: 16 }}>›</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ContactsScreen({ navigation, darkMode }) {
  const isDark = darkMode;
  const bg = isDark ? "#0f0f0f" : "#f4f4f5";
  const surface = isDark ? "#1c1c1e" : "#ffffff";
  const textColor = isDark ? "#ffffff" : "#1a1a1a";
  const [contacts, setContacts] = useState(DEFAULT_CONTACTS);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCtx, setNewCtx] = useState("arkadas");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  useEffect(() => {
    AsyncStorage.setItem("contacts_list", JSON.stringify(contacts));
  }, [contacts]);
  
  function addContact() {
    if (!newName.trim()) return;
    setContacts(prev => [...prev, { id: Date.now(), name: newName.trim(), context: newCtx, emoji: CONTEXTS[newCtx].emoji }]);
    setNewName(""); setShowAdd(false);
  }
  
  function deleteContact(id) {
    Alert.alert("Sil", "Bu kisiyi silmek istiyor musun?", [
      { text: "Iptal", style: "cancel" },
      { text: "Sil", style: "destructive", onPress: () => setContacts(prev => prev.filter(c => c.id !== id)) }
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <View style={[s.header, { justifyContent: "space-between" }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Image source={require("./assets/icon.png")} style={{ width: 32, height: 32, borderRadius: 8 }} />
        <Text style={s.headerTitle}>Kişiler</Text>
      </View>
      <TouchableOpacity onPress={() => setShowAdd(true)} style={[s.csLogo, { backgroundColor: "#18181b" }]}>
        <Text style={{ color: "white", fontSize: 22, lineHeight: 24 }}>+</Text>
      </TouchableOpacity>
    </View>
    <View style={{ paddingHorizontal: 16, paddingTop: 12, backgroundColor: bg }}>
      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="🔍 Kişi ara..."
        placeholderTextColor="#aaa"
        style={{ backgroundColor: surface, borderRadius: 10, padding: 12, fontSize: 14, color: textColor }}
      />
    </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {showAdd && (
          <View style={{ backgroundColor: surface, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "bold", marginBottom: 12 }}>Yeni Kişi Ekle</Text>
            <TextInput value={newName} onChangeText={setNewName} placeholder="İsim (örn. Hocam, Annem)"
              style={{ backgroundColor: isDark ? "#2c2c2e" : "#f4f4f5", borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 12, color: textColor }} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {Object.entries(CONTEXTS).map(([key, val]) => (
                <TouchableOpacity key={key} onPress={() => setNewCtx(key)}
                  style={[s.ctxBtn, { borderColor: val.color, marginRight: 8, backgroundColor: newCtx === key ? val.color : "white" }]}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: newCtx === key ? "white" : val.color }}>{val.emoji} {val.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity onPress={addContact} style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: "#18181b", alignItems: "center" }}>
                <Text style={{ color: "white", fontWeight: "bold" }}>Kaydet</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowAdd(false)} style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: "#f4f4f5", alignItems: "center", borderWidth: 1, borderColor: "#ddd" }}>
                <Text style={{ color: "#666" }}>Iptal</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {filteredContacts.map(contact => {
          const cv = CONTEXTS[contact.context] || CONTEXTS.arkadas;
          const renderRightActions = () => (
            <TouchableOpacity
              onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); deleteContact(contact.id); }}
              style={{ backgroundColor: "#ef4444", justifyContent: "center", alignItems: "center", width: 80, borderRadius: 12, marginBottom: 10, marginLeft: -12 }}>
              <Text style={{ color: "white", fontSize: 18 }}>🗑️</Text>
              <Text style={{ color: "white", fontSize: 11, marginTop: 2 }}>Sil</Text>
            </TouchableOpacity>
          );
          return (
            <Swipeable key={contact.id} renderRightActions={renderRightActions}>
              <TouchableOpacity
                onPress={() => navigation.navigate("Chat", { context: contact.context, contact: contact })}
                style={{ backgroundColor: surface, borderRadius: 12, padding: 16, marginBottom: 10, flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#18181b", justifyContent: "center", alignItems: "center", marginRight: 12 }}>
                  <Text style={{ fontSize: 16, color: "white", fontWeight: "bold" }}>{contact.name[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "bold", color: textColor }}>{contact.name}</Text>
                  <Text style={{ fontSize: 12, marginTop: 2, color: "#666" }}>{cv.label} bağlamı</Text>
                </View>
                <Text style={{ color: "#ccc", fontSize: 16 }}>›</Text>
              </TouchableOpacity>
            </Swipeable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function ResearchScreen({ darkMode, setDarkMode }) {
  const isDark = darkMode;
  const bg = isDark ? "#0f0f0f" : "#f4f4f5";
  const surface = isDark ? "#1c1c1e" : "#ffffff";
  const textColor = isDark ? "#ffffff" : "#1a1a1a";
  const findings = [
    { icon: "01", title: "Telefon Markası Belirleyici", desc: "Cinsiyet, yaş, bölüm etkisiz. Sadece marka farklılaştırıyor." },
    { icon: "02", title: "iPhone En Homojen", desc: "5/6 cümlede en düşük entropi. iOS en standart önerileri veriyor." },
    { icon: "03", title: "'Seni çok' → %87 'seviyorum'", desc: "Duygusal dil en standartlaşmış register." },
    { icon: "04", title: "Nadir Kelime Testi", desc: "'Mükedder' için en yüksek chi² = 274.69" },
  ];
  const chiData = [
    ["Bugün hava", "72.00"], ["Bu hafta sonu", "119.27"], ["Seni çok", "34.16"],
    ["Sinav icin", "121.48"], ["Mükedder", "274.69"], ["Bence en iyisi", "108.38"],
  ];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <View style={[s.header, { flexDirection: "row", alignItems: "center" }]}>
        <Image source={require("./assets/icon.png")} style={{ width: 32, height: 32, borderRadius: 8, marginRight: 10 }} />
        <View>
          <Text style={s.headerTitle}>Araştırma</Text>
          <Text style={[s.headerSub, {marginTop: 2}]}>94 katılımcı  •  6 test cümlesi</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={s.sectionTitle}>Temel Bulgular</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
          {findings.map((f, i) => (
            <View key={i} style={{ width: "47%", backgroundColor: surface, borderRadius: 12, padding: 14 }}>
              <View style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: "#18181b", justifyContent: "center", alignItems: "center", marginBottom: 8 }}><Text style={{ color: "white", fontSize: 11, fontWeight: "bold" }}>{f.icon}</Text></View>
              <Text style={{ fontSize: 13, fontWeight: "bold", color: textColor, marginBottom: 4 }} numberOfLines={2}>{f.title}</Text>
              <Text style={{ fontSize: 11, color: "#666", lineHeight: 16 }} numberOfLines={4}>{f.desc}</Text>
            </View>
          ))}
        </View>
        <Text style={s.sectionTitle}>Chi-Square Sonuçları</Text>
        <View style={{ backgroundColor: surface, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
          <View style={{ flexDirection: "row", backgroundColor: "#18181b", padding: 10 }}>
            {["Test Cumlesi", "Chi²", "p"].map(h => (
              <Text key={h} style={{ flex: h === "Test Cumlesi" ? 2 : 1, color: "white", fontWeight: "bold", fontSize: 13 }}>{h}</Text>
            ))}
          </View>
          {chiData.map(([sentence, chi], i) => (
            <View key={i} style={{ flexDirection: "row", padding: 10, borderBottomWidth: 1, borderColor: "#f0f0f0", backgroundColor: sentence === "Mükedder" ? "#f0f0f0" : i % 2 === 1 ? "#f8f8f8" : "white" }}>
              <Text style={{ flex: 2, fontSize: 13, color: "#333", fontWeight: sentence === "Mükedder" ? "bold" : "normal" }}>{sentence === "Mükedder" ? <Text style={{color:"#f59e0b"}}>"{sentence}" ★</Text> : `"${sentence}"`}</Text>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: "bold", color: "#18181b" }}>{chi}</Text>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: "#555" }}>{"<0.001"}</Text>
            </View>
          ))}
        </View>
        <View style={{ backgroundColor: "#f4f4f5", borderRadius: 12, padding: 16, borderLeftWidth: 4, borderLeftColor: "#18181b" }}>
          <Text style={{ fontSize: 15, fontWeight: "bold", color: "#18181b", marginBottom: 6 }}>Sonuc</Text>
          <Text style={{ fontSize: 13, color: "#555", lineHeight: 20 }}>
            WhatsApp sistemi bireyi degil, isletim sistemini taniyor. ChatSense bu problemi cozuyor.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CompareScreen({ darkMode }) {
  const isDark = darkMode;
  const bg = isDark ? "#0f0f0f" : "#f4f4f5";
  const surface = isDark ? "#1c1c1e" : "#ffffff";
  const textColor = isDark ? "#ffffff" : "#1a1a1a";
  const [expanded, setExpanded] = useState(null);
  const [customText, setCustomText] = useState("");
  const [customResults, setCustomResults] = useState(null);
  const [loadingCustom, setLoadingCustom] = useState(false);

  const data = [
    { sentence: "Bugün hava", whatsapp: { iPhone: ["nasıl","83%"], Samsung: ["çok","81%"], Xiaomi: ["nasıl","75%"] }, arkadas: ["çok","güzel","nasıl"], hoca: ["iyi","bugün","hocam"], is: ["raporunu","toplanti","iyi"] },
    { sentence: "Bu hafta sonu", whatsapp: { iPhone: ["bir","89%"], Samsung: ["da","81%"], Xiaomi: ["da","83%"] }, arkadas: ["ne yapalım","gidelim","müsait"], hoca: ["teslim","sınav","ödev"], is: ["toplantı","rapor","tatil"] },
    { sentence: "Seni çok", whatsapp: { iPhone: ["seviyorum","87%"], Samsung: ["seviyorum","87%"], Xiaomi: ["seviyorum","100%"] }, arkadas: ["özledim","seviyorum","özledik"], hoca: ["teşekkür","saygılarımla","bilgi"], is: ["takdir","değerli","teşekkür"] },
    { sentence: "Sınav için", whatsapp: { iPhone: ["de","85%"], Samsung: ["mi","41%"], Xiaomi: ["tıkladığınızdaki","75%"] }, arkadas: ["çalışalım","hazırlandın","korktum"], hoca: ["bilgi","tarih","kapsam"], is: ["rapor","hazırlık","sunum"] },
    { sentence: "Mükedder", whatsapp: { iPhone: ["sokak","89%"], Samsung: ["nasılsın","78%"], Xiaomi: ["bu","-"] }, arkadas: ["ne","kimdi","garip"], hoca: ["anlamı","kelime","bilmiyorum"], is: ["terim","anlam","araştır"] },
    { sentence: "Bence en iyisi", whatsapp: { iPhone: ["sen","80%"], Samsung: ["bu","93%"], Xiaomi: ["bu","50%"] }, arkadas: ["bu","gidelim","film"], hoca: ["yöntem","çözüm","seçenek"], is: ["strateji","yaklaşım","plan"] },
  ];

  async function runCustomCompare() {
    if (!customText.trim()) return;
    setLoadingCustom(true);
    setCustomResults(null);
    try {
      const res = await fetch(API + "/compare?text=" + encodeURIComponent(customText.trim()));
      const json = await res.json();
      setCustomResults(json.context_predictions || {});
    } catch (e) {
      setCustomResults({ error: true });
    }
    setLoadingCustom(false);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <View style={[s.header, { flexDirection: "row", alignItems: "center" }]}>
        <Image source={require("./assets/icon.png")} style={{ width: 32, height: 32, borderRadius: 8 }} />
        <View style={{ marginLeft: 10 }}>
          <Text style={s.headerTitle}>Karşılaştır</Text>
          <Text style={[s.headerSub, {marginTop: 2}]}>WhatsApp vs ChatSense</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ backgroundColor: "#f4f4f5", borderRadius: 10, padding: 12, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: "#18181b" }}>
          <Text style={{ fontSize: 13, color: "#555", lineHeight: 18 }}>
            WhatsApp cihaz bazlı standart öneri sunarken, ChatSense alıcıya göre farklılaştırır. Aşağıda anket verisi (94 katılımcı) ile karşılaştırma var.
          </Text>
        </View>

        {/* Kendi cümleni dene */}
        <View style={{ backgroundColor: surface, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: textColor, marginBottom: 10 }}>🔍 Kendi Cümleni Dene</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              value={customText}
              onChangeText={setCustomText}
              placeholder="Bir cümle yaz..."
              placeholderTextColor="#aaa"
              style={{ flex: 1, backgroundColor: isDark ? "#2c2c2e" : "#f4f4f5", borderRadius: 10, padding: 12, fontSize: 14, color: textColor }}
              onSubmitEditing={runCustomCompare}
            />
            <TouchableOpacity onPress={runCustomCompare} style={{ backgroundColor: "#18181b", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" }}>
              <Text style={{ color: "white", fontWeight: "600" }}>{loadingCustom ? "..." : "Karşılaştır"}</Text>
            </TouchableOpacity>
          </View>
          {customResults && !customResults.error && (
            <View style={{ marginTop: 14 }}>
              {Object.entries(customResults).map(([ckey, words]) => (
                <View key={ckey} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#18181b", width: 80 }}>{CONTEXTS[ckey]?.label || ckey}</Text>
                  <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap" }}>
                    {(words.length ? words : ["-"]).map((w, wi) => (
                      <View key={wi} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: "#18181b" }}>
                        <Text style={{ color: "white", fontSize: 11, fontWeight: "bold" }}>{w}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}
          {customResults?.error && (
            <Text style={{ fontSize: 12, color: "#ef4444", marginTop: 10 }}>⏳ Sunucu uyanıyor olabilir, birkaç saniye sonra tekrar dene.</Text>
          )}
        </View>

        <Text style={{ fontSize: 13, fontWeight: "700", color: "#888", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Anket Cümleleri (94 katılımcı)</Text>

        {data.map((item, idx) => (
          <View key={idx} style={{ backgroundColor: surface, borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
            <TouchableOpacity
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setExpanded(expanded === idx ? null : idx);
              }}
              style={{ padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: 15, fontWeight: "bold", color: textColor }}>"{item.sentence}"</Text>
              <Text style={{ color: "#999", fontSize: 14 }}>{expanded === idx ? "▲" : "▼"}</Text>
            </TouchableOpacity>
            {expanded === idx && (
              <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#999", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>WHATSAPP (anket verisi)</Text>
                {Object.entries(item.whatsapp).map(([brand, [word, pct]]) => (
                  <View key={brand} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: "#666", width: 80 }}>{brand}</Text>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: "#555" }}>
                      <Text style={{ color: "white", fontSize: 11, fontWeight: "bold" }}>{word} {pct !== "-" ? `(${pct})` : ""}</Text>
                    </View>
                  </View>
                ))}
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#18181b", textTransform: "uppercase", letterSpacing: 1.5, marginTop: 12, marginBottom: 8 }}>CHATSENSE</Text>
                {[["arkadas",item.arkadas],["hoca",item.hoca],["is",item.is]].map(([ckey, words]) => (
                  <View key={ckey} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: "#18181b", width: 80 }}>{CONTEXTS[ckey].label}</Text>
                    <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap" }}>
                      {words.map((w, wi) => (
                        <View key={wi} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: "#18181b" }}>
                          <Text style={{ color: "white", fontSize: 11, fontWeight: "bold" }}>{w}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}


function SettingsScreen({ darkMode, setDarkMode }) {
  const isDark = darkMode;
  const bg = isDark ? "#0f0f0f" : "#f4f4f5";
  const surface = isDark ? "#1c1c1e" : "#ffffff";
  const textColor = isDark ? "#ffffff" : "#1a1a1a";
  const [userName, setUserName] = useState("");
  const [editName, setEditName] = useState(false);
  const [tempName, setTempName] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [personalWords, setPersonalWords] = useState([]);
  const [newWord, setNewWord] = useState("");
  const [newWordScope, setNewWordScope] = useState("context");
  const [newWordScopeId, setNewWordScopeId] = useState("arkadas");
  const [newWordBlocked, setNewWordBlocked] = useState(false);
  const [contactsList, setContactsList] = useState(DEFAULT_CONTACTS);

  useEffect(() => {
    AsyncStorage.getItem("personal_words").then(v => { if (v) setPersonalWords(JSON.parse(v)); });
  }, []);

  function addWord() {
    if (!newWord.trim()) return;
    const entry = makePersonalEntry(newWord, newWordScope, newWordScopeId, newWordBlocked);
    const updated = [...personalWords, entry];
    setPersonalWords(updated);
    AsyncStorage.setItem("personal_words", JSON.stringify(updated));
    setNewWord("");
  }
  
  function removeWord(id) {
    const updated = personalWords.filter(w => w.id !== id);
    setPersonalWords(updated);
    AsyncStorage.setItem("personal_words", JSON.stringify(updated));
  }

  useEffect(() => {
  AsyncStorage.getItem("personal_words").then(v => { if (v) setPersonalWords(JSON.parse(v)); });
  AsyncStorage.getItem("contacts_list").then(v => { if (v) setContactsList(JSON.parse(v)); });
}, []);

  async function pickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("İzin Gerekli", "Fotoğraf seçmek için galeri izni gerekiyor."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.7
    });
    if (!result.canceled) {
      setAvatar(result.assets[0].uri);
      AsyncStorage.setItem("user_avatar", result.assets[0].uri);
    }
  }

  useEffect(() => {
    AsyncStorage.getItem("user_name").then(v => { if (v) setUserName(v); });
  }, []);

  function saveName() {
    if (!tempName.trim()) return;
    AsyncStorage.setItem("user_name", tempName.trim());
    setUserName(tempName.trim());
    setEditName(false);
  }

  const menuItems = [
    { icon: "moon-outline", label: "Karanlık Mod", type: "toggle", value: isDark, onToggle: () => setDarkMode(!isDark) },
    { icon: "information-circle-outline", label: "Hakkında", type: "action", value: "v1.0", onPress: () => Alert.alert("ChatSense v1.0", "Bağlam duyarlı Türkçe kelime öneri sistemi.\n\nGeliştirici: Hatice Sena SES\nYeditepe Üniversitesi, 2026", [{text: "Tamam"}]) },
    { icon: "school-outline", label: "Araştırma", type: "info", value: "94 katılımcı • Yeditepe Üniversitesi" },
    { icon: "code-outline", label: "Teknoloji", type: "info", value: "FastAPI + Groq AI + N-gram" },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <View style={[s.header, { flexDirection: "row", alignItems: "center", gap: 10 }]}>
        <Image source={require("./assets/icon.png")} style={{ width: 32, height: 32, borderRadius: 8 }} />
        <Text style={s.headerTitle}>Ayarlar</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        
        {/* Profil kartı */}
        <View style={{ backgroundColor: surface, borderRadius: 16, padding: 20, marginBottom: 16, alignItems: "center" }}>
          <TouchableOpacity onPress={pickAvatar} style={{ position: "relative", marginBottom: 12 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#6366f1", justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
              {avatar
                ? <Image source={{ uri: avatar }} style={{ width: 72, height: 72 }} />
                : <Text style={{ fontSize: 28, fontWeight: "bold", color: "white" }}>{userName ? userName[0].toUpperCase() : "?"}</Text>
              }
            </View>
            <View style={{ position: "absolute", bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: "#18181b", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "white" }}>
              <Text style={{ color: "white", fontSize: 10 }}>📷</Text>
            </View>
          </TouchableOpacity>
          {editName ? (
            <View style={{ width: "100%", flexDirection: "row", gap: 8 }}>
              <TextInput
                value={tempName}
                onChangeText={setTempName}
                placeholder="İsminizi girin"
                placeholderTextColor="#aaa"
                style={{ flex: 1, backgroundColor: isDark ? "#2c2c2e" : "#f4f4f5", borderRadius: 10, padding: 10, fontSize: 15, color: textColor }}
                autoFocus
              />
              <TouchableOpacity onPress={saveName} style={{ backgroundColor: "#6366f1", borderRadius: 10, padding: 10, justifyContent: "center" }}>
                <Ionicons name="checkmark" size={20} color="white" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => { setTempName(userName); setEditName(true); }} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 18, fontWeight: "bold", color: textColor }}>
                {userName || "İsim ekle"}
              </Text>
              <Text style={{ color: "#888", fontSize: 12 }}>✏️</Text>
            </TouchableOpacity>
          )}
          <Text style={{ fontSize: 12, color: "#888", marginTop: 4 }}>ChatSense Kullanıcısı</Text>
        </View>

{/* Kişisel Kelimeler */}
<View style={{ backgroundColor: surface, borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: textColor, marginBottom: 4 }}>🧠 Kişisel Kelimeler</Text>
          <Text style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>Bir kelimeyi belirli bir KİŞİYE veya tüm BAĞLAMA özel öğret, ya da o kapsamda tamamen ENGELLE.</Text>

          <TextInput
            value={newWord}
            onChangeText={setNewWord}
            placeholder="Kelime veya ifade yaz..."
            placeholderTextColor="#aaa"
            style={{ backgroundColor: isDark ? "#2c2c2e" : "#f4f4f5", borderRadius: 10, padding: 10, fontSize: 14, color: textColor, marginBottom: 10 }}
          />

          {/* Kapsam seçimi: Kişi mi Bağlam mı */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
            <TouchableOpacity onPress={() => { setNewWordScope("context"); setNewWordScopeId("arkadas"); }}
              style={{ flex: 1, padding: 9, borderRadius: 8, alignItems: "center", backgroundColor: newWordScope === "context" ? "#6366f1" : (isDark ? "#2c2c2e" : "#eee") }}>
              <Text style={{ color: newWordScope === "context" ? "white" : "#888", fontSize: 12, fontWeight: "600" }}>Bağlama özel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setNewWordScope("contact"); setNewWordScopeId(contactsList[0]?.id || null); }}
              style={{ flex: 1, padding: 9, borderRadius: 8, alignItems: "center", backgroundColor: newWordScope === "contact" ? "#6366f1" : (isDark ? "#2c2c2e" : "#eee") }}>
              <Text style={{ color: newWordScope === "contact" ? "white" : "#888", fontSize: 12, fontWeight: "600" }}>Sadece bu kişiye</Text>
            </TouchableOpacity>
          </View>

          {/* Hangi bağlam veya hangi kişi */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            {newWordScope === "context"
              ? Object.entries(CONTEXTS).map(([key, val]) => (
                <TouchableOpacity key={key} onPress={() => setNewWordScopeId(key)}
                  style={[s.ctxBtn, { borderColor: "#6366f1", marginRight: 8, backgroundColor: newWordScopeId === key ? "#6366f1" : "transparent" }]}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: newWordScopeId === key ? "white" : "#6366f1" }}>{val.label}</Text>
                </TouchableOpacity>
              ))
              : contactsList.map(c => (
                <TouchableOpacity key={c.id} onPress={() => setNewWordScopeId(c.id)}
                  style={[s.ctxBtn, { borderColor: "#6366f1", marginRight: 8, backgroundColor: newWordScopeId === c.id ? "#6366f1" : "transparent" }]}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: newWordScopeId === c.id ? "white" : "#6366f1" }}>{c.name}</Text>
                </TouchableOpacity>
              ))
            }
          </ScrollView>

          {/* Öğret mi Engelle mi */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            <TouchableOpacity onPress={() => setNewWordBlocked(false)}
              style={{ flex: 1, padding: 9, borderRadius: 8, alignItems: "center", backgroundColor: !newWordBlocked ? "#16a34a" : (isDark ? "#2c2c2e" : "#eee") }}>
              <Text style={{ color: !newWordBlocked ? "white" : "#888", fontSize: 12, fontWeight: "600" }}>✓ Öner (öğret)</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setNewWordBlocked(true)}
              style={{ flex: 1, padding: 9, borderRadius: 8, alignItems: "center", backgroundColor: newWordBlocked ? "#ef4444" : (isDark ? "#2c2c2e" : "#eee") }}>
              <Text style={{ color: newWordBlocked ? "white" : "#888", fontSize: 12, fontWeight: "600" }}>🚫 Engelle</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={addWord} style={{ backgroundColor: "#18181b", borderRadius: 10, padding: 11, alignItems: "center", marginBottom: 14 }}>
            <Text style={{ color: "white", fontWeight: "700", fontSize: 13 }}>Kaydet</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {personalWords.map((entry) => {
              const scopeLabel = entry.scope === "contact"
                ? (contactsList.find(c => c.id === entry.scopeId)?.name || "Kişi")
                : (CONTEXTS[entry.scopeId]?.label || entry.scopeId);
              return (
                <TouchableOpacity key={entry.id} onPress={() => removeWord(entry.id)}
                  style={{ backgroundColor: entry.blocked ? "#ef4444" : "#6366f1", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ color: "white", fontSize: 12, fontWeight: "700" }}>{entry.blocked ? "🚫" : "✓"} {entry.word}</Text>
                  <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 10 }}>· {scopeLabel}</Text>
                  <Text style={{ color: "white", fontSize: 11 }}>✕</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Menü öğeleri */}
        <View style={{ backgroundColor: surface, borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
          {menuItems.map((item, i) => (
            <TouchableOpacity key={i} onPress={item.onPress || (() => {})} style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: i < menuItems.length - 1 ? 1 : 0, borderColor: isDark ? "#2c2c2e" : "#f0f0f0" }}>
              <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "#6366f1", justifyContent: "center", alignItems: "center", marginRight: 12 }}>
                <Text style={{ fontSize: 14 }}>{ {"moon-outline":"🌙","information-circle-outline":"ℹ️","school-outline":"🎓","code-outline":"💻"}[item.icon] || "•" }</Text>
              </View>
              <Text style={{ flex: 1, fontSize: 15, color: textColor }}>{item.label}</Text>
              {item.type === "toggle" ? (
                <TouchableOpacity
                  onPress={item.onToggle}
                  style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: item.value ? "#6366f1" : "#ccc", justifyContent: "center", paddingHorizontal: 3 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "white", alignSelf: item.value ? "flex-end" : "flex-start" }} />
                </TouchableOpacity>
              ) : (
                <Text style={{ fontSize: 13, color: "#888" }}>{item.value}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* ChatSense hakkında */}
        <View style={{ backgroundColor: "#6366f1", borderRadius: 16, padding: 20, alignItems: "center" }}>
          <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: "#18181b", justifyContent: "center", alignItems: "center", marginBottom: 10 }}><Text style={{ color: "white", fontWeight: "900", fontSize: 16, letterSpacing: -0.5 }}>CS</Text></View>
          <Text style={{ fontSize: 16, fontWeight: "bold", color: "white", marginBottom: 4 }}>ChatSense</Text>
          <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", textAlign: "center", lineHeight: 18 }}>
            Bağlam duyarlı Türkçe kelime öneri sistemi. Yeditepe Üniversitesi Bitirme Projesi.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function SplashScreen({ darkMode }) {
  const fadeAnim = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    RNAnimated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#18181b", justifyContent: "center", alignItems: "center" }}>
      <RNAnimated.View style={{ opacity: fadeAnim, alignItems: "center" }}>
        <Image source={require("./assets/icon.png")} style={{ width: 96, height: 96, borderRadius: 22, marginBottom: 16 }} />
        <Text style={{ fontSize: 28, fontWeight: "bold", color: "white" }}>ChatSense</Text>
        <Text style={{ fontSize: 13, color: "#a5b4fc", marginTop: 6 }}>Bağlama duyarlı kelime önerisi</Text>
      </RNAnimated.View>
    </View>
  );
}

function OnboardingCarousel({ onDone, darkMode }) {
  const bg = darkMode ? "#0f0f0f" : "#f4f4f5";
  const textColor = darkMode ? "#ffffff" : "#1a1a1a";
  const surface = darkMode ? "#1c1c1e" : "#ffffff";
  const { width } = Dimensions.get("window");
  const [index, setIndex] = useState(0);
  const scrollRef = useRef(null);

  const cards = [
    {
      emoji: "💬",
      title: "ChatSense'e Hoş Geldin!",
      body: "Bağlama duyarlı Türkçe kelime öneri sistemi.\nYeditepe Üniversitesi bitirme projesi.",
      highlight: true,
    },
    {
      emoji: "🎯",
      title: "Farkı Ne?",
      body: "Normal yapay zeka asistanları \"kim olduğunu\" sormaz",
      dark: true,
    },
    {
      emoji: "👥",
      title: "Kişiler Sekmesi",
      body: "Bir kişiye dokun, sohbet ekranı o kişinin bağlamıyla (Arkadaş, Hoca, İş, Spor, Gündelik) açılır.",
    },
    {
      emoji: "✨",
      title: "Cümleyi Tamamla",
      body: "Yazdığın cümleyi yapay zekanın tamamlamasını istersen bu butona dokun.",
    },
    {
      emoji: "↔️",
      title: "Karşılaştır",
      body: "Aynı mesajın farklı bağlamlardaki önerilerini ve gerçek WhatsApp verisiyle karşılaştırmasını gör.",
    },
    {
      emoji: "🧠",
      title: "Kişisel Kelimeler",
      body: "Ayarlar'dan sık kullandığın kelimeleri/ifadeleri ekle, ChatSense bunları öncelikli önersin.",
    },
    {
      emoji: "🚀",
      title: "Hazırsın!",
      body: "İlk istek 10-15 saniye sürebilir, sunucu \"uykuda\" olabilir — normaldir, biraz bekle.",
      final: true,
    },
  ];

  function handleScroll(e) {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(newIndex);
  }

  function goNext() {
    if (index < cards.length - 1) {
      scrollRef.current?.scrollTo({ x: width * (index + 1), animated: true });
    } else {
      onDone();
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {cards.map((card, i) => (
          <View key={i} style={{ width, padding: 24, justifyContent: "center", alignItems: "center" }}>
            <View style={{
              backgroundColor: card.dark ? "#18181b" : surface,
              borderRadius: 24, padding: 28, width: "100%", maxWidth: 420, alignItems: "center"
            }}>
              {card.highlight && (
                <Image source={require("./assets/icon.png")} style={{ width: 64, height: 64, borderRadius: 16, marginBottom: 16 }} />
              )}
              <Text style={{ fontSize: 48, marginBottom: 16 }}>{card.emoji}</Text>
              <Text style={{ fontSize: 22, fontWeight: "bold", color: card.dark ? "white" : textColor, marginBottom: 12, textAlign: "center" }}>{card.title}</Text>
              <Text style={{ fontSize: 14, color: card.dark ? "#d1d5db" : "#888", lineHeight: 21, textAlign: "center" }}>{card.body}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={{ flexDirection: "row", justifyContent: "center", marginBottom: 16, gap: 6 }}>
        {cards.map((_, i) => (
          <View key={i} style={{
            width: i === index ? 20 : 8, height: 8, borderRadius: 4,
            backgroundColor: i === index ? "#6366f1" : (darkMode ? "#444" : "#ddd")
          }} />
        ))}
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 24, paddingBottom: 16 }}>
        {index < cards.length - 1 ? (
          <TouchableOpacity onPress={onDone} style={{ padding: 14 }}>
            <Text style={{ color: "#888", fontSize: 15 }}>Geç</Text>
          </TouchableOpacity>
        ) : <View />}
        <TouchableOpacity onPress={goNext} style={{ backgroundColor: "#6366f1", borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14 }}>
          <Text style={{ color: "white", fontSize: 15, fontWeight: "700" }}>
            {index === cards.length - 1 ? "Başla 🚀" : "İleri"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem("onboarding_done").then(val => {
      setShowOnboarding(val !== "true");
    });
    const timer = setTimeout(() => setShowSplash(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash || showOnboarding === null) {
    return <SplashScreen darkMode={darkMode} />;
  }

  if (showOnboarding) {
    return (
      <OnboardingCarousel
        darkMode={darkMode}
        onDone={() => {
          AsyncStorage.setItem("onboarding_done", "true");
          setShowOnboarding(false);
        }}
      />
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: { backgroundColor: "#18181b", borderTopWidth: 0, height: 60, paddingBottom: 8 },
          tabBarActiveTintColor: "#ffffff",
          tabBarInactiveTintColor: "rgba(255,255,255,0.55)",
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
          tabBarIcon: ({ focused, color }) => {
            const emojis = { Kişiler: "👥", Chat: "💬", Karşılaştır: "↔️", Araştırma: "📊", Ayarlar: "⚙️" };
            return <Text style={{ fontSize: 20 }}>{emojis[route.name]}</Text>;
          },
        })}>
        <Tab.Screen name="Kişiler">{(props) => <ContactsScreen {...props} darkMode={darkMode} />}</Tab.Screen>
        <Tab.Screen name="Chat">{(props) => <ChatScreen {...props} darkMode={darkMode} setDarkMode={setDarkMode} />}</Tab.Screen>
        <Tab.Screen name="Karşılaştır">{(props) =><CompareScreen {...props} darkMode={darkMode} />}</Tab.Screen>
        <Tab.Screen name="Araştırma">{(props) => <ResearchScreen {...props} darkMode={darkMode} setDarkMode={setDarkMode} />}</Tab.Screen>
        <Tab.Screen name="Ayarlar">{(props) => <SettingsScreen {...props} darkMode={darkMode} setDarkMode={setDarkMode} />}</Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
    </GestureHandlerRootView>
  );
}

const s = StyleSheet.create({
  header: { backgroundColor: "#18181b", padding: 16, paddingTop: 8, flexDirection: "row", alignItems: "center" },
  headerTitle: { color: "white", fontSize: 17, fontWeight: "bold" },
  headerSub: { color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 1 },
  csLogo: { width: 34, height: 34, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  csLogoText: { color: "white", fontWeight: "900", fontSize: 13 },
  ctxBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5 },
  bubble: { alignSelf: "flex-end", backgroundColor: "#e8e0ff", borderRadius: 16, borderBottomRightRadius: 4, padding: 12, marginBottom: 8, maxWidth: "80%" },
  warningBox: { backgroundColor: "#FFF8E1", margin: 8, padding: 12, borderRadius: 10, borderLeftWidth: 4, borderLeftColor: "#f59e0b" },
  sendBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center", marginLeft: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: "#1a1a1a", marginBottom: 12, marginTop: 8 },
});
