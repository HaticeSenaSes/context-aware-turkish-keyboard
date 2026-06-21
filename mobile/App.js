import { useState, useEffect, useRef, useCallback } from "react";
import { useColorScheme } from "react-native";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StatusBar, KeyboardAvoidingView, Platform,
  SafeAreaView, Alert, Image, Animated as RNAnimated,
  LayoutAnimation, UIManager, TouchableWithoutFeedback, Keyboard, Dimensions
} from "react-native";
import { NavigationContainer, useFocusEffect } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { Swipeable, GestureHandlerRootView } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { useFonts } from "expo-font";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Fraunces_500Medium, Fraunces_600SemiBold, Fraunces_600SemiBold_Italic } from "@expo-google-fonts/fraunces";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { JetBrainsMono_500Medium, JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";


const API = "https://context-aware-turkish-keyboard.onrender.com";

// ── Design tokens ──────────────────────────────────────────────
// Each context has its own color identity so the UI itself expresses
// the thesis: the recipient/register — not the device — determines
// what you see. Colors are warm/cool-balanced so the 5 contexts read
// as a coherent family, not 5 random hues.
const CONTEXTS = {
  arkadas: { label: "Arkadaş", icon: "people", color: "#E8590C", soft: "#FFF1EA", softDark: "#3A2418" },
  hoca:    { label: "Hoca",    icon: "school", color: "#4C51BF", soft: "#EEF0FD", softDark: "#23264A" },
  is:      { label: "İş",      icon: "briefcase", color: "#0D8A72", soft: "#E6F7F3", softDark: "#0F3530" },
  spor:    { label: "Spor",    icon: "basketball", color: "#2F9E44", soft: "#EDFAEF", softDark: "#173B22" },
  gundelik:{ label: "Gündelik",icon: "sunny", color: "#D9831F", soft: "#FEF6E7", softDark: "#3A2D0F" },
};

const THEME = {
  dark: {
    bg: "#0B0B0F", surface: "#17171D", surfaceElevated: "#1F1F27",
    border: "#2A2A33", text: "#F5F5F7", subtext: "#9C9CA6", placeholder: "#5C5C66",
  },
  light: {
    bg: "#F6F6F8", surface: "#FFFFFF", surfaceElevated: "#FFFFFF",
    border: "#EBEBF0", text: "#17171D", subtext: "#71717A", placeholder: "#B0B0B8",
  },
};

// ── Typography ─────────────────────────────────────────────────
// Three roles, each carrying a different job: Fraunces (an editorial
// serif with real character) for anything that is ChatSense speaking —
// screen titles, the splash wordmark, onboarding. Inter for everything
// the user reads or types — body copy, bubbles, buttons. JetBrains Mono
// reserved for exactly one place: the suggestion chips themselves. A
// monospace, slightly mechanical treatment marks a suggested word as
// *machine output*, distinct from the user's own prose — which is the
// entire thesis argument made visible in thirty milliseconds.
const FONTS = {
  display: "Fraunces_600SemiBold",
  displayItalic: "Fraunces_600SemiBold_Italic",
  displayMedium: "Fraunces_500Medium",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemiBold: "Inter_600SemiBold",
  bodyBold: "Inter_700Bold",
  mono: "JetBrainsMono_500Medium",
  monoBold: "JetBrainsMono_700Bold",
};

function useAppFonts() {
  return useFonts({
    Fraunces_500Medium, Fraunces_600SemiBold, Fraunces_600SemiBold_Italic,
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
    JetBrainsMono_500Medium, JetBrainsMono_700Bold,
  });
}

function getTheme(isDark) { return isDark ? THEME.dark : THEME.light; }
function ctxSoft(ctx, isDark) { return isDark ? ctx.softDark : ctx.soft; }

const DEFAULT_CONTACTS = [
  { id: 1, name: "Hocam", context: "hoca" },
  { id: 2, name: "Arkadaşım", context: "arkadas" },
  { id: 3, name: "Müdürüm", context: "is" },
];

function makePersonalEntry(word, contextIds, contactIds, blocked = false) {
  return { id: Date.now() + Math.random(), word: word.trim().toLowerCase(), contextIds, contactIds, blocked };
}

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const Tab = createBottomTabNavigator();

function ChatScreen({ route, navigation, darkMode, setDarkMode }) {
  const isDark = darkMode;
  const t = getTheme(isDark);
  const initialContext = route?.params?.context || "arkadas";
  const [context, setContext] = useState(initialContext);
  const [personalWords, setPersonalWords] = useState([]);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem("personal_words").then(v => { setPersonalWords(v ? JSON.parse(v) : []); });
    }, [])
  );
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [suggestEmpty, setSuggestEmpty] = useState(false);
  const [suggestRateLimited, setSuggestRateLimited] = useState(false);
  const [messages, setMessages] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function toggleSelect(i) {
    setSelectedIds(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
  }

  function startSelect(i) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectMode(true);
    setSelectedIds([i]);
  }

  function cancelSelect() {
    setSelectMode(false);
    setSelectedIds([]);
    setConfirmingDelete(false);
  }

  function confirmDeleteSelected() {
    setMessages(prev => prev.filter((_, idx) => !selectedIds.includes(idx)));
    cancelSelect();
  }
  const [warning, setWarning] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [serverWaking, setServerWaking] = useState(false);
  const scrollRef = useRef(null);
  const suggestAnim = useRef(new RNAnimated.Value(0)).current;
  const chipScales = useRef([
    new RNAnimated.Value(1), new RNAnimated.Value(1), new RNAnimated.Value(1),
  ]).current;
  const ctx = CONTEXTS[context] || CONTEXTS.arkadas;
  // Mesajlar artık KİŞİ bazında saklanıyor (sadece bağlama göre değil) — aynı
  // bağlamdaki iki farklı kişi artık aynı sohbeti paylaşmıyor. Kişi yoksa
  // (Chat sekmesine doğrudan girildiyse) bağlam bazlı genel bir anahtar kullanılır.
  const contactId = route?.params?.contact?.id;
  const storageKey = "messages_" + (contactId ? "c" + contactId : "ctx_" + context);
  const loadedKeyRef = useRef(null);

  useEffect(() => {
    fetch(API + "/").catch(() => {});
    const interval = setInterval(() => {
      fetch(API + "/").catch(() => {});
    }, 4 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Mesajları yükle
  useEffect(() => {
    let cancelled = false;
    loadedKeyRef.current = null; // bu anahtar icin yukleme bitene kadar kaydetme yapma
    AsyncStorage.getItem(storageKey).then(val => {
      if (cancelled) return;
      setMessages(val ? JSON.parse(val) : []);
      loadedKeyRef.current = storageKey;
    }).catch(() => { if (!cancelled) { setMessages([]); loadedKeyRef.current = storageKey; } });
    return () => { cancelled = true; };
  }, [storageKey]);

  // Mesajları kaydet — artık liste tamamen boşalsa bile (Tümünü Sil sonrası) kaydediliyor.
  // loadedKeyRef kontrolü, henuz yukleme bitmeden gelen gecici bos state'in
  // gercek veriyi ezmesini onluyor.
  useEffect(() => {
    if (loadedKeyRef.current !== storageKey) return;
    AsyncStorage.setItem(storageKey, JSON.stringify(messages.slice(-50)));
  }, [messages]);

  useEffect(() => {
    if (route?.params?.context) setContext(route.params.context);
  }, [route?.params]);

  useEffect(() => {
    if (!text.trim()) { setSuggestions([]); setSuggestEmpty(false); setSuggestRateLimited(false); return; }
    setSuggestEmpty(false); setSuggestRateLimited(false);
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

  function filterActivePersonalWords(list) {
    const contactId = route?.params?.contact?.id;
    return list.filter(w => {
      const inContext = Array.isArray(w.contextIds) && w.contextIds.includes(context);
      const inContact = contactId && Array.isArray(w.contactIds) && w.contactIds.includes(contactId);
      return inContext || inContact;
    });
  }

  function getActivePersonalWords() {
    // Bu konuşmaya uygulanabilecek kelimeler: bu KİŞİYE özel olanlar + bu BAĞLAMA özel olanlar
    return filterActivePersonalWords(personalWords);
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
      const taughtWords = activeWords.filter(w => !w.blocked).map(w => w.word);
      const res = await fetchWithRetry(API + "/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context, n_suggestions: 5, history: messages.slice(-5).map(m => m.text), personal_words: taughtWords }),
      });
      clearTimeout(timer);
      setServerWaking(false);
      if (res.status === 429) {
        setSuggestions([]); setSuggestEmpty(false); setSuggestRateLimited(true);
        return;
      }
      const data = await res.json();
      let newSuggestions = data.suggestions || [];
      // Engellenen kelimeleri sunucu önerilerinden çıkar, sonra ilk 3'e kırp
      newSuggestions = newSuggestions.filter(sg => !blockedWords.has(sg.toLowerCase())).slice(0, 3);
      setSuggestions(newSuggestions);
      setSuggestEmpty(newSuggestions.length === 0);
      setSuggestRateLimited(false);
      if (newSuggestions.length > 0) {
        suggestAnim.setValue(0);
        RNAnimated.spring(suggestAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }).start();
      }
    } catch(e) { console.error("FETCH ERROR:", e); setSuggestions([]); setSuggestEmpty(true); }
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
      if (res.status === 429) {
        setWarning({ message: "Çok hızlı istek gönderildi", suggestion: "Birkaç saniye bekleyip tekrar dene." });
        setCompleting(false);
        return;
      }
      const data = await res.json();
      if (data.suggestion) {
        setText(data.suggestion);
      } else {
        setWarning({ message: "Cümle tamamlanamadı", suggestion: "Uygun bir devam bulunamadı, tekrar dene." });
      }
    } catch {
      setWarning({ message: "Cümle tamamlanamadı", suggestion: "Sunucuya bağlanılamadı, bağlantını kontrol edip tekrar dene." });
    }
    setCompleting(false);
  }

  function acceptSuggestion(word, index) {
    if (typeof index === "number" && chipScales[index]) {
      RNAnimated.sequence([
        RNAnimated.timing(chipScales[index], { toValue: 0.92, duration: 70, useNativeDriver: true }),
        RNAnimated.spring(chipScales[index], { toValue: 1, useNativeDriver: true, tension: 300, friction: 10 }),
      ]).start();
    }
    const parts = text.split(" ");
    parts[parts.length - 1] = word;
    setText(parts.join(" ") + " ");
  }

  async function sendMessage() {
    if (!text.trim()) return;
    // Engelli kelime kontrolünü component state'ine güvenmeden, AsyncStorage'dan
    // taze okuyarak yapıyoruz — odak/zamanlama kaynaklı eski veri riskini sıfırlar.
    let freshWords = [];
    try {
      const raw = await AsyncStorage.getItem("personal_words");
      freshWords = raw ? JSON.parse(raw) : [];
    } catch {}
    const blocked = filterActivePersonalWords(freshWords).filter(w => w.blocked).map(w => w.word.toLowerCase());
    if (blocked.length) {
      const tokens = text.toLowerCase().split(/[^a-zçğıöşü0-9]+/i).filter(Boolean);
      const hit = blocked.find(w => tokens.includes(w));
      if (hit) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setWarning({ message: "Mesaj gönderilemedi: \"" + hit + "\" engelli", suggestion: "Bu kelimeyi bu bağlamda engellemiştin. Mesajı düzenleyip tekrar dene." });
        return;
      }
    }
    setMessages(prev => [...prev, {
      text: text.trim(), context,
      time: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    }]);
    setText(""); setSuggestions([]); setWarning(null);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={t.surface} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: t.surface, borderBottomWidth: 1, borderColor: t.border }}>
        {selectMode ? (
          <>
            <TouchableOpacity onPress={cancelSelect} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="close" size={20} color={t.text} />
              <Text style={{ fontSize: 15, fontFamily: FONTS.bodySemiBold, color: t.text }}>{selectedIds.length} seçili</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
              <TouchableOpacity onPress={() => setSelectedIds(messages.map((_, i) => i))}>
                <Text style={{ fontSize: 13, fontFamily: FONTS.bodySemiBold, color: t.subtext }}>Tümünü seç</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setConfirmingDelete(true)} disabled={selectedIds.length === 0} style={{ opacity: selectedIds.length === 0 ? 0.4 : 1 }}>
                <Ionicons name="trash" size={20} color="#DC2626" />
              </TouchableOpacity>
            </View>
          </>
        ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          {route?.params?.contact && (
            <TouchableOpacity onPress={() => navigation.navigate("Kişiler")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={24} color={t.text} />
            </TouchableOpacity>
          )}
          <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: ctxSoft(ctx, isDark), justifyContent: "center", alignItems: "center" }}>
            <Ionicons name={ctx.icon} size={18} color={ctx.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontFamily: FONTS.display, color: t.text }}>{route?.params?.contact?.name || "ChatSense"}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ctx.color }} />
              <Text style={{ fontSize: 12, fontFamily: FONTS.body, color: t.subtext }}>{ctx.label} bağlamı</Text>
            </View>
          </View>
          {messages.length > 0 && (
            <TouchableOpacity onPress={() => { setSelectMode(true); setSelectedIds([]); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="checkmark-circle-outline" size={22} color={t.subtext} />
            </TouchableOpacity>
          )}
        </View>
        )}
      </View>
      {confirmingDelete && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, backgroundColor: isDark ? "#3A1418" : "#FEEAEA" }}>
          <Text style={{ fontSize: 13, fontFamily: FONTS.body, color: isDark ? "#FCA5A5" : "#991B1B", flex: 1 }}>
            {selectedIds.length === 1 ? "Bu mesaj silinsin mi?" : `${selectedIds.length} mesaj silinsin mi?`}
          </Text>
          <TouchableOpacity onPress={() => setConfirmingDelete(false)} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ fontSize: 13, fontFamily: FONTS.bodySemiBold, color: t.subtext }}>Vazgeç</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmDeleteSelected} style={{ backgroundColor: "#DC2626", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ fontSize: 13, fontFamily: FONTS.bodySemiBold, color: "white" }}>Sil</Text>
          </TouchableOpacity>
        </View>
      )}
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, flexGrow: 1 }} keyboardShouldPersistTaps="handled" onScrollBeginDrag={Keyboard.dismiss}>
        {messages.length === 0 && (
          <View style={{ alignItems: "center", marginTop: 70 }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: ctxSoft(ctx, isDark), justifyContent: "center", alignItems: "center", marginBottom: 14 }}>
              <Ionicons name={ctx.icon} size={28} color={ctx.color} />
            </View>
            <Text style={{ fontSize: 14, fontFamily: FONTS.body, color: t.subtext, textAlign: "center", maxWidth: 240, lineHeight: 20 }}>Yazmaya başla, sistem {ctx.label.toLowerCase()} bağlamına göre öneri sunsun</Text>
          </View>
        )}
        {messages.map((m, i) => (
          <TouchableOpacity key={i}
            onPress={() => { if (selectMode) toggleSelect(i); }}
            onLongPress={() => { if (!selectMode) startSelect(i); }}
            style={{ flexDirection: "row", alignSelf: "flex-end", alignItems: "center", maxWidth: "88%", marginBottom: 10 }}>
            {selectMode && (
              <View style={{ width: 20, height: 20, borderRadius: 10, marginRight: 8, borderWidth: 1.5, borderColor: selectedIds.includes(i) ? ctx.color : t.border, backgroundColor: selectedIds.includes(i) ? ctx.color : "transparent", justifyContent: "center", alignItems: "center" }}>
                {selectedIds.includes(i) && <Ionicons name="checkmark" size={13} color="#fff" />}
              </View>
            )}
            <View style={{ backgroundColor: t.surfaceElevated, borderWidth: 1, borderColor: t.border, borderRightWidth: 3, borderRightColor: ctx.color, borderRadius: 14, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10, flexShrink: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: FONTS.body, color: t.text, lineHeight: 20 }}>{m.text}</Text>
              <Text style={{ fontSize: 10, fontFamily: FONTS.body, color: t.subtext, marginTop: 4, textAlign: "right" }}>{m.time}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {serverWaking && (
        <View style={{ backgroundColor: ctxSoft(ctx, isDark), marginHorizontal: 12, marginBottom: 6, padding: 10, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Ionicons name="time-outline" size={14} color={ctx.color} />
          <Text style={{ fontSize: 12, fontFamily: FONTS.bodySemiBold, color: ctx.color }}>Sunucu uyanıyor, biraz bekle...</Text>
        </View>
      )}
      {warning && (
        <View style={{ backgroundColor: isDark ? "#3A2D0F" : "#FFF8E1", marginHorizontal: 12, marginBottom: 6, padding: 12, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: "#D9831F" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="alert-circle" size={15} color="#D9831F" />
            <Text style={{ color: isDark ? "#FBBF6A" : "#92400e", fontSize: 13, fontFamily: FONTS.bodySemiBold, flex: 1 }}>{warning.message}</Text>
          </View>
          {warning.suggestion && <Text style={{ color: t.subtext, fontSize: 12, fontFamily: FONTS.body, marginTop: 4, marginLeft: 21 }}>{warning.suggestion}</Text>}
        </View>
      )}
      {text.length > 3 && (
        <TouchableOpacity onPress={completeSentence}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginHorizontal: 12, marginBottom: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: ctxSoft(ctx, isDark) }}>
          <Ionicons name="sparkles" size={14} color={ctx.color} />
          <Text style={{ fontSize: 13, fontFamily: FONTS.bodySemiBold, color: ctx.color }}>{completing ? "Tamamlanıyor..." : "Cümleyi Tamamla"}</Text>
        </TouchableOpacity>
      )}
      {suggestRateLimited && (
        <View style={{ marginHorizontal: 12, marginBottom: 8, paddingVertical: 8, alignItems: "center" }}>
          <Text style={{ fontSize: 12, fontFamily: FONTS.body, color: t.placeholder }}>Çok hızlı istek gönderildi, birkaç saniye bekle</Text>
        </View>
      )}
      {suggestEmpty && suggestions.length === 0 && (
        <View style={{ marginHorizontal: 12, marginBottom: 8, paddingVertical: 8, alignItems: "center" }}>
          <Text style={{ fontSize: 12, fontFamily: FONTS.body, color: t.placeholder }}>Öneri bulunamadı</Text>
        </View>
      )}
      {suggestions.length > 0 && (
        <RNAnimated.View style={{ marginHorizontal: 12, marginBottom: 8,
          opacity: suggestAnim,
          transform: [{ translateY: suggestAnim.interpolate({ inputRange: [0,1], outputRange: [8,0] }) }] }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {suggestions.map((sg, i) => (
              <RNAnimated.View key={i} style={{ flex: 1, transform: [{ scale: chipScales[i] }] }}>
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); acceptSuggestion(sg, i); }}
                  style={{ paddingVertical: 11, paddingHorizontal: 10, alignItems: "center", borderRadius: 10, backgroundColor: t.surfaceElevated, borderWidth: 1, borderColor: t.border }}>
                  <Text style={{ fontSize: 14, fontFamily: FONTS.monoBold, color: t.text }} numberOfLines={1}>{sg}</Text>
                  <View style={{ width: 18, height: 2, borderRadius: 1, backgroundColor: ctx.color, marginTop: 6 }} />
                </TouchableOpacity>
              </RNAnimated.View>
            ))}
          </View>
        </RNAnimated.View>
      )}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flexDirection: "row", padding: 10, backgroundColor: t.surface, alignItems: "flex-end", borderTopWidth: 1, borderColor: t.border }}>
          <TextInput value={text} onChangeText={setText}
            placeholder={ctx.label + " bağlamında yaz..."}
            placeholderTextColor={t.placeholder}
            style={{ flex: 1, backgroundColor: isDark ? "#1F1F27" : "#F1F1F4", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, fontFamily: FONTS.body, maxHeight: 100, color: t.text }}
            multiline />
          <TouchableOpacity onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); sendMessage(); }}
            style={{ width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center", marginLeft: 8, backgroundColor: ctx.color }}>
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ContactsScreen({ navigation, darkMode }) {
  const isDark = darkMode;
  const t = getTheme(isDark);
  const [contacts, setContacts] = useState(DEFAULT_CONTACTS);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newName, setNewName] = useState("");
  const [newCtx, setNewCtx] = useState("arkadas");
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  useEffect(() => {
    AsyncStorage.setItem("contacts_list", JSON.stringify(contacts));
  }, [contacts]);

  function openAdd() {
    setEditingId(null); setNewName(""); setNewCtx("arkadas"); setShowAdd(true);
  }

  function openEdit(contact) {
    setEditingId(contact.id); setNewName(contact.name); setNewCtx(contact.context); setShowAdd(true);
  }

  function saveContact() {
    if (!newName.trim()) return;
    if (editingId) {
      setContacts(prev => prev.map(c => c.id === editingId ? { ...c, name: newName.trim(), context: newCtx } : c));
    } else {
      setContacts(prev => [...prev, { id: Date.now(), name: newName.trim(), context: newCtx }]);
    }
    setNewName(""); setEditingId(null); setShowAdd(false);
  }

  async function confirmDeleteContact() {
    const id = confirmDeleteId;
    setContacts(prev => prev.filter(c => c.id !== id));
    // Bu kişiye bağlı kişisel kelimelerden de temizle — kişi silinince geride
    // "Kişi" diye anlamsız bir etiketle asılı kalan kayıt bırakmamak için.
    try {
      const raw = await AsyncStorage.getItem("personal_words");
      const words = raw ? JSON.parse(raw) : [];
      const cleaned = words
        .map(w => ({ ...w, contactIds: (w.contactIds || []).filter(cid => cid !== id) }))
        .filter(w => (w.contextIds || []).length > 0 || (w.contactIds || []).length > 0);
      await AsyncStorage.setItem("personal_words", JSON.stringify(cleaned));
    } catch {}
    setConfirmDeleteId(null);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, backgroundColor: t.surface, borderBottomWidth: 1, borderColor: t.border }}>
        <Text style={{ fontSize: 22, fontFamily: FONTS.display, color: t.text }}>Kişiler</Text>
        <TouchableOpacity onPress={openAdd} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: t.text, justifyContent: "center", alignItems: "center" }}>
          <Ionicons name="add" size={22} color={t.bg} />
        </TouchableOpacity>
      </View>
      {confirmDeleteId !== null && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, backgroundColor: isDark ? "#3A1418" : "#FEEAEA" }}>
          <Text style={{ fontSize: 13, fontFamily: FONTS.body, color: isDark ? "#FCA5A5" : "#991B1B", flex: 1 }}>Bu kişi silinsin mi?</Text>
          <TouchableOpacity onPress={() => setConfirmDeleteId(null)} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ fontSize: 13, fontFamily: FONTS.bodySemiBold, color: t.subtext }}>Vazgeç</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmDeleteContact} style={{ backgroundColor: "#DC2626", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ fontSize: 13, fontFamily: FONTS.bodySemiBold, color: "white" }}>Sil</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, backgroundColor: t.bg }}>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: t.surface, borderRadius: 12, borderWidth: 1, borderColor: t.border, paddingHorizontal: 12 }}>
          <Ionicons name="search" size={16} color={t.subtext} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Kişi ara..."
            placeholderTextColor={t.placeholder}
            style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 8, fontSize: 14, fontFamily: FONTS.body, color: t.text }}
          />
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {showAdd && (
          <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <Text style={{ fontSize: 16, fontFamily: FONTS.displayMedium, color: t.text, marginBottom: 12 }}>{editingId ? "Kişiyi Düzenle" : "Yeni Kişi Ekle"}</Text>
            <TextInput value={newName} onChangeText={setNewName} placeholder="İsim (örn. Hocam, Annem)"
              placeholderTextColor={t.placeholder}
              style={{ backgroundColor: isDark ? "#1F1F27" : "#F1F1F4", borderRadius: 10, padding: 12, fontSize: 15, fontFamily: FONTS.body, marginBottom: 12, color: t.text }} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              {Object.entries(CONTEXTS).map(([key, val]) => (
                <TouchableOpacity key={key} onPress={() => setNewCtx(key)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, marginRight: 8, backgroundColor: newCtx === key ? val.color : (isDark ? "#1F1F27" : "#F1F1F4") }}>
                  <Ionicons name={val.icon} size={13} color={newCtx === key ? "#fff" : val.color} />
                  <Text style={{ fontSize: 12, fontFamily: FONTS.bodyBold, color: newCtx === key ? "#fff" : t.subtext }}>{val.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity onPress={saveContact} style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: t.text, alignItems: "center" }}>
                <Text style={{ color: t.bg, fontFamily: FONTS.bodyBold }}>Kaydet</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowAdd(false); setEditingId(null); }} style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: "transparent", alignItems: "center", borderWidth: 1, borderColor: t.border }}>
                <Text style={{ color: t.subtext, fontFamily: FONTS.bodySemiBold }}>İptal</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {filteredContacts.map(contact => {
          const cv = CONTEXTS[contact.context] || CONTEXTS.arkadas;
          const renderRightActions = () => (
            <TouchableOpacity
              onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); setConfirmDeleteId(contact.id); }}
              style={{ backgroundColor: "#DC2626", justifyContent: "center", alignItems: "center", width: 80, borderRadius: 16, marginBottom: 10, marginLeft: -12 }}>
              <Ionicons name="trash" size={18} color="#fff" />
              <Text style={{ color: "white", fontSize: 11, marginTop: 3, fontFamily: FONTS.bodySemiBold }}>Sil</Text>
            </TouchableOpacity>
          );
          return (
            <Swipeable key={contact.id} renderRightActions={renderRightActions}>
              <TouchableOpacity
                onPress={() => navigation.navigate("Chat", { context: contact.context, contact: contact })}
                style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: ctxSoft(cv, isDark), justifyContent: "center", alignItems: "center", marginRight: 12 }}>
                  <Text style={{ fontSize: 17, color: cv.color, fontFamily: FONTS.displayMedium }}>{contact.name[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontFamily: FONTS.bodySemiBold, color: t.text }}>{contact.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                    <Ionicons name={cv.icon} size={11} color={cv.color} />
                    <Text style={{ fontSize: 12, fontFamily: FONTS.body, color: t.subtext }}>{cv.label} bağlamı</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => openEdit(contact)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginRight: 10 }}>
                  <Ionicons name="pencil" size={16} color={t.subtext} />
                </TouchableOpacity>
                <Ionicons name="chevron-forward" size={18} color={t.placeholder} />
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
  const t = getTheme(isDark);
  const accent = "#4C51BF";
  const findings = [
    { icon: "phone-portrait", title: "Telefon Markası Belirleyici", desc: "Cinsiyet, yaş, bölüm etkisiz. Sadece marka farklılaştırıyor." },
    { icon: "logo-apple", title: "iPhone En Homojen", desc: "5/6 cümlede en düşük entropi. iOS en standart önerileri veriyor." },
    { icon: "heart", title: "\"Seni çok\" → %87 \"seviyorum\"", desc: "Duygusal dil en standartlaşmış register." },
    { icon: "sparkles", title: "Nadir Kelime Testi", desc: "\"Mükedder\" için en yüksek chi² = 274.69" },
  ];
  const chiData = [
    ["Bugün hava", "72.00"], ["Bu hafta sonu", "119.27"], ["Seni çok", "34.16"],
    ["Sinav icin", "121.48"], ["Mükedder", "274.69"], ["Bence en iyisi", "108.38"],
  ];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={t.surface} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: t.surface, borderBottomWidth: 1, borderColor: t.border }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: accent, justifyContent: "center", alignItems: "center", marginRight: 10 }}>
          <Ionicons name="stats-chart" size={19} color="#fff" />
        </View>
        <View>
          <Text style={{ fontSize: 17, fontFamily: FONTS.display, color: t.text }}>Araştırma</Text>
          <Text style={{ fontSize: 12, fontFamily: FONTS.mono, color: t.subtext, marginTop: 1 }}>94 katılımcı · 6 test cümlesi</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ fontSize: 17, fontFamily: FONTS.displayMedium, color: t.text, marginBottom: 12, marginTop: 4 }}>Temel Bulgular</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 22 }}>
          {findings.map((f, i) => (
            <View key={i} style={{ width: "47%", backgroundColor: t.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: t.border }}>
              <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: accent + "1A", justifyContent: "center", alignItems: "center", marginBottom: 10 }}>
                <Ionicons name={f.icon} size={16} color={accent} />
              </View>
              <Text style={{ fontSize: 13, fontFamily: FONTS.bodyBold, color: t.text, marginBottom: 4 }} numberOfLines={2}>{f.title}</Text>
              <Text style={{ fontSize: 11, fontFamily: FONTS.body, color: t.subtext, lineHeight: 16 }} numberOfLines={4}>{f.desc}</Text>
            </View>
          ))}
        </View>
        <Text style={{ fontSize: 17, fontFamily: FONTS.displayMedium, color: t.text, marginBottom: 12 }}>Chi-Square Sonuçları</Text>
        <View style={{ backgroundColor: t.surface, borderRadius: 14, overflow: "hidden", marginBottom: 18, borderWidth: 1, borderColor: t.border }}>
          <View style={{ flexDirection: "row", backgroundColor: accent, padding: 11 }}>
            {["Test Cümlesi", "Chi²", "p"].map(h => (
              <Text key={h} style={{ flex: h === "Test Cümlesi" ? 2 : 1, color: "white", fontFamily: FONTS.bodyBold, fontSize: 12 }}>{h}</Text>
            ))}
          </View>
          {chiData.map(([sentence, chi], i) => (
            <View key={i} style={{ flexDirection: "row", padding: 11, alignItems: "center", borderBottomWidth: i < chiData.length - 1 ? 1 : 0, borderColor: t.border, backgroundColor: sentence === "Mükedder" ? (isDark ? "#23264A" : "#EEF0FD") : "transparent" }}>
              <Text style={{ flex: 2, fontSize: 13, fontFamily: FONTS.body, color: t.text }}>{sentence === "Mükedder" ? <Text style={{ color: accent, fontFamily: FONTS.bodyBold }}>"{sentence}" ★</Text> : `"${sentence}"`}</Text>
              <Text style={{ flex: 1, fontSize: 13, fontFamily: FONTS.monoBold, color: accent }}>{chi}</Text>
              <Text style={{ flex: 1, fontSize: 13, fontFamily: FONTS.mono, color: t.subtext }}>{"<.001"}</Text>
            </View>
          ))}
        </View>
        <View style={{ backgroundColor: isDark ? "#23264A" : "#EEF0FD", borderRadius: 14, padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 }}>
            <Ionicons name="bulb" size={18} color={accent} />
            <Text style={{ fontSize: 15, fontFamily: FONTS.displayMedium, color: accent }}>Sonuç</Text>
          </View>
          <Text style={{ fontSize: 13, fontFamily: FONTS.body, color: t.text, lineHeight: 20 }}>
            WhatsApp sistemi bireyi değil, işletim sistemini tanıyor. ChatSense bu problemi çözüyor.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CompareScreen({ darkMode }) {
  const isDark = darkMode;
  const t = getTheme(isDark);
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
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 14, backgroundColor: t.surface, borderBottomWidth: 1, borderColor: t.border }}>
        <Text style={{ fontSize: 22, fontFamily: FONTS.display, color: t.text }}>Karşılaştır</Text>
        <Text style={{ fontSize: 12, fontFamily: FONTS.mono, color: t.subtext, marginTop: 2 }}>WhatsApp vs ChatSense</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ backgroundColor: t.surfaceElevated, borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 14, marginBottom: 16, flexDirection: "row", gap: 10 }}>
          <Ionicons name="information-circle" size={18} color={t.subtext} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 13, fontFamily: FONTS.body, color: t.subtext, lineHeight: 19 }}>
            WhatsApp cihaz bazlı standart öneri sunarken, ChatSense alıcıya göre farklılaştırır. Aşağıda anket verisi (94 katılımcı) ile karşılaştırma var.
          </Text>
        </View>

        {/* Kendi cümleni dene */}
        <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 16, marginBottom: 18 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <Ionicons name="flask" size={16} color={t.text} />
            <Text style={{ fontSize: 16, fontFamily: FONTS.displayMedium, color: t.text }}>Kendi Cümleni Dene</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              value={customText}
              onChangeText={setCustomText}
              placeholder="Bir cümle yaz..."
              placeholderTextColor={t.placeholder}
              style={{ flex: 1, backgroundColor: isDark ? "#1F1F27" : "#F1F1F4", borderRadius: 10, padding: 12, fontSize: 14, fontFamily: FONTS.body, color: t.text }}
              onSubmitEditing={runCustomCompare}
            />
            <TouchableOpacity onPress={runCustomCompare} style={{ backgroundColor: t.text, borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" }}>
              <Text style={{ color: t.bg, fontFamily: FONTS.bodyBold }}>{loadingCustom ? "..." : "Karşılaştır"}</Text>
            </TouchableOpacity>
          </View>
          {customResults && !customResults.error && (
            <View style={{ marginTop: 14, gap: 8 }}>
              {Object.entries(customResults).map(([ckey, words]) => {
                const cv = CONTEXTS[ckey];
                return (
                  <View key={ckey} style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, width: 84 }}>
                      <Ionicons name={cv?.icon || "ellipse"} size={11} color={cv?.color || t.subtext} />
                      <Text style={{ fontSize: 12, fontFamily: FONTS.bodyBold, color: cv?.color || t.subtext }}>{cv?.label || ckey}</Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap", flex: 1 }}>
                      {(words.length ? words : ["-"]).map((w, wi) => (
                        <View key={wi} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: cv?.color || t.subtext }}>
                          <Text style={{ color: "white", fontSize: 11, fontFamily: FONTS.monoBold }}>{w}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
          {customResults?.error && (
            <Text style={{ fontSize: 12, fontFamily: FONTS.body, color: "#DC2626", marginTop: 10 }}>Sunucu uyanıyor olabilir, birkaç saniye sonra tekrar dene.</Text>
          )}
        </View>

        <Text style={{ fontSize: 11, fontFamily: FONTS.mono, color: t.subtext, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1.2 }}>Anket Cümleleri (94 katılımcı)</Text>

        {data.map((item, idx) => (
          <View key={idx} style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, marginBottom: 10, overflow: "hidden" }}>
            <TouchableOpacity
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setExpanded(expanded === idx ? null : idx);
              }}
              style={{ padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: 15, fontFamily: FONTS.displayMedium, color: t.text }}>"{item.sentence}"</Text>
              <Ionicons name={expanded === idx ? "chevron-up" : "chevron-down"} size={16} color={t.subtext} />
            </TouchableOpacity>
            {expanded === idx && (
              <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                <Text style={{ fontSize: 10, fontFamily: FONTS.mono, color: t.placeholder, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>WhatsApp · anket verisi</Text>
                {Object.entries(item.whatsapp).map(([brand, [word, pct]]) => (
                  <View key={brand} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, fontFamily: FONTS.bodySemiBold, color: t.subtext, width: 80 }}>{brand}</Text>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: isDark ? "#3A3A45" : "#D4D4DC" }}>
                      <Text style={{ color: isDark ? "#fff" : "#3A3A45", fontSize: 11, fontFamily: FONTS.monoBold }}>{word} {pct !== "-" ? `(${pct})` : ""}</Text>
                    </View>
                  </View>
                ))}
                <Text style={{ fontSize: 10, fontFamily: FONTS.mono, color: t.text, textTransform: "uppercase", letterSpacing: 1.5, marginTop: 12, marginBottom: 8 }}>ChatSense</Text>
                {[["arkadas",item.arkadas],["hoca",item.hoca],["is",item.is]].map(([ckey, words]) => {
                  const cv = CONTEXTS[ckey];
                  return (
                    <View key={ckey} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, width: 80 }}>
                        <Ionicons name={cv.icon} size={11} color={cv.color} />
                        <Text style={{ fontSize: 12, fontFamily: FONTS.bodySemiBold, color: cv.color }}>{cv.label}</Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap" }}>
                        {words.map((w, wi) => (
                          <View key={wi} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: cv.color }}>
                            <Text style={{ color: "white", fontSize: 11, fontFamily: FONTS.monoBold }}>{w}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })}
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
  const t = getTheme(isDark);
  const accent = "#4C51BF";
  const [userName, setUserName] = useState("");
  const [editName, setEditName] = useState(false);
  const [tempName, setTempName] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [personalWords, setPersonalWords] = useState([]);
  const [newWord, setNewWord] = useState("");
  const [newWordContextIds, setNewWordContextIds] = useState([]);
  const [newWordContactIds, setNewWordContactIds] = useState([]);
  const [contactSearch, setContactSearch] = useState("");
  const [newWordBlocked, setNewWordBlocked] = useState(false);
  const [contactsList, setContactsList] = useState(DEFAULT_CONTACTS);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem("personal_words").then(v => { setPersonalWords(v ? JSON.parse(v) : []); });
      AsyncStorage.getItem("contacts_list").then(v => { setContactsList(v ? JSON.parse(v) : DEFAULT_CONTACTS); });
    }, [])
  );

  function toggleContextId(key) {
    const turningOn = !newWordContextIds.includes(key);
    setNewWordContextIds(prev => turningOn ? [...prev, key] : prev.filter(x => x !== key));
    // Bu bağlama ait kişileri de otomatik işaretle/kaldır — tek tek kişi seçimi
    // ise diğer kişileri ETKİLEMEZ, bu sadece bağlam -> kişi yönünde çalışır.
    const relatedContactIds = contactsList.filter(c => c.context === key).map(c => c.id);
    setNewWordContactIds(prev =>
      turningOn
        ? Array.from(new Set([...prev, ...relatedContactIds]))
        : prev.filter(id => !relatedContactIds.includes(id))
    );
  }
  function toggleContactId(id) {
    setNewWordContactIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function addWord() {
    if (!newWord.trim()) return;
    if (newWordContextIds.length === 0 && newWordContactIds.length === 0) {
      Alert.alert("Hedef seç", "En az bir bağlam ya da kişi seçmelisin.");
      return;
    }
    const entry = makePersonalEntry(newWord, newWordContextIds, newWordContactIds, newWordBlocked);
    const updated = [...personalWords, entry];
    setPersonalWords(updated);
    AsyncStorage.setItem("personal_words", JSON.stringify(updated));
    setNewWord(""); setNewWordContextIds([]); setNewWordContactIds([]); setNewWordBlocked(false);
  }
  
  function removeWord(id) {
    const updated = personalWords.filter(w => w.id !== id);
    setPersonalWords(updated);
    AsyncStorage.setItem("personal_words", JSON.stringify(updated));
  }

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
    { icon: "moon", label: "Karanlık Mod", type: "toggle", value: isDark, onToggle: () => setDarkMode(!isDark) },
    { icon: "information-circle", label: "Hakkında", type: "action", value: "v1.0", onPress: () => Alert.alert("ChatSense v1.0", "Bağlam duyarlı Türkçe kelime öneri sistemi.\n\nGeliştirici: Hatice Sena SES\nYeditepe Üniversitesi, 2026", [{text: "Tamam"}]) },
    { icon: "school", label: "Araştırma", type: "info", value: "94 katılımcı • Yeditepe Üniversitesi" },
    { icon: "code-slash", label: "Teknoloji", type: "info", value: "FastAPI + Groq AI + N-gram" },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={t.surface} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: t.surface, borderBottomWidth: 1, borderColor: t.border }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: accent, justifyContent: "center", alignItems: "center", marginRight: 10 }}>
          <Ionicons name="settings" size={18} color="#fff" />
        </View>
        <Text style={{ fontSize: 17, fontFamily: FONTS.display, color: t.text }}>Ayarlar</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>

        {/* Profil kartı */}
        <View style={{ backgroundColor: t.surface, borderRadius: 16, padding: 20, marginBottom: 16, alignItems: "center", borderWidth: 1, borderColor: t.border }}>
          <TouchableOpacity onPress={pickAvatar} style={{ position: "relative", marginBottom: 12 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: accent, justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
              {avatar
                ? <Image source={{ uri: avatar }} style={{ width: 72, height: 72 }} />
                : <Text style={{ fontSize: 28, fontWeight: "bold", color: "white" }}>{userName ? userName[0].toUpperCase() : "?"}</Text>
              }
            </View>
            <View style={{ position: "absolute", bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: t.text, justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: t.surface }}>
              <Ionicons name="camera" size={12} color={t.surface} />
            </View>
          </TouchableOpacity>
          {editName ? (
            <View style={{ width: "100%", flexDirection: "row", gap: 8 }}>
              <TextInput
                value={tempName}
                onChangeText={setTempName}
                placeholder="İsminizi girin"
                placeholderTextColor={t.placeholder}
                style={{ flex: 1, backgroundColor: isDark ? t.bg : "#F4F4F7", borderRadius: 10, padding: 10, fontSize: 15, color: t.text }}
                autoFocus
              />
              <TouchableOpacity onPress={saveName} style={{ backgroundColor: accent, borderRadius: 10, padding: 10, justifyContent: "center" }}>
                <Ionicons name="checkmark" size={20} color="white" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => { setTempName(userName); setEditName(true); }} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 19, fontFamily: FONTS.display, color: t.text }}>
                {userName || "İsim ekle"}
              </Text>
              <Ionicons name="pencil" size={13} color={t.subtext} />
            </TouchableOpacity>
          )}
          <Text style={{ fontSize: 12, color: t.subtext, marginTop: 4 }}>ChatSense Kullanıcısı</Text>
        </View>

        {/* Kişisel Kelimeler */}
        <View style={{ backgroundColor: t.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: t.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Ionicons name="bulb" size={16} color={accent} />
            <Text style={{ fontSize: 16, fontFamily: FONTS.displayMedium, color: t.text }}>Kişisel Kelimeler</Text>
          </View>
          <Text style={{ fontSize: 12, color: t.subtext, marginBottom: 12, lineHeight: 16 }}>Bir kelimeyi belirli bir KİŞİYE veya tüm BAĞLAMA özel öğret, ya da o kapsamda tamamen ENGELLE.</Text>

          <TextInput
            value={newWord}
            onChangeText={setNewWord}
            placeholder="Kelime veya ifade yaz..."
            placeholderTextColor={t.placeholder}
            style={{ backgroundColor: isDark ? t.bg : "#F4F4F7", borderRadius: 10, padding: 10, fontSize: 14, color: t.text, marginBottom: 14 }}
          />

          {/* Bağlamlar — birden fazla seçilebilir */}
          <Text style={{ fontSize: 12, fontFamily: FONTS.bodySemiBold, color: t.subtext, marginBottom: 8 }}>Bağlamlar</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {Object.entries(CONTEXTS).map(([key, val]) => {
              const checked = newWordContextIds.includes(key);
              return (
                <TouchableOpacity key={key} onPress={() => toggleContextId(key)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: checked ? t.text : (isDark ? t.bg : "#F0F0F4") }}>
                  <View style={{ width: 15, height: 15, borderRadius: 4, borderWidth: 1.5, borderColor: checked ? t.bg : t.border, backgroundColor: checked ? t.bg : "transparent", justifyContent: "center", alignItems: "center" }}>
                    {checked && <Ionicons name="checkmark" size={10} color={t.text} />}
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: checked ? t.bg : t.subtext }}>{val.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Kişiler — aranabilir, dikey liste, birden fazla seçilebilir */}
          <Text style={{ fontSize: 12, fontFamily: FONTS.bodySemiBold, color: t.subtext, marginBottom: 8 }}>Kişiler</Text>
          {contactsList.length > 4 && (
            <TextInput
              value={contactSearch}
              onChangeText={setContactSearch}
              placeholder="Kişi ara..."
              placeholderTextColor={t.placeholder}
              style={{ backgroundColor: isDark ? t.bg : "#F4F4F7", borderRadius: 8, padding: 8, fontSize: 13, color: t.text, marginBottom: 8 }}
            />
          )}
          <ScrollView style={{ maxHeight: 160, marginBottom: 16 }} nestedScrollEnabled>
            {contactsList
              .filter(c => c.name.toLowerCase().includes(contactSearch.trim().toLowerCase()))
              .map(c => {
                const checked = newWordContactIds.includes(c.id);
                return (
                  <TouchableOpacity key={c.id} onPress={() => toggleContactId(c.id)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 }}>
                    <View style={{ width: 17, height: 17, borderRadius: 5, borderWidth: 1.5, borderColor: checked ? t.text : t.border, backgroundColor: checked ? t.text : "transparent", justifyContent: "center", alignItems: "center" }}>
                      {checked && <Ionicons name="checkmark" size={12} color={t.bg} />}
                    </View>
                    <Text style={{ fontSize: 13, color: t.text }}>{c.name}</Text>
                  </TouchableOpacity>
                );
              })}
            {contactsList.length === 0 && (
              <Text style={{ fontSize: 12, color: t.subtext, paddingVertical: 6 }}>Henüz kayıtlı kişi yok.</Text>
            )}
          </ScrollView>

          {/* Bu kelimeyi engelle mi */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, marginBottom: 6 }}>
            <Text style={{ fontSize: 13, color: t.text }}>Bu kelimeyi engelle</Text>
            <TouchableOpacity
              onPress={() => setNewWordBlocked(!newWordBlocked)}
              style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: newWordBlocked ? "#DC2626" : t.border, justifyContent: "center", paddingHorizontal: 3 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: t.surface, alignSelf: newWordBlocked ? "flex-end" : "flex-start" }} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={addWord} style={{ backgroundColor: accent, borderRadius: 10, padding: 11, alignItems: "center", marginBottom: 14 }}>
            <Text style={{ color: "white", fontWeight: "700", fontSize: 13 }}>Kaydet</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {personalWords.map((entry) => {
              const labels = [
                ...(entry.contextIds || []).map(id => CONTEXTS[id]?.label || id),
                ...(entry.contactIds || []).map(id => contactsList.find(c => c.id === id)?.name || "Kişi"),
              ];
              return (
                <TouchableOpacity key={entry.id} onPress={() => removeWord(entry.id)}
                  style={{ backgroundColor: entry.blocked ? "#DC2626" : (isDark ? t.surfaceElevated : "#F0F0F4"), borderWidth: entry.blocked ? 0 : 1, borderColor: t.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" }}>
                  <Ionicons name={entry.blocked ? "ban" : "checkmark"} size={12} color={entry.blocked ? "white" : t.subtext} />
                  <Text style={{ color: entry.blocked ? "white" : t.text, fontSize: 12, fontWeight: "700" }}>{entry.word}</Text>
                  <Text style={{ color: entry.blocked ? "rgba(255,255,255,0.75)" : t.subtext, fontSize: 10, flexShrink: 1 }} numberOfLines={1}>· {labels.join(", ")}</Text>
                  <Ionicons name="close" size={12} color={entry.blocked ? "white" : t.subtext} />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Menü öğeleri */}
        <View style={{ backgroundColor: t.surface, borderRadius: 16, overflow: "hidden", marginBottom: 16, borderWidth: 1, borderColor: t.border }}>
          {menuItems.map((item, i) => (
            <TouchableOpacity key={i} onPress={item.onPress || (() => {})} style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: i < menuItems.length - 1 ? 1 : 0, borderColor: t.border }}>
              <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: accent + "1A", justifyContent: "center", alignItems: "center", marginRight: 12 }}>
                <Ionicons name={item.icon} size={16} color={accent} />
              </View>
              <Text style={{ flex: 1, fontSize: 15, color: t.text }}>{item.label}</Text>
              {item.type === "toggle" ? (
                <TouchableOpacity
                  onPress={item.onToggle}
                  style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: item.value ? accent : t.border, justifyContent: "center", paddingHorizontal: 3 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "white", alignSelf: item.value ? "flex-end" : "flex-start" }} />
                </TouchableOpacity>
              ) : (
                <Text style={{ fontSize: 12, color: t.subtext, maxWidth: 140, textAlign: "right" }}>{item.value}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* ChatSense hakkında */}
        <View style={{ backgroundColor: accent, borderRadius: 16, padding: 20, alignItems: "center" }}>
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center", marginBottom: 10 }}>
            <Ionicons name="chatbubble-ellipses" size={22} color="white" />
          </View>
          <Text style={{ fontSize: 18, fontFamily: FONTS.display, color: "white", marginBottom: 4 }}>ChatSense</Text>
          <Text style={{ fontSize: 12, fontFamily: FONTS.body, color: "rgba(255,255,255,0.75)", textAlign: "center", lineHeight: 18 }}>
            Bağlam duyarlı Türkçe kelime öneri sistemi.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function SplashScreen({ darkMode }) {
  const fadeAnim = useRef(new RNAnimated.Value(0)).current;
  const accent = "#4C51BF";

  useEffect(() => {
    RNAnimated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#17171D", justifyContent: "center", alignItems: "center" }}>
      <RNAnimated.View style={{ opacity: fadeAnim, alignItems: "center" }}>
        <View style={{ width: 96, height: 96, borderRadius: 26, backgroundColor: accent, justifyContent: "center", alignItems: "center", marginBottom: 18 }}>
          <Ionicons name="chatbubble-ellipses" size={42} color="#fff" />
        </View>
        <Text style={{ fontSize: 30, fontFamily: FONTS.display, color: "white" }}>ChatSense</Text>
        <Text style={{ fontSize: 13, fontFamily: FONTS.mono, color: "#9C9CA6", marginTop: 8, letterSpacing: 0.4 }}>bağlama duyarlı kelime önerisi</Text>
      </RNAnimated.View>
    </View>
  );
}

function OnboardingCarousel({ onDone, darkMode }) {
  const t = getTheme(darkMode);
  const accent = "#4C51BF";
  const { width } = Dimensions.get("window");
  const [index, setIndex] = useState(0);
  const scrollRef = useRef(null);

  const cards = [
    {
      icon: "chatbubble-ellipses",
      title: "ChatSense'e Hoş Geldin!",
      body: "Bağlama duyarlı Türkçe kelime öneri sistemi.",
      highlight: true,
      color: accent,
    },
    {
      icon: "help-circle",
      title: "Farkı Ne?",
      body: "Normal yapay zeka asistanları \"kim olduğunu\" sormaz",
      dark: true,
      color: "#E8590C",
    },
    {
      icon: "people",
      title: "Kişiler Sekmesi",
      body: "Bir kişiye dokun, sohbet ekranı o kişinin bağlamıyla (Arkadaş, Hoca, İş, Spor, Gündelik) açılır.",
      color: "#0D8A72",
    },
    {
      icon: "sparkles",
      title: "Cümleyi Tamamla",
      body: "Yazdığın cümleyi yapay zekanın tamamlamasını istersen bu butona dokun.",
      color: "#D9831F",
    },
    {
      icon: "swap-horizontal",
      title: "Karşılaştır",
      body: "Aynı mesajın farklı bağlamlardaki önerilerini ve gerçek WhatsApp verisiyle karşılaştırmasını gör.",
      color: "#2F9E44",
    },
    {
      icon: "bulb",
      title: "Kişisel Kelimeler",
      body: "Ayarlar'dan sık kullandığın kelimeleri/ifadeleri ekle, ChatSense bunları öncelikli önersin.",
      color: accent,
    },
    {
      icon: "rocket",
      title: "Hazırsın!",
      body: "İlk istek 10-15 saniye sürebilir, sunucu \"uykuda\" olabilir — normaldir, biraz bekle.",
      final: true,
      color: "#E8590C",
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
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
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
              backgroundColor: card.dark ? "#17171D" : t.surface,
              borderRadius: 24, padding: 28, width: "100%", maxWidth: 420, alignItems: "center",
              borderWidth: card.dark ? 0 : 1, borderColor: t.border,
            }}>
              <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: card.color, justifyContent: "center", alignItems: "center", marginBottom: 18 }}>
                <Ionicons name={card.icon} size={32} color="#fff" />
              </View>
              <Text style={{ fontSize: 23, fontFamily: FONTS.display, color: card.dark ? "white" : t.text, marginBottom: 12, textAlign: "center" }}>{card.title}</Text>
              <Text style={{ fontSize: 14, fontFamily: FONTS.body, color: card.dark ? "#9C9CA6" : t.subtext, lineHeight: 21, textAlign: "center" }}>{card.body}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={{ flexDirection: "row", justifyContent: "center", marginBottom: 16, gap: 6 }}>
        {cards.map((_, i) => (
          <View key={i} style={{
            width: i === index ? 20 : 8, height: 8, borderRadius: 4,
            backgroundColor: i === index ? accent : t.border
          }} />
        ))}
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, paddingBottom: 16 }}>
        {index < cards.length - 1 ? (
          <TouchableOpacity onPress={onDone} style={{ padding: 14 }}>
            <Text style={{ color: t.subtext, fontSize: 15, fontFamily: FONTS.bodyMedium }}>Geç</Text>
          </TouchableOpacity>
        ) : <View />}
        <TouchableOpacity onPress={goNext} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: accent, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14 }}>
          <Text style={{ color: "white", fontSize: 15, fontFamily: FONTS.bodyBold }}>
            {index === cards.length - 1 ? "Başla" : "İleri"}
          </Text>
          <Ionicons name={index === cards.length - 1 ? "rocket" : "arrow-forward"} size={16} color="white" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function AppRoot() {
  const [darkMode, setDarkMode] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(null);
  const [fontsLoaded] = useAppFonts();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    AsyncStorage.getItem("onboarding_done").then(val => {
      setShowOnboarding(val !== "true");
    });
    const timer = setTimeout(() => setShowSplash(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  if (!fontsLoaded || showSplash || showOnboarding === null) {
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

  const tabBarHeight = 72 + insets.bottom;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: { backgroundColor: darkMode ? "#17171D" : "#FFFFFF", borderTopWidth: 1, borderTopColor: darkMode ? "#2A2A33" : "#EBEBF0", height: tabBarHeight, paddingBottom: insets.bottom + 12, paddingTop: 8 },
          tabBarActiveTintColor: darkMode ? "#F5F5F7" : "#17171D",
          tabBarInactiveTintColor: darkMode ? "#5C5C66" : "#B0B0B8",
          tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontFamily: FONTS.bodySemiBold },
          tabBarIcon: ({ focused, color }) => {
            const icons = { Kişiler: "people", Chat: "chatbubble-ellipses", Karşılaştır: "swap-horizontal", Araştırma: "stats-chart", Ayarlar: "settings" };
            return <Ionicons name={focused ? icons[route.name] : icons[route.name] + "-outline"} size={22} color={color} />;
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

export default function App() {
  return (
    <SafeAreaProvider>
      <AppRoot />
    </SafeAreaProvider>
  );
}