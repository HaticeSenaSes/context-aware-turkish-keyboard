from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from collections import defaultdict, Counter
import re
import json
import os

app = FastAPI(title="Context-Aware Turkish Word Prediction API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# LOAD DATA
# ─────────────────────────────────────────────
def load_data():
    json_path = os.path.join(os.path.dirname(__file__), "..", "data", "context_data.json")
    if os.path.exists(json_path):
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)
    # Fallback default data
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
        ],
    }

# ─────────────────────────────────────────────
# TRAIN MODELS
# ─────────────────────────────────────────────
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

# ─────────────────────────────────────────────
# API ENDPOINTS
# ─────────────────────────────────────────────
class PredictRequest(BaseModel):
    text: str
    context: str
    n_suggestions: int = 3

@app.get("/")
def root():
    return {"message": "Context-Aware Turkish Word Prediction API is running"}

@app.get("/contexts")
def list_contexts():
    return {"contexts": {ctx: len(sentences) for ctx, sentences in CONTEXT_DATA.items()}}

@app.post("/predict")
def predict(req: PredictRequest):
    if req.context not in MODELS:
        return {"suggestions": [], "error": f"Unknown context: {req.context}"}

    model = MODELS[req.context]
    words = clean_text(req.text).split()

    if not words:
        return {"suggestions": []}

    candidates = Counter()

    if len(words) >= 2:
        key = (words[-2], words[-1])
        if key in model:
            candidates.update(model[key])

    key = words[-1]
    if key in model:
        candidates.update(model[key])

    suggestions = [w for w, _ in candidates.most_common(req.n_suggestions)]
    return {"suggestions": suggestions, "context": req.context, "text": req.text}

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