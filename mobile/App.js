import { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, StatusBar, KeyboardAvoidingView, Platform,
  SafeAreaView, Alert, Image, Animated as RNAnimated,
  LayoutAnimation, UIManager, TouchableWithoutFeedback, Keyboard
} from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { Swipeable, GestureHandlerRootView } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";


const API = "http://192.168.1.103:8000";

const CONTEXTS = {
  arkadas: { label: "Arkadaş", emoji: "", color: "#18181b", light: "#f4f4f5" },
  hoca:    { label: "Hoca",    emoji: "", color: "#18181b", light: "#f4f4f5" },
  is:      { label: "İş",      emoji: "", color: "#18181b", light: "#f4f4f5" },
  spor:    { label: "Spor",    emoji: "", color: "#18181b", light: "#f4f4f5" },
  gundelik:{ label: "Gündelik",emoji: "", color: "#18181b", light: "#f4f4f5" },
};

const DEFAULT_CONTACTS = [
  { id: 1, name: "Hocam", context: "hoca", emoji: "👨‍🏫" },
  { id: 2, name: "Kankam", context: "arkadas", emoji: "👫" },
  { id: 3, name: "Müdürüm", context: "is", emoji: "💼" },
];

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const Tab = createBottomTabNavigator();

function ChatScreen({ route }) {
  const initialContext = route?.params?.context || "arkadas";
  const [context, setContext] = useState(initialContext);
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [warning, setWarning] = useState(null);
  const [completing, setCompleting] = useState(false);
  const scrollRef = useRef(null);
  const suggestAnim = useRef(new RNAnimated.Value(0)).current;
  const ctx = CONTEXTS[context] || CONTEXTS.arkadas;

  // Mesajları yükle
  useEffect(() => {
    AsyncStorage.getItem("messages_" + context).then(val => {
      if (val) setMessages(JSON.parse(val));
    }).catch(() => {});
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
    if (!text || text.length < 10) { setWarning(null); return; }
    const t = setTimeout(() => checkWarning(text), 1500);
    return () => clearTimeout(t);
  }, [text, context]);

  async function fetchSuggestions() {
    try {
      const res = await fetch(API + "/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context, n_suggestions: 3, history: [] }),
      });
      const data = await res.json();
      const newSuggestions = data.suggestions || [];
      setSuggestions(newSuggestions);
      if (newSuggestions.length > 0) {
        suggestAnim.setValue(0);
        RNAnimated.spring(suggestAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }).start();
      }
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

  async function completeSentence() {
    if (!text.trim()) return;
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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f4f4f5" }}>
      <StatusBar barStyle="light-content" backgroundColor="#18181b" />
      <View style={s.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Image source={require("./assets/icon.png")} style={{ width: 36, height: 36, borderRadius: 8 }} />
          <View>
            <Text style={s.headerTitle}>ChatSense</Text>
            <Text style={s.headerSub}>{ctx.emoji} {ctx.label} bağlamı</Text>
          </View>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ backgroundColor: "white", maxHeight: 52, borderBottomWidth: 1, borderColor: "#f0f0f0" }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
        {Object.entries(CONTEXTS).map(([key, val]) => (
          <TouchableOpacity key={key} onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (messages.length > 0 && context !== key) {
                    Alert.alert(
                      "Bağlam Değiştir",
                      `${CONTEXTS[key].label} bağlamına geçmek istiyor musun? Mevcut sohbet silinecek.`,
                      [
                        { text: "İptal", style: "cancel" },
                        { text: "Geç", onPress: () => { setMessages([]); setContext(key); } }
                      ]
                    );
                  } else {
                    setMessages([]);
                    setContext(key);
                  }
                }}
            style={[s.ctxBtn, { borderColor: val.color, backgroundColor: context === key ? val.color : "white", marginRight: 8 }]}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: context === key ? "white" : val.color }}>
              {val.emoji} {val.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled" onScrollBeginDrag={Keyboard.dismiss}>
        {messages.length === 0 && (
          <View style={{ alignItems: "center", marginTop: 60 }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>{ctx.emoji}</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#1a1a1a", marginBottom: 6 }}>{ctx.label} bağlamı aktif</Text>
            <Text style={{ fontSize: 14, color: "#888", textAlign: "center" }}>Yazmaya başla, sistem bağlama göre öneri sunsun</Text>
          </View>
        )}
        {messages.map((m, i) => (
          <View key={i} style={s.bubble}>
            <Text style={{ fontSize: 15, color: "#1a1a1a", lineHeight: 20 }}>{m.text}</Text>
            <Text style={{ fontSize: 10, color: "#888", marginTop: 4, textAlign: "right" }}>{CONTEXTS[m.context]?.emoji} {m.time}</Text>
          </View>
        ))}
      </ScrollView>
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
        <RNAnimated.View style={{ flexDirection: "row", backgroundColor: "#F8F8F8", borderTopWidth: 1, borderColor: "#eee",
          opacity: suggestAnim,
          transform: [{ translateY: suggestAnim.interpolate({ inputRange: [0,1], outputRange: [8,0] }) }] }}>
          {suggestions.map((sg, i) => (
            <TouchableOpacity key={i} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); acceptSuggestion(sg); }}
              style={{ flex: 1, padding: 12, alignItems: "center", borderRightWidth: i < suggestions.length - 1 ? 1 : 0, borderRightColor: "#e5e5e5" }}>
              <Text style={{ fontSize: 14, color: "#333", fontWeight: "500" }}>{sg}</Text>
            </TouchableOpacity>
          ))}
        </RNAnimated.View>
      )}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flexDirection: "row", padding: 10, backgroundColor: "white", alignItems: "flex-end", borderTopWidth: 1, borderColor: "#f0f0f0" }}>
          <TextInput value={text} onChangeText={setText}
            placeholder={ctx.emoji + " " + ctx.label + " bağlamında yaz..."}
            placeholderTextColor="#aaa"
            style={{ flex: 1, backgroundColor: "#f4f4f5", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100, color: "#1a1a1a" }}
            multiline />
          <TouchableOpacity onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); sendMessage(); }} style={[s.sendBtn, { backgroundColor: ctx.color }]}>
            <Ionicons name="send" size={18} color="white" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ContactsScreen({ navigation }) {
  const [contacts, setContacts] = useState(DEFAULT_CONTACTS);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCtx, setNewCtx] = useState("arkadas");

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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f4f4f5" }}>
      <View style={[s.header, { justifyContent: "space-between" }]}>
        <Text style={s.headerTitle}>Kişiler</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)} style={[s.csLogo, { backgroundColor: "#18181b" }]}>
          <Ionicons name="add" size={22} color="white" />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {showAdd && (
          <View style={{ backgroundColor: "white", borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "bold", marginBottom: 12 }}>Yeni Kişi Ekle</Text>
            <TextInput value={newName} onChangeText={setNewName} placeholder="İsim (örn. Hocam, Annem)"
              style={{ backgroundColor: "#f4f4f5", borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 12 }} />
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
        {contacts.map(contact => {
          const cv = CONTEXTS[contact.context] || CONTEXTS.arkadas;
          const renderRightActions = () => (
            <TouchableOpacity
              onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); deleteContact(contact.id); }}
              style={{ backgroundColor: "#ef4444", justifyContent: "center", alignItems: "center", width: 80, borderRadius: 12, marginBottom: 10, marginLeft: -12 }}>
              <Ionicons name="trash-outline" size={20} color="white" />
              <Text style={{ color: "white", fontSize: 11, marginTop: 2 }}>Sil</Text>
            </TouchableOpacity>
          );
          return (
            <Swipeable key={contact.id} renderRightActions={renderRightActions}>
              <TouchableOpacity
                onPress={() => navigation.navigate("Chat", { context: contact.context, contact: contact })}
                style={{ backgroundColor: "white", borderRadius: 12, padding: 16, marginBottom: 10, flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#18181b", justifyContent: "center", alignItems: "center", marginRight: 12 }}>
                  <Text style={{ fontSize: 16, color: "white", fontWeight: "bold" }}>{contact.name[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "bold", color: "#1a1a1a" }}>{contact.name}</Text>
                  <Text style={{ fontSize: 12, marginTop: 2, color: "#666" }}>{cv.label} bağlamı</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#ccc" />
              </TouchableOpacity>
            </Swipeable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function ResearchScreen() {
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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f4f4f5" }}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Araştırma</Text>
        <Text style={s.headerSub}>94 katılımcı • 6 test cümlesi</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={s.sectionTitle}>Temel Bulgular</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
          {findings.map((f, i) => (
            <View key={i} style={{ width: "47%", backgroundColor: "white", borderRadius: 12, padding: 14 }}>
              <View style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: "#18181b", justifyContent: "center", alignItems: "center", marginBottom: 8 }}><Text style={{ color: "white", fontSize: 11, fontWeight: "bold" }}>{f.icon}</Text></View>
              <Text style={{ fontSize: 13, fontWeight: "bold", color: "#1a1a1a", marginBottom: 4 }}>{f.title}</Text>
              <Text style={{ fontSize: 11, color: "#666", lineHeight: 16 }}>{f.desc}</Text>
            </View>
          ))}
        </View>
        <Text style={s.sectionTitle}>Chi-Square Sonuçları</Text>
        <View style={{ backgroundColor: "white", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
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

function CompareScreen() {
  const [expanded, setExpanded] = useState(null);
  const data = [
    { sentence: "Bugün hava", iphone: ["nasil","çok","güzel"], samsung: ["çok","nasil","iyi"], xiaomi: ["nasil","durumu","iyi"], arkadas: ["çok","güzel","nasil"], hoca: ["iyi","bugün","hocam"], is: ["raporunu","toplanti","iyi"] },
    { sentence: "Seni çok", iphone: ["seviyorum","özledim","seviyor"], samsung: ["seviyorum","özledim","seviyor"], xiaomi: ["seviyorum","özledim","seviyor"], arkadas: ["özledim","seviyorum","özledik"], hoca: ["teşekkür","saygılarımla","bilgi"], is: ["takdir","değerli","teşekkür"] },
    { sentence: "Sınav için", iphone: ["de","bir","da"], samsung: ["mi","çok","bir"], xiaomi: ["hemen","için","birkaç"], arkadas: ["çalışalım","hazırlandın","korktum"], hoca: ["bilgi","tarih","kapsam"], is: ["rapor","hazırlık","sunum"] },
  ];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f4f4f5" }}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Karşılaştır</Text>
        <Text style={s.headerSub}>WhatsApp vs ChatSense</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ backgroundColor: "#f4f4f5", borderRadius: 10, padding: 12, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: "#18181b" }}>
          <Text style={{ fontSize: 13, color: "#555", lineHeight: 18 }}>
            WhatsApp cihaz bazlı standart öneri sunarken, ChatSense alıcıya göre farklılaştırır.
          </Text>
        </View>
        {data.map((item, idx) => (
          <View key={idx} style={{ backgroundColor: "white", borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
            <TouchableOpacity
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setExpanded(expanded === idx ? null : idx);
              }}
              style={{ padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: 15, fontWeight: "bold", color: "#1a1a1a" }}>"{item.sentence}"</Text>
              <Ionicons name={expanded === idx ? "chevron-up" : "chevron-down"} size={16} color="#999" />
            </TouchableOpacity>
            {expanded === idx && (
              <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#999", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>WHATSAPP</Text>
                {[["iPhone","#555",item.iphone],["Samsung","#333",item.samsung],["Xiaomi","#444",item.xiaomi]].map(([brand,color,words]) => (
                  <View key={brand} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: "#666", width: 80 }}>{brand}</Text>
                    <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap" }}>
                      {words.map((w, wi) => (
                        <View key={wi} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: "#555" }}>
                          <Text style={{ color: "white", fontSize: 11, fontWeight: "bold" }}>{w}</Text>
                        </View>
                      ))}
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

export default function App() {
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
            const icons = { Chat: focused ? "chatbubble" : "chatbubble-outline", Kişiler: focused ? "people" : "people-outline", Karşılaştır: focused ? "swap-horizontal" : "swap-horizontal-outline", Araştırma: focused ? "bar-chart" : "bar-chart-outline" };
            return <Ionicons name={icons[route.name]} size={22} color={color} />;
          },
        })}>
        <Tab.Screen name="Chat" component={ChatScreen} />
        <Tab.Screen name="Kişiler" component={ContactsScreen} />
        <Tab.Screen name="Karşılaştır" component={CompareScreen} />
        <Tab.Screen name="Araştırma" component={ResearchScreen} />
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
  bubble: { alignSelf: "flex-end", backgroundColor: "#DCF8C6", borderRadius: 16, borderBottomRightRadius: 4, padding: 12, marginBottom: 8, maxWidth: "80%" },
  warningBox: { backgroundColor: "#FFF8E1", margin: 8, padding: 12, borderRadius: 10, borderLeftWidth: 4, borderLeftColor: "#f59e0b" },
  sendBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center", marginLeft: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: "#1a1a1a", marginBottom: 12, marginTop: 8 },
});
