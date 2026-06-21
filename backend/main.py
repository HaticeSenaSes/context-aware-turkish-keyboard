from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from collections import defaultdict, Counter
from time import time
import re
import json
import os
from dotenv import load_dotenv
from groq import Groq

try:
    from anthropic import Anthropic
except ImportError:
    Anthropic = None

load_dotenv()

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Claude isteğe bağlı ikinci motor: ANTHROPIC_API_KEY tanımlıysa devreye girer,
# tanımlı değilse sistem sorunsuzca Groq'a düşer (geriye dönük uyumlu).
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
claude_client = Anthropic(api_key=ANTHROPIC_API_KEY) if (Anthropic and ANTHROPIC_API_KEY) else None
CLAUDE_MODEL = "claude-haiku-4-5-20251001"

app = FastAPI(title="Context-Aware Turkish Word Prediction API")

# ── Rate Limiting ──
RATE_LIMIT = 30  # max istek/dakika per IP
rate_store: dict = {}

def check_rate_limit(ip: str):
    now = time()
    if ip not in rate_store:
        rate_store[ip] = []
    # Son 60 saniyedeki istekleri tut
    rate_store[ip] = [t for t in rate_store[ip] if now - t < 60]
    if len(rate_store[ip]) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Çok fazla istek. Lütfen bekleyin.")
    rate_store[ip].append(now)

# ── Input Sanitizer ──
def sanitize(text: str, max_len: int = 500) -> str:
    if not text:
        return ""
    # HTML/script injection temizle
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"[;`]", "", text)
    return text[:max_len].strip()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

CONTEXT_LABELS = {
    "arkadas": "Arkadaş",
    "hoca": "Hoca / Akademik",
    "is": "İş / Profesyonel",
    "spor": "Spor",
    "gundelik": "Gündelik",
}

def load_data():
    json_path = os.path.join(os.path.dirname(__file__), "..", "data", "context_data.json")
    if os.path.exists(json_path):
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "arkadas": [
            "lan bugün çok yoruldum ya",
            "moruk naber ne yapıyorsun",
            "kanka akşam buluşalım mı",
            "abi sana bir şey soracaktım",
            "ya bu hafta sonu plan var mı",
            "seninle konuşmak istiyorum",
            "ne zaman müsaitsin buluşalım",
            "seni özledim be dostum",
            "kafam çok karışık şu an",
            "ya çok saçma bir gün geçirdim",
            "bugün çıkalım mı dışarı",
            "kanka bu hafta çok yoğunum",
            "moruk seni çok özledim be",
            "abi bugün çok eğlendik ya",
            "kanka sana ihtiyacım var şu an",
            "ya bence haklısın bu konuda",
            "ne yapıyoruz bu akşam söyle",
            "hadi akşam buluşalım bir yerde",
            "ya sen ne zaman müsaitsin",
            "bu hafta hiç görüşemedik ya",
        ],
        "hoca": [
            "Hocam iyi günler size ulaşmak istedim",
            "Hocam ödev hakkında sorum olacaktı",
            "Hocam sınav tarihi hakkında bilgi alabilir miyim",
            "Hocam randevu almak istiyorum müsait misiniz",
            "Hocam teşekkür ederim ilginiz için",
            "Saygılarımla iyi çalışmalar dilerim",
            "Hocam bitirme projesi hakkında görüşmek istiyorum",
            "Hocam bilgilerinize arz ederim",
            "Hocam iyi akşamlar saygılarımla",
            "Hocam müsaitseniz görüşebilir miyiz",
            "Hocam devamsızlık hakkında bilgi almak istedim",
            "Hocam teşekkür ederim anlayışınız için",
            "Saygılarımla bilgilerinize sunarım",
            "Hocam bir konuda yardımınıza ihtiyacım var",
            "Hocam iyi günler dilerim saygılarımla",
            "Sayın hocam bilgilerinize sunarım",
            "Hocam mazeret sınavı için başvuru yapabilir miyim",
            "Hocam proje teslim tarihi hakkında bilgi almak istedim",
            "Hocam sunumum hakkında geri bildirim alabilir miyim",
            "Hocam staj belgesi için imzanıza ihtiyacım var",
        ],
        "is": [
            "toplantı saatini değiştirmemiz gerekiyor",
            "raporu bugün teslim edebilir misiniz",
            "proje güncellemesi hakkında bilgi vermek istedim",
            "bütçe onayı için müdür onayı gerekiyor",
            "haftalık raporları paylaşabilir misiniz",
            "ekip toplantısını ileri almamız gerekiyor",
            "projenin durumu hakkında güncelleme bekliyorum",
            "teklif hazırladım incelemenizi rica ederim",
            "toplantı notlarını paylaşıyorum",
            "proje takvimini güncellememiz gerekiyor",
            "müşteri geri bildirimi olumlu geldi",
            "ekibimizle koordineli çalışmamız lazım",
            "sunumu paylaşıyorum görüşlerinizi bekliyorum",
            "ilginiz için teşekkür ederim",
            "toplantıya katılımınızı bekliyorum",
            "dosyayı paylaşıyorum incelemenizi rica ederim",
            "revizyon talebini ilettim",
            "koordinasyon toplantısı düzenleyelim",
            "müşteri memnuniyeti çok önemli bizim için",
            "projeye katkınız için teşekkür ederim",
        ],
        "spor": [
            "maçı izledin mi bu akşam",
            "takım çok kötü oynadı ya",
            "gol attı sonunda forvet",
            "şampiyon bu yıl kim olur",
            "transferde kim geliyor takıma",
            "stadyuma gidiyorum maça",
            "maç skoru kaç oldu",
            "takımın kadrosu çok iyi bu sezon",
            "penaltı kaçırdı çok üzüldüm",
            "derbi maçı çok heyecanlıydı",
            "spor yapmak çok iyi geliyor",
            "antrenman nasıldı bugün yoruldum",
            "milli takım sahaya çıkıyor",
            "şampiyonlar ligi finalini izleyelim",
            "basketbol maçında harika oynadılar",
            "hakem kararı çok tartışmalı oldu",
            "fitness salonuna üye oldum bu ay",
            "koşuya gidiyorum bugün spor yapacağım",
            "takım bu sezon iyi oynuyor",
            "maçta harika bir gol vardı",
        ],
        "gundelik": [
            "bugün hava çok güzel",
            "kahvaltıda ne yiyeceksin",
            "akşam yemeği ne pişirelim",
            "bugün çok yorucu bir gün geçirdim",
            "hafta sonu ne yapacaksın",
            "film izleyelim bu akşam",
            "çok acıktım bir şeyler yiyeyim",
            "trafik çok kötüydü bugün",
            "bugün evde kalmak istiyorum",
            "kahve içmek istiyorum çok yorgunum",
            "yarın erken kalkmam lazım",
            "güzel bir gün geçirdim bugün",
            "alışverişe gidiyorum ihtiyaçlar var",
            "müzik dinliyorum şu an",
            "hava soğudu mont giydim",
            "bugün çok işim vardı",
            "akşam yemeği hazırladım",
            "kitap okumak istiyorum akşam",
            "temizlik yapmam gerekiyor",
            "yemek yapmak istemiyorum bugün",
        ],
    }

def clean_text(text):
    text = str(text).lower().strip()
    text = re.sub(r'[^\w\s]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text

def train_ngram(sentences):
    model = defaultdict(Counter)
    for sentence in sentences:
        words = clean_text(sentence).split()
        if len(words) < 2:
            continue
        for i in range(len(words) - 1):
            model[words[i]][words[i+1]] += 1
        for i in range(len(words) - 2):
            model[(words[i], words[i+1])][words[i+2]] += 1
    return model

print("Loading data...")
CONTEXT_DATA = load_data()
print(f"✅ {len(CONTEXT_DATA)} contexts loaded")
for ctx, sentences in CONTEXT_DATA.items():
    print(f"   {ctx}: {len(sentences)} sentences")

print("Training models...")
MODELS = {ctx: train_ngram(sentences) for ctx, sentences in CONTEXT_DATA.items()}

def build_vocab(sentences):
    freq = Counter()
    for sentence in sentences:
        freq.update(clean_text(sentence).split())
    return freq

VOCAB = {ctx: build_vocab(sentences) for ctx, sentences in CONTEXT_DATA.items()}
ALL_VOCAB = set()
for _v in VOCAB.values():
    ALL_VOCAB.update(_v.keys())
print("✅ All models ready")

def get_prefix_completions(context_key, prefix, top_n=8):
    """Kullanici hala bir kelimeyi yariminda yaziyorsa (ornek: 'pro'), bu fonksiyon
    o onekle baslayan GERCEK, TAM kelimeleri korpustan sikliklarina gore dondurur.
    Bu, LLM'in sadece eksik harfleri (orn. 'je') degil tam kelimeyi ('proje')
    onermesini saglamak icin hem ipucu hem de dogrulama amacli kullanilir."""
    if not prefix:
        return []
    vocab = VOCAB.get(context_key, Counter())
    matches = [(w, c) for w, c in vocab.items() if w.startswith(prefix) and w != prefix and is_plausible_turkish_word(w)]
    matches.sort(key=lambda x: -x[1])
    return [w for w, _ in matches[:top_n]]

class PredictRequest(BaseModel):
    text: str
    context: str
    n_suggestions: int = 3
    history: list = []
    personal_data: list = []  # [{prev, word}] — kullanıcı kabul geçmişi
    personal_words: list = []  # ["yeditepe", "bilişim sistemleri"] — kullanıcı tanımlı kelimeler

class WarningRequest(BaseModel):
    text: str
    context: str

class SentenceRequest(BaseModel):
    text: str
    context: str

@app.get("/")
def root():
    return {"message": "Context-Aware Turkish Word Prediction API is running"}

@app.get("/contexts")
def list_contexts():
    return {"contexts": {ctx: len(sentences) for ctx, sentences in CONTEXT_DATA.items()}}

FEW_SHOT_EXAMPLES = {
    "arkadas": [
        ("naber bu", "ya, abi, kanka"),
        ("bu aksam ne", "yapiyorsun, var, dersin"),
        ("seni cok", "ozledim, seviyorum, dusunuyorum"),
    ],
    "hoca": [
        ("hocam ders", "hakkinda, programi, notlari"),
        ("sinav icin", "calismaniz, hazirlanmaniz, gerekli"),
        ("hocam tesekkur", "ederim, ediyorum, ederiz"),
    ],
    "is": [
        ("toplanti saat", "kacta, ne, zaman"),
        ("raporu ne zaman", "teslim, gonderebilirim, hazirlarim"),
        ("musteri ile", "gorusme, toplanti, iletisim"),
    ],
    "spor": [
        ("mac bu aksam", "kacta, var, oynaniyor"),
        ("fenerbahce bugun", "kazandi, oynuyor, oynadi"),
        ("antrenman nasil", "gecti, oldu, geciyor"),
    ],
    "gundelik": [
        ("bugun hava", "guzel, soguk, nasil"),
        ("aksam ne", "yiyelim, yapalim, pisirelim"),
        ("bu hafta sonu", "ne, nereye, kiminle"),
    ],
}

def build_few_shot_block(context_key):
    examples = FEW_SHOT_EXAMPLES.get(context_key, [])
    lines = []
    for inp, out in examples:
        lines.append(f'Girdi: "{inp}" -> Cikti: {out}')
    return "\n".join(lines)

def get_ngram_hints(context_key, text, top_n=5):
    """Bağlama özel n-gram modelinden, mevcut girdiye uygun en sık geçen aday kelimeleri çıkarır.
    Bu, LLM'e o bağlamın gerçek kelime dağarcığından somut bir ipucu verir."""
    model = MODELS.get(context_key, {})
    words = clean_text(text).split()
    if not words:
        return []
    candidates = Counter()
    if len(words) >= 2:
        key = (words[-2], words[-1])
        if key in model:
            candidates.update(model[key])
    if words[-1] in model:
        candidates.update(model[words[-1]])
    return [w for w, _ in candidates.most_common(top_n * 2) if is_plausible_turkish_word(w)][:top_n]

def build_system_prompt(context_label, few_shot, hint_line, history, personal_words):
    """Hem Claude hem Groq icin ortak sistem talimati. Turkce'nin eklemeli yapisina
    (unlu uyumu, hal/iyelik/cekim ekleri) acikca dikkat cekiyor — bu, onerilerin
    sadece konuyla degil dilbilgisiyle de uyumlu olmasini saglayan en kritik kisim."""
    return (
        f"Sen bir Türkçe akıllı klavye öneri sistemisin. "
        f"Aktif bağlam: {context_label}. "
        f"Bağlam tarzı: arkadas=samimi/argo/kanka/nbr/ya, hoca=saygılı/resmi/hocam/sayın/teşekkür, is=profesyonel/toplantı/rapor, spor=enerjik/maç/antrenman, gundelik=rahat/tamam/olur.\n\n"
        f"ÖNEMLİ — Türkçe ek uyumu: Türkçe eklemeli bir dildir. Önerdiğin her kelime, "
        f"kullanıcının yazdığı metnin TAM OLARAK ardına eklendiğinde dilbilgisel açıdan "
        f"doğru ve akıcı olmalı. Önceki kelimenin son sesine göre ünlü uyumuna (a/ı/o/u "
        f"veya e/i/ö/ü) ve gereken çekim ekine (hal eki, iyelik eki, kişi/zaman eki, "
        f"bağlaç) dikkat et — sadece konuyla alakalı değil, doğrudan ardına yazılabilecek "
        f"gramatik olarak tamamlayıcı kelimeler öner. Örnek: \"eve\" sonrası \"gidiyorum\" "
        f"doğru, \"git\" yanlış akar; \"okulda\" sonrası \"okudum\" değil \"okuyorum\" gibi "
        f"zaman/kişi uyumuna dikkat et.\n\n"
        f"Aşağıda bu bağlam için örnek girdi-çıktı çiftleri var, aynı formatı ve tonu kullan:\n{few_shot}\n\n"
        f"{hint_line}"
        f"{'Önceki mesajlar: ' + ' | '.join(history[-3:]) + '. Bu bağlamı dikkate al. ' if history else ''}"
        f"{'Kullanıcının sık kullandığı özel kelimeler (mümkünse bunları öner): ' + ', '.join(personal_words) + '. ' if personal_words else ''}"
        f"ÖNEMLİ — Konu tutarlılığı: Önce kullanıcının yazdığı TÜM cümleyi oku ve neyi anlatmaya "
        f"çalıştığını anla (örn. \"hocama projeyle ilgili yardım istediğimi yazıyorum\" diyorsa "
        f"konu 'yardım istemek/proje'dir). Önerilerin bu konuyu SÜRDÜRMELİ, son kelimeye bakıp "
        f"alakasız yeni bir konuya sıçramamalı. Sadece son kelimeyle değil, cümlenin bütün "
        f"anlamıyla tutarlı ol.\n\n"
        f"Görevin: Kullanıcının yazmakta olduğu cümlenin devamına gelebilecek, gramatik "
        f"olarak doğru ve cümlenin konusuyla tutarlı EN ALAKALI 3 Türkçe kelimeyi tahmin et. "
        f"KURAL — sadece gerçek kelime: Her öneri, Türkçe'de gerçekten var olan TEK bir "
        f"kelime ya da onun bir çekim eki almış hali olmalı. İki ayrı kelimeyi boşluksuz "
        f"birleştirip yeni, var olmayan bir kelime UYDURMA (örn. 'iyiakşamlar' gibi yanlış "
        f"birleşim asla üretme). Emin değilsen daha kısa, basit ve kesin doğru bir kelime seç. "
        f"KURAL — sadece Türkçe: Önerdiğin her kelime SADECE Türkçe olmalı. Başka bir dilden "
        f"(İngilizce, Almanca vb.) kelime veya ifade KESİNLİKLE önerme. "
        f"Kural: SADECE 3 kelime, virgülle ayır, başka HİÇBİR şey yazma. "
        f"Örnek: tarihi,bitişi,teslimi"
    )

SPECIAL_TOKEN_BLOCKLIST = {
    "python_tag", "start_header_id", "end_header_id", "eot_id", "im_start", "im_end",
    "begin_of_text", "endoftext", "assistant", "system", "user", "header",
}

TURKISH_ALPHABET = set("abcçdefgğhıijklmnoöprsştuüvyz0123456789")

# Korpus orijinal (scrape edilmiş) veriden geldiği icin icinde nadiren yabanci
# dil kelimesi "gurultu" olarak kalmis olabilir (orn. "the" arkadas korpusunda
# 2 kez geciyor). Sozluk kontrolu boyle durumlari yakalayamayacagi icin en
# yaygın İngilizce/Almanca fonksiyon kelimelerini acikca da reddediyoruz.
FOREIGN_WORD_BLOCKLIST = {
    "the", "and", "you", "for", "are", "is", "was", "were", "with", "this",
    "that", "have", "has", "not", "but", "what", "all", "can", "will", "just",
    "der", "die", "das", "und", "ist", "nicht", "sie", "ich", "wir",
}

# Bilinen Turkce ek kaliplari (cogul/iyelik/hal/fiil cekimleri). 'ben' gibi kisa
# ama gercek bir kok bulunca geri kalan kismin GERCEKTEN bir Turkce ek zinciri
# olup olmadigini dogrulamak icin kullanilir — orn. 'ben'+'ötirse' (anlamsiz)
# ile 'oku'+'yacağım' (gercek) arasindaki farki bu ayirt eder.
_BASE_SUFFIXES = [
    "lardan", "lerden", "ımızdan", "imizden", "larınız", "leriniz",
    "yorsunuz", "yorlardı", "mışsınız", "mişsiniz", "eceğim", "acağım", "ecektir", "acaktır",
    "malıyım", "meliyim", "yorum", "yorsun", "yoruz", "yorlar",
    "ımız", "imiz", "umuz", "ümüz", "ınız", "iniz", "unuz", "ünüz", "ları", "leri",
    "dım", "dim", "dum", "düm", "tım", "tim", "tum", "tüm", "dın", "din", "dun", "dün", "tın", "tin", "tun", "tün",
    "mışım", "mişim", "muşum", "müşüm", "mışız", "mişiz",
    "sınız", "siniz", "sunuz", "sünüz", "sanız", "seniz",
    "ler", "lar", "nın", "nin", "nun", "nün", "dan", "den", "tan", "ten",
    "yor", "dır", "dir", "dur", "dür", "mış", "miş", "muş", "müş",
    "ecek", "acak", "meli", "malı", "sak", "sek", "san", "sen",
    "sın", "sin", "sun", "sün", "lık", "lik", "luk", "lük",
    "cı", "ci", "cu", "cü", "çı", "çi", "çu", "çü", "sız", "siz", "suz", "süz",
    "lı", "li", "lu", "lü", "ya", "ye", "na", "ne", "da", "de", "ta", "te",
    "ım", "im", "um", "üm", "ın", "in", "un", "ün", "sı", "si", "su", "sü",
    "ır", "ir", "ur", "ür", "ar", "er", "sa", "se",
    "ı", "i", "u", "ü", "a", "e",
]
_VOWELS = set("aeıioöuü")
# unluyle baslayan eklerin, unluyle biten koklere eklenirken aldigi 'y'
# tamponlu hallerini de listeye ekliyoruz (oku+y+acağım gibi)
_TURKISH_SUFFIXES = sorted(
    set(_BASE_SUFFIXES + ["y" + s for s in _BASE_SUFFIXES if s[0] in _VOWELS]),
    key=len, reverse=True
)

def _strict_turkish_stem_check(word, max_strips=4):
    """Bilinen ek kaliplarini sondan tekrar tekrar ayiklayip, kalan kokun
    sozlukte olup olmadigini kontrol eder. Hem kok hem her bir ek gercek
    Turkce yapilar oldugu icin, rastgele kisa bir kok + anlamsiz kalinti
    (orn. ben+ötirse) bu testi GECEMEZ."""
    w = word
    for _ in range(max_strips):
        if w in ALL_VOCAB:
            return True
        matched = False
        for suf in _TURKISH_SUFFIXES:
            if w.endswith(suf) and len(w) - len(suf) >= 2:
                w = w[:-len(suf)]
                matched = True
                break
        if not matched:
            break
    return False

def is_plausible_turkish_word(word):
    """Yabancı dil kelimelerini (Çince, İngilizce, Almanca vb. — alfabesi farklı
    olsun olmasın, ya da 'benötirse' gibi yabancı-Türkçe karışımı uydurma
    kelimeleri) yakalamak için sırayla: (1) Türkçe alfabesinde OLMAYAN herhangi
    bir karakter varsa anında reddet. (2) Bilinen yaygın yabancı kelimeler
    listesindeyse reddet. (3) Kelime birebir sözlükte (ALL_VOCAB) var mı?
    (4) Sondan gerçek Türkçe ek kalıpları ayıklanınca kalan kök sözlükte mi?
    (5) Son çare: yeterince UZUN ve belirgin (5+ harf) bir kök sözlükte
    bulunuyorsa kabul et — kısa, rastgele eşleşme riski taşıyan köklerde bu
    gevşek kontrol uygulanmaz, sadece (4)'teki gerçek ek doğrulaması geçerli."""
    w = word.lower()
    if not w or any(ch not in TURKISH_ALPHABET for ch in w):
        return False
    if w in FOREIGN_WORD_BLOCKLIST:
        return False
    if w in ALL_VOCAB:
        return True
    if _strict_turkish_stem_check(w):
        return True
    for cut in range(1, min(9, len(w) - 2)):
        stem = w[:-cut]
        if len(stem) >= 5 and stem in ALL_VOCAB:
            return True
    return False

def drop_concatenated_garbage(suggestions, context_key):
    """Bazen model iki gercek kelimeyi bosluksuz birlestirip anlamsiz tek bir
    'kelime' uretiyor (orn. 'iyiakitim' = 'iyi' + 'akitim' gibi). Bu kelimenin,
    baglam sozlugundeki iki gercek kelimenin dogrudan ardisik birlesimi olup
    olmadigini kontrol edip oyleyse listeden cikariyoruz. Ayrica, hicbir
    sekilde gercek Turkce kelimeye benzemeyen (orn. yabanci dil) onerileri de
    eler — savunma sirasinda boyle bir oneri cikmasi cok kotu olur."""
    vocab = VOCAB.get(context_key, {})
    cleaned = []
    for s in suggestions:
        is_garbage = False
        if len(s) >= 8 and " " not in s:
            for i in range(3, len(s) - 2):
                if s[:i] in vocab and s[i:] in vocab:
                    is_garbage = True
                    break
        if is_garbage:
            continue
        # cok kelimeli oneriler (orn. "iyi akşamlar") her kelimesi ayrı kontrol edilir
        words = s.split(" ")
        if all(is_plausible_turkish_word(w) for w in words if w):
            cleaned.append(s)
    return cleaned

def parse_suggestion_line(raw):
    # Llama tabanlı sohbet sablonlarinin ozel kontrol token'lari (<|python_tag|>,
    # <|start_header_id|>assistant<|end_header_id|> vb.) bazen ham metne sizabiliyor.
    # Once bunlari acikca temizliyoruz, sonra normal ayristirmaya geciyoruz.
    raw = re.sub(r"<\|[^|]*\|>", "", raw)
    for line in raw.split("\n"):
        if "," in line:
            raw = line
            break
    parts = raw.split(",")
    suggestions = []
    for p in parts:
        clean = re.sub(r"^[\d\.\-\)\s]+", "", p.strip())
        clean = re.sub(r"[^\w\s]", "", clean).strip()
        clean = clean.lower()
        if not clean or len(clean) <= 1:
            continue
        if "_" in clean or clean in SPECIAL_TOKEN_BLOCKLIST:
            continue
        suggestions.append(clean)
    return list(dict.fromkeys(suggestions))[:3]

def get_claude_suggestions(system_prompt, user_content):
    response = claude_client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=30,
        temperature=0.5,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
    )
    raw = "".join(b.text for b in response.content if hasattr(b, "text")).strip()
    suggestions = parse_suggestion_line(raw)
    if len(suggestions) < 2:
        raise ValueError("Yetersiz öneri (claude)")
    return suggestions

def get_groq_suggestions(system_prompt, user_content):
    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=30,
        temperature=0.5,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
    )
    raw = response.choices[0].message.content.strip()
    suggestions = parse_suggestion_line(raw)
    if len(suggestions) < 2:
        raise ValueError("Yetersiz öneri (groq)")
    return suggestions


def build_completion_prompt(context_label, prefix, vocab_hints):
    hint_line = f"Bu bağlamda '{prefix}' ile başlayan gerçek kelimeler (varsa bunlardan ilham al): {', '.join(vocab_hints)}. " if vocab_hints else ""
    return (
        f"Sen bir Türkçe akıllı klavye öneri sistemisin. Aktif bağlam: {context_label}.\n\n"
        f"DURUM: Kullanıcı şu an bir kelimeyi YAZMAYI BİTİRMEDİ, hâlâ yazıyor. Şu ana kadar "
        f"yazdığı kısım (önek): \"{prefix}\".\n\n"
        f"GÖREV: Bu önekle BAŞTAN BAŞLAYAN, bağlama uygun TAM ve GERÇEK 3 Türkçe kelime öner. "
        f"{hint_line}\n\n"
        f"KRİTİK KURAL: Sadece eksik harfleri DEĞİL, kelimenin TAMAMINI yaz. Örnek: önek "
        f"\"pro\" ise doğru cevaplar \"proje\", \"program\", \"profesör\" gibi TAM kelimelerdir; "
        f"\"je\" veya \"gram\" gibi sadece eksik parçayı yazmak YANLIŞTIR. Her öneri mutlaka "
        f"\"{prefix}\" ile başlamalı.\n\n"
        f"Kural: SADECE 3 kelime, virgülle ayır, başka HİÇBİR şey yazma. "
        f"Örnek: proje,program,profesör"
    )

@app.post("/predict")
async def predict(req: PredictRequest, request: Request):
    check_rate_limit(request.client.host)
    req.text = sanitize(req.text)
    if not req.text:
        return {"suggestions": [], "source": "empty"}

    context_label = CONTEXT_LABELS.get(req.context, req.context)

    # Kullanici son kelimeyi hala yaziyor mu (sonda bosluk yok) yoksa bitirdi mi (sonda
    # bosluk var)? Bu ayrim kritik: bitirmemisse SONRAKI kelime degil, MEVCUT kelimenin
    # TAMAMLANMASI istenmeli — aksi halde "pro" -> "je" gibi anlamsiz parca onerileri cikar.
    ends_with_space = req.text[-1].isspace()
    cleaned_words = clean_text(req.text).split()
    is_partial_word = (not ends_with_space) and len(cleaned_words) > 0

    if is_partial_word:
        prefix = cleaned_words[-1]
        vocab_hints = get_prefix_completions(req.context, prefix)
        system_prompt = build_completion_prompt(context_label, prefix, vocab_hints)
        user_content = f'Önek: "{prefix}" — bu önekle başlayan 3 tam kelime:'

        def filter_completions(suggestions):
            valid = [s for s in suggestions if s.startswith(prefix) and s != prefix and is_plausible_turkish_word(s)]
            if len(valid) < 2:
                valid = list(dict.fromkeys(valid + vocab_hints))
            return valid[:3]

        if claude_client:
            try:
                suggestions = filter_completions(get_claude_suggestions(system_prompt, user_content))
                if len(suggestions) >= 1:
                    return {"suggestions": suggestions, "context": req.context, "source": "claude_completion"}
            except Exception as e:
                print(f"Claude completion fallback: {e}")
        try:
            suggestions = filter_completions(get_groq_suggestions(system_prompt, user_content))
            if len(suggestions) >= 1:
                return {"suggestions": suggestions, "context": req.context, "source": "groq_completion"}
        except Exception as e:
            print(f"Groq completion fallback: {e}")
        # Son care: saf korpus tabanli onek tamamlama
        return {"suggestions": vocab_hints[:3], "context": req.context, "source": "vocab_completion"}

    few_shot = build_few_shot_block(req.context)
    ngram_hints = get_ngram_hints(req.context, req.text)
    hint_line = f"Bu baglamda bu girdiden sonra siklikla kullanilan kelimeler (ilham al, birebir kopyalama zorunlu degil): {', '.join(ngram_hints)}. " if ngram_hints else ""
    system_prompt = build_system_prompt(context_label, few_shot, hint_line, req.history, req.personal_words)
    user_content = f'{"Konuşma geçmişi: " + " | ".join(req.history[-3:]) + chr(10) if req.history else ""}Şu an yazılan: "{req.text}" — devamına gelebilecek 3 kelime:'

    # 1) Claude (varsa ve ANTHROPIC_API_KEY tanimliysa) — en yuksek kalite, Turkce
    #    morfolojisinde gozlemle daha guclu oldugu icin birincil motor.
    if claude_client:
        try:
            suggestions = drop_concatenated_garbage(get_claude_suggestions(system_prompt, user_content), req.context)
            if suggestions:
                return {"suggestions": suggestions, "context": req.context, "source": "claude"}
        except Exception as e:
            print(f"Claude fallback: {e}")

    # 2) Groq — Claude yoksa veya basarisiz olursa
    try:
        suggestions = drop_concatenated_garbage(get_groq_suggestions(system_prompt, user_content), req.context)
        if suggestions:
            return {"suggestions": suggestions, "context": req.context, "source": "groq"}
    except Exception as e:
        print(f"Groq fallback: {e}")

    # 3) N-gram — her iki LLM de basarisiz olursa son care
    model = MODELS.get(req.context, {})
    words = clean_text(req.text).split()
    if not words:
        return {"suggestions": [], "source": "ngram"}
    candidates = Counter()
    if len(words) >= 2:
        key = (words[-2], words[-1])
        if key in model:
            candidates.update(model[key])
    if words[-1] in model:
        candidates.update(model[words[-1]])
    # Kişisel öğrenme verisini ekle (3x ağırlık)
    if req.personal_data:
        last_word = words[-1]
        for item in req.personal_data:
            if isinstance(item, dict) and item.get("prev") == last_word:
                candidates[item.get("word", "")] += 3
    final = [w for w, _ in candidates.most_common(10) if is_plausible_turkish_word(w)][:3]
    return {"suggestions": final, "source": "ngram_personal"}


@app.get("/compare")
def compare(text: str):
    results = {}
    for ctx in CONTEXT_DATA.keys():
        model = MODELS[ctx]
        words = clean_text(text).split()
        if not words:
            results[ctx] = []
            continue
        candidates = Counter()
        if len(words) >= 2:
            key = (words[-2], words[-1])
            if key in model:
                candidates.update(model[key])
        key = words[-1]
        if key in model:
            candidates.update(model[key])
        results[ctx] = [w for w, _ in candidates.most_common(3)]
    return {"text": text, "context_predictions": results}

@app.post("/check-warning")
async def check_warning(req: WarningRequest, request: Request):
    check_rate_limit(request.client.host)
    req.text = sanitize(req.text)
    if not req.text.strip():
        return {"warning": False, "message": None, "suggestion": None}
    context_label = CONTEXT_LABELS.get(req.context, req.context)
    system_prompt = "Sen bir Türkçe yazışma asistanısın. SADECE geçerli JSON döndür. Markdown, açıklama veya ```json bloğu kullanma."
    user_content = f'Kullanıcı "{context_label}" bağlamında şunu yazıyor: "{req.text}"\n\nDeğerlendir: Hoca/İş bağlamında resmiyet gerekir, argo/samimi ifadeler uyarı gerektirir. Arkadaş bağlamında aşırı resmiyet bilgi olarak belirtilir. Spor/Gündelik bağlamında uyarı gerekmez.\n\nJSON: {{"warning": true, "message": "kısa Türkçe uyarı", "suggestion": "alternatif öneri"}} veya {{"warning": false, "message": null, "suggestion": null}}'

    raw = None
    if claude_client:
        try:
            response = claude_client.messages.create(
                model=CLAUDE_MODEL, max_tokens=150, temperature=0.3,
                system=system_prompt,
                messages=[{"role": "user", "content": user_content}],
            )
            raw = "".join(b.text for b in response.content if hasattr(b, "text")).strip()
        except Exception as e:
            print(f"Claude warning fallback: {e}")

    if raw is None:
        try:
            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile", max_tokens=150, temperature=0.3,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
            )
            raw = response.choices[0].message.content.strip()
        except Exception as e:
            print(f"Warning check error: {e}")
            return {"warning": False, "message": None, "suggestion": None}

    try:
        raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()
        result = json.loads(raw)
        return {
            "warning": bool(result.get("warning", False)),
            "message": result.get("message"),
            "suggestion": result.get("suggestion")
        }
    except Exception as e:
        print(f"Warning JSON parse error: {e}")
        return {"warning": False, "message": None, "suggestion": None}

@app.post("/suggest-sentence")
async def suggest_sentence(req: SentenceRequest, request: Request):
    check_rate_limit(request.client.host)
    req.text = sanitize(req.text)
    if not req.text.strip():
        return {"suggestion": None}
    context_label = CONTEXT_LABELS.get(req.context, req.context)
    system_prompt = (
        "Sen bir Türkçe yazışma asistanısın. Kullanıcı bir mesaj yazmaya başladı ama "
        "bitirmedi. Görevin SADECE mesajın EKSİK KALAN DEVAMINI üretmek.\n\n"
        "KRİTİK KURAL: Kullanıcının şu ana kadar yazdığı kısmı TEKRAR YAZMA, ondan ASLA "
        "bahsetme — SADECE ondan sonra gelecek kelimeleri/devamı üret. Cevabın doğrudan "
        "kullanıcının metninin ardına eklenecek.\n\n"
        "KRİTİK KURAL — resmiyet/hitap: hoca ve iş bağlamlarında MUTLAKA resmi 'siz' hitabı "
        "kullan ('sen' KULLANMA). Çekim eklerinde de bu resmiyet yansımalı: '-din/-dın' değil "
        "'-diniz/-dınız'; '-misin' değil '-misiniz'; '-eceksin' değil '-eceksiniz'. "
        "Örnekler — hoca/iş bağlamında DOĞRU: 'gönderdiniz mi', 'yapabilir misiniz', "
        "'gelecek misiniz', 'okudunuz mu'. YANLIŞ (asla kullanma): 'gönderdin mi', "
        "'yapabilir misin', 'gelecek misin', 'okudun mu'. "
        "arkadaş, spor ve gündelik bağlamlarında ise samimi 'sen' hitabı uygundur.\n\n"
        "Bağlam tarzı: arkadas=samimi/argo/kanka, hoca=saygılı/resmi/siz hitabı/hocam/sayın, "
        "is=profesyonel/resmi/siz hitabı, spor=enerjik/maç, gundelik=rahat/günlük.\n\n"
        "Türkçe'nin eklemeli yapısına (ünlü uyumu, hal/çekim ekleri) dikkat ederek, "
        "kullanıcının son kelimesinden dilbilgisel açıdan akıcı şekilde devam et.\n\n"
        "KURALLAR: (1) SADECE eksik devamı yaz, (2) tırnak işareti kullanma, (3) açıklama "
        "veya ön söz ekleme, (4) tek bir devam yaz, seçenek sunma, (5) kullanıcının "
        "yazdığı kelimeleri tekrarlama."
    )
    formality_reminder = (
        " (UNUTMA: bu bağlamda kesinlikle resmi 'siz' hitabı kullan, 'sen' kullanma)"
        if req.context in ("hoca", "is") else ""
    )
    user_content = f'Bağlam: {context_label}\nYarım mesaj: "{req.text}"\n\nBu mesajın SADECE eksik devamı (kullanıcının yazdığını tekrar etme){formality_reminder}:'

    raw = None
    if claude_client:
        try:
            response = claude_client.messages.create(
                model=CLAUDE_MODEL, max_tokens=60, temperature=0.6,
                system=system_prompt,
                messages=[{"role": "user", "content": user_content}],
            )
            raw = "".join(b.text for b in response.content if hasattr(b, "text")).strip()
        except Exception as e:
            print(f"Claude sentence fallback: {e}")

    if raw is None:
        try:
            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile", max_tokens=60, temperature=0.6,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
            )
            raw = response.choices[0].message.content.strip()
        except Exception as e:
            print(f"Sentence suggestion error: {e}")
            return {"suggestion": None}

    continuation = raw.strip('"\'""''').strip()
    continuation = re.sub(
        r"^(İşte|iste|Devam[ıi]?:|Tamamlanmış mesaj:|Mesaj:|Eksik devam[ıi]?:)\s*",
        "", continuation, flags=re.IGNORECASE
    ).strip()

    # Guvenlik agi: model talimati gormezden gelip kullanicinin yazdigini tekrar
    # ederse (veya tamamen farkli bir cumleyle baslarsa), o kismi ayikla — boylece
    # kullanicinin orijinal metni HER ZAMAN degismeden korunur.
    base = req.text.strip()
    if continuation.lower().startswith(base.lower()):
        continuation = continuation[len(base):].strip()
    if not continuation:
        return {"suggestion": None}

    needs_space = not req.text.endswith((" ", "\n")) and not continuation[0] in ",.!?;:"
    full = req.text + (" " if needs_space else "") + continuation
    return {"suggestion": full}