"""薬局ごとに最寄りの病院・診療所、病院・診療所ごとに最寄りの薬局までの直線距離を計算し、
地図用のJSONを出力する。

入力（厚生労働省「医療情報ネットのオープンデータ」）:
  01-1_hospital_facility_info_YYYYMMDD.csv  病院（施設票）
  02-1_clinic_facility_info_YYYYMMDD.csv    診療所（施設票）
  05_pharmacy_YYYYMMDD.csv                  薬局
補助データ:
  Geolonia 住所データ latest.csv（座標が欠けている施設を住所から補完するため）
  https://github.com/geolonia/japanese-addresses

使い方:
  pip install pandas numpy scikit-learn
  python scripts/prepare_data.py --src ./raw --geo ./raw/latest.csv --pref 東京都 --out public/data
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.neighbors import BallTree

EARTH_RADIUS_KM = 6371.0
LAT_RANGE = (20, 46)
LNG_RANGE = (122, 154)

# 一般の人が受診する施設ではないもの（老人ホームの医務室など）は最寄り候補から外す
EXCLUDE_KEYWORDS = (
    "医務室|老人ホーム|健康相談室|健康管理室|保健所|社会福祉法人|診療室|保健室"
    "|老人保健施設|保健センター|園診療所|苑診療所"
)

# ---------------------------------------------------------------- 住所 → 座標
KANJI_DIGITS = "〇一二三四五六七八九"


def to_kanji_number(n: int) -> str:
    if n >= 100:
        return str(n)
    if n < 10:
        return KANJI_DIGITS[n]
    tens, ones = divmod(n, 10)
    return (KANJI_DIGITS[tens] if tens > 1 else "") + "十" + (KANJI_DIGITS[ones] if ones else "")


def normalize(address: str) -> str:
    s = unicodedata.normalize("NFKC", str(address)).replace(" ", "")
    s = s.replace("ヶ", "ケ").replace("ヵ", "ケ").replace("之", "の").replace("ノ", "の")
    for unit in ("丁目", "条", "線"):
        s = re.sub(rf"(\d+){unit}", lambda m: to_kanji_number(int(m.group(1))) + unit, s)
    return s


class Geocoder:
    """Geolonia 住所データを使い、町丁目単位（だめなら市区町村単位）で座標を返す。"""

    def __init__(self, path: Path):
        g = pd.read_csv(path, dtype=str)
        g["lat"] = g["緯度"].astype(float)
        g["lng"] = g["経度"].astype(float)
        g["town"] = g["大字町丁目名"].fillna("").map(normalize).str.replace(r"^(大字|字)", "", regex=True)
        g["city"] = (g["都道府県名"] + g["市区町村名"]).map(normalize)
        self.towns: dict[str, tuple[list[tuple[str, float, float]], float, float]] = {}
        for city, grp in g.groupby("city"):
            rows = sorted(zip(grp.town, grp.lat, grp.lng), key=lambda t: -len(t[0]))
            self.towns[city] = (rows, grp.lat.mean(), grp.lng.mean())
        self.cities_by_pref: dict[str, list[str]] = {}
        for city in sorted(self.towns, key=len, reverse=True):
            pref = re.match(r"^(.+?[都道府県])", city).group(1)
            self.cities_by_pref.setdefault(pref, []).append(city)

    def __call__(self, address: str) -> tuple[float, float, str]:
        s = normalize(address)
        m = re.match(r"^(.+?[都道府県])", s)
        if not m:
            return np.nan, np.nan, "none"
        candidates = self.cities_by_pref.get(m.group(1), [])
        city = next((c for c in candidates if s.startswith(c)), None)
        if city is None:  # 住所に郡名が書かれていないケース
            for c in candidates:
                without_gun = re.sub(r"^(.+?[都道府県])(.+?郡)(.+)$", r"\1\3", c)
                if without_gun != c and s.startswith(without_gun):
                    city, s = c, c + s[len(without_gun):]
                    break
        if city is None:
            return np.nan, np.nan, "none"
        rest = re.sub(r"^(大字|字)", "", s[len(city):])
        rows, city_lat, city_lng = self.towns[city]
        for town, lat, lng in rows:
            if town and (rest.startswith(town) or rest.replace("字", "").startswith(town)):
                return lat, lng, "town"
        return city_lat, city_lng, "city"


# ---------------------------------------------------------------- 読み込み
def haversine_km(lat1, lng1, lat2, lng2):
    lat1, lng1, lat2, lng2 = map(np.radians, (lat1, lng1, lat2, lng2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lng2 - lng1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(a))


def load(path: Path, name_col: str, kind: str, geocode: Geocoder) -> pd.DataFrame:
    df = pd.read_csv(path, usecols=[name_col, "所在地", "所在地座標（緯度）", "所在地座標（経度）"], dtype=str)
    df = df.rename(columns={name_col: "name", "所在地": "address"})
    lat0 = pd.to_numeric(df["所在地座標（緯度）"], errors="coerce")
    lng0 = pd.to_numeric(df["所在地座標（経度）"], errors="coerce")
    geo = df["address"].map(geocode)
    glat = np.array([g[0] for g in geo])
    glng = np.array([g[1] for g in geo])
    precision = np.array([g[2] for g in geo])

    valid = lat0.between(*LAT_RANGE) & lng0.between(*LNG_RANGE)
    gap = haversine_km(lat0, lng0, glat, glng)
    # 元の座標が欠けている、または住所から求めた位置と大きくずれている場合は住所側を採用
    threshold = np.where(precision == "town", 5, 30)
    use_geocoded = (~valid | (gap > threshold)) & ~np.isnan(glat)
    df["lat"] = np.where(use_geocoded, glat, lat0)
    df["lng"] = np.where(use_geocoded, glng, lng0)
    df["source"] = np.where(use_geocoded, np.where(valid, "corrected", "geocoded"), "original")
    df["kind"] = kind
    print(f"{kind}: {len(df):,}件 ", df["source"].value_counts().to_dict())
    return df.dropna(subset=["lat", "lng"]).reset_index(drop=True)


def find(src: Path, prefix: str) -> Path:
    files = sorted(src.glob(f"{prefix}*.csv"))
    if not files:
        raise SystemExit(f"{src} に {prefix}*.csv が見つかりません")
    return files[-1]


def place(r) -> dict:
    out = {"name": r["name"], "address": r["address"]}
    if r["kind"] != "pharmacy":
        out["kind"] = r["kind"]
    return out | {"lat": round(r["lat"], 5), "lng": round(r["lng"], 5)}


def nearest_records(sources: pd.DataFrame, targets: pd.DataFrame) -> list[dict]:
    """sources の各施設について targets の中の最寄りと直線距離を求め、近い順に並べて返す。"""
    tree = BallTree(np.radians(targets[["lat", "lng"]].values), metric="haversine")
    dist, idx = tree.query(np.radians(sources[["lat", "lng"]].values), k=1)
    distance_m = np.round(dist[:, 0] * EARTH_RADIUS_KM * 1000).astype(int)
    records = [
        place(s) | {"distanceM": int(d), "nearest": place(targets.iloc[i])}
        for (_, s), d, i in zip(sources.iterrows(), distance_m, idx[:, 0])
    ]
    records.sort(key=lambda r: r["distanceM"])
    return records


# ---------------------------------------------------------------- メイン
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, required=True, help="医療情報ネットのCSVを置いたフォルダ")
    ap.add_argument("--geo", type=Path, required=True, help="Geolonia 住所データ latest.csv")
    ap.add_argument("--pref", default="東京都", help="対象の都道府県（全国なら空文字）")
    ap.add_argument("--out", type=Path, default=Path("public/data"))
    args = ap.parse_args()

    geocode = Geocoder(args.geo)
    hospitals = load(find(args.src, "01-1_hospital_facility_info"), "正式名称", "hospital", geocode)
    clinics = load(find(args.src, "02-1_clinic_facility_info"), "正式名称", "clinic", geocode)
    pharmacies = load(find(args.src, "05_pharmacy"), "名称", "pharmacy", geocode)

    medical = pd.concat([hospitals, clinics], ignore_index=True)
    medical = medical[~medical["name"].str.contains(EXCLUDE_KEYWORDS, na=False)].reset_index(drop=True)
    in_pref = lambda df: df if not args.pref else df[df["address"].str.startswith(args.pref)].reset_index(drop=True)

    # 最寄り探索の相手は都道府県で絞らない（県境の施設が隣県の相手を最寄りにできるように）
    pharmacy_records = nearest_records(in_pref(pharmacies), medical)
    medical_records = nearest_records(in_pref(medical), pharmacies)

    args.out.mkdir(parents=True, exist_ok=True)
    for name, records in (("pharmacies.json", pharmacy_records), ("medical.json", medical_records)):
        (args.out / name).write_text(json.dumps(records, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"薬局 {len(pharmacy_records):,}件 / 医療機関 {len(medical_records):,}件 を {args.out} に出力")
    for label, records in (("薬局→医療機関", pharmacy_records), ("医療機関→薬局", medical_records)):
        d = pd.Series([r["distanceM"] for r in records])
        print(f"{label}: 距離の中央値 {int(d.median())}m / 最大 {int(d.max())}m")

if __name__ == "__main__":
    main()