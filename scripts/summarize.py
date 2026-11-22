"""prepare_data.py が出力した pharmacies.json から、距離の分布と遠い薬局を集計する。

使い方:
  python scripts/summarize.py public/data/pharmacies.json
"""
import sys

import pandas as pd

BINS = [0, 50, 100, 200, 500, 1000, float("inf")]
LABELS = ["50m未満", "50〜100m", "100〜200m", "200〜500m", "500m〜1km", "1km以上"]


def main(path: str) -> None:
    df = pd.read_json(path)

    df["区分"] = pd.cut(df["distanceM"], bins=BINS, labels=LABELS, right=False)
    summary = df["区分"].value_counts(sort=False).to_frame("薬局数")
    summary["割合"] = (summary["薬局数"] / len(df) * 100).round(1)
    print(summary)

    print(f"\n中央値: {df['distanceM'].median():.0f}m")

    top = df.nlargest(5, "distanceM")[["name", "address", "distanceM"]]
    print(top.to_string(index=False))


if __name__ == "__main__":
    main(sys.argv[1])
