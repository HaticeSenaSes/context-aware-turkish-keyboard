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

load_dotenv()

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

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
print("✅ All models ready")

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

@app.post("/predict")
async def predict(req: PredictRequest, request: Request):
    check_rate_limit(request.client.host)
    req.text = sanitize(req.text)
    if not req.text:
        return {"suggestions": [], "source": "empty"}
    try:
        context_label = CONTEXT_LABELS.get(req.context, req.context)
        gecmis = ""
        if req.history:
            gecmis = "Önceki mesajlar:\n" + "\n".join(req.history[-5:]) + "\n\n"
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=30,
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"Sen bir Türkçe akıllı klavye öneri sistemisin. "
                        f"Aktif bağlam: {context_label}. "
                        f"Bağlam tarzı: arkadas=samimi/argo/kanka/nbr/ya, hoca=saygılı/resmi/hocam/sayın/teşekkür, is=profesyonel/toplantı/rapor, spor=enerjik/maç/antrenman, gundelik=rahat/tamam/olur. "
                        f"{'Önceki mesajlar: ' + ' | '.join(req.history[-3:]) + '. Bu bağlamı dikkate al. ' if req.history else ''}"
                        f"{'Kullanıcının sık kullandığı özel kelimeler (mümkünse bunları öner): ' + ', '.join(req.personal_words) + '. ' if req.personal_words else ''}"
                        f"Görevin: Kullanıcının yazmakta olduğu cümlenin devamına gelebilecek EN ALAKALI 3 Türkçe kelimeyi tahmin et. "
                        f"Kural: SADECE 3 kelime, virgülle ayır, başka HİÇBİR şey yazma. "
                        f"Örnek: tarihi,bitişi,teslimi"
                    )
                },
                {
                    "role": "user",
                    "content": f'{"Konuşma geçmişi: " + " | ".join(req.history[-3:]) + chr(10) if req.history else ""}Şu an yazılan: "{req.text}" — devamına gelebilecek 3 kelime:"'
                }
            ]
        )
        raw = response.choices[0].message.content.strip()
        # Açıklama varsa sadece virgüllü kısmı al
        for line in raw.split("\n"):
            if "," in line:
                raw = line
                break
        parts = raw.split(",")
        suggestions = []
        for p in parts:
            clean = re.sub(r"^[\d\.\-\)\s]+", "", p.strip())
            clean = re.sub(r"[^\w\s]", "", clean).strip()
            if clean and len(clean) > 1:
                suggestions.append(clean.lower())
        suggestions = list(dict.fromkeys(suggestions))[:3]
        if len(suggestions) < 2:
            raise ValueError("Yetersiz öneri")
        return {"suggestions": suggestions, "context": req.context, "source": "groq"}
    except Exception as e:
        print(f"Groq fallback: {e}")
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
        return {"suggestions": [w for w, _ in candidates.most_common(3)], "source": "ngram_personal"}

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
    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=150,
            messages=[
                {
                    "role": "system",
                    "content": "Sen bir Türkçe yazışma asistanısın. SADECE geçerli JSON döndür. Markdown, açıklama veya ```json bloğu kullanma."
                },
                {
                    "role": "user",
                    "content": f'Kullanıcı "{context_label}" bağlamında şunu yazıyor: "{req.text}"\n\nDeğerlendir: Hoca/İş bağlamında resmiyet gerekir, argo/samimi ifadeler uyarı gerektirir. Arkadaş bağlamında aşırı resmiyet bilgi olarak belirtilir. Spor/Gündelik bağlamında uyarı gerekmez.\n\nJSON: {{"warning": true, "message": "kısa Türkçe uyarı", "suggestion": "alternatif öneri"}} veya {{"warning": false, "message": null, "suggestion": null}}'
                }
            ]
        )
        raw = response.choices[0].message.content.strip()
        raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()
        result = json.loads(raw)
        return {
            "warning": bool(result.get("warning", False)),
            "message": result.get("message"),
            "suggestion": result.get("suggestion")
        }
    except Exception as e:
        print(f"Warning check error: {e}")
        return {"warning": False, "message": None, "suggestion": None}

@app.post("/suggest-sentence")
async def suggest_sentence(req: SentenceRequest, request: Request):
    check_rate_limit(request.client.host)
    req.text = sanitize(req.text)
    context_label = CONTEXT_LABELS.get(req.context, req.context)
    try:
        response = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            max_tokens=150,
            messages=[{
                "role": "user",
                "content": f'Sen bir Türkçe yazışma asistanısın. Kullanıcı "{context_label}" baglaminda su mesaji yaziyor: "{req.text}"\n\nBu mesaji tamamla veya daha iyi bir versiyonunu yaz. SADECE tamamlanmis mesaji ver, baska hicbir sey yazma. Bağlama uygun ol.'
            }]
        )
        return {"suggestion": response.choices[0].message.content.strip()}
    except Exception as e:
        print(f"Sentence suggestion error: {e}")
        return {"suggestion": None}# Bu satırları main.py'ın en üstündeki import bloğuna taşı
