from datasets import load_dataset
import json, re

def clean(text):
    return re.sub(r'\s+', ' ', str(text).strip())

def is_turkish(text):
    return any(c in 'çğıöşüÇĞİÖŞÜ' for c in text)

def is_informal(text):
    words = ['lan', 'moruk', 'kanka', 'abi', 'ya ', 'hadi', 'naber',
             'bence', 'yani', 'zaten', 'falan', 'canım', 'kardeşim',
             'dostum', 'vay', 'hay', 'of', 'ah', 'oğlum', 'kız']
    return any(w in text.lower() for w in words)

arkadas_new = []
hoca_new = []

# 1. Dene: tatoeba
print("1️⃣ Tatoeba deneniyor...")
try:
    ds = load_dataset("Helsinki-NLP/tatoeba_mt", "eng-tur", split="test", streaming=False)
    for item in ds:
        tr = clean(item.get('targetString', ''))
        if not tr or len(tr) < 8 or len(tr) > 150 or not is_turkish(tr):
            continue
        if is_informal(tr) and len(arkadas_new) < 1000:
            arkadas_new.append(tr)
        elif len(hoca_new) < 500:
            hoca_new.append(tr)
    print(f"   ✅ arkadas={len(arkadas_new)}, hoca={len(hoca_new)}")
except Exception as e:
    print(f"   ❌ {e}")

# 2. Dene: wikimedia/wikipedia TR
if len(arkadas_new) < 300:
    print("2️⃣ OPUS100 deneniyor...")
    try:
        ds = load_dataset("Helsinki-NLP/opus-100", "en-tr", split="train", streaming=True)
        count = 0
        for item in ds:
            if count > 50000: break
            count += 1
            tr = clean(item.get('translation', {}).get('tr', ''))
            if not tr or len(tr) < 8 or len(tr) > 150 or not is_turkish(tr):
                continue
            if is_informal(tr) and len(arkadas_new) < 1000:
                arkadas_new.append(tr)
            elif len(hoca_new) < 500:
                hoca_new.append(tr)
            if len(arkadas_new) >= 1000 and len(hoca_new) >= 500:
                break
        print(f"   ✅ arkadas={len(arkadas_new)}, hoca={len(hoca_new)}")
    except Exception as e:
        print(f"   ❌ {e}")

# 3. Dene: ccaligned
if len(arkadas_new) < 300:
    print("3️⃣ CCAligned deneniyor...")
    try:
        ds = load_dataset("ccaligned_multilingual", "en_XX-tr_TR", split="train", streaming=True)
        count = 0
        for item in ds:
            if count > 50000: break
            count += 1
            tr = clean(item.get('translation', {}).get('tr_TR', ''))
            if not tr or len(tr) < 8 or len(tr) > 150 or not is_turkish(tr):
                continue
            if is_informal(tr) and len(arkadas_new) < 1000:
                arkadas_new.append(tr)
            elif len(hoca_new) < 500:
                hoca_new.append(tr)
            if len(arkadas_new) >= 1000 and len(hoca_new) >= 500:
                break
        print(f"   ✅ arkadas={len(arkadas_new)}, hoca={len(hoca_new)}")
    except Exception as e:
        print(f"   ❌ {e}")

print(f"\nSonuç: arkadas={len(arkadas_new)}, hoca={len(hoca_new)}")

output_path = "/Users/senases/Desktop/context-aware-turkish-keyboard/data/context_data.json"
with open(output_path, "r", encoding="utf-8") as f:
    data = json.load(f)

if arkadas_new:
    data["arkadas"] = list(set(data["arkadas"] + arkadas_new))
if hoca_new:
    data["hoca"] = list(set(data["hoca"] + hoca_new))

with open(output_path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("\nFinal:")
for k, v in data.items():
    print(f"  {k}: {len(v)} cümle")
