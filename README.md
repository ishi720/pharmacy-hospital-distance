# pharmacy-hospital-distance

東京の薬局と最寄りの病院・診療所の距離を地図で見るツールです。

東京都の薬局（6,755件）から最寄りの病院・診療所まで、また病院・診療所（12,707件）から最寄りの薬局までの直線距離を計算し、地図上に表示します。右のタブで向きを切り替えます。

- 距離の区分ごとに色分けし、遠い施設ほど大きく表示
- 相手側の施設（灰色）を表示すると、最寄りへの線も表示
- 「遠い施設」「最寄りとして選ばれた件数」の TOP15 から、その場所へ移動
- 背景は地理院タイル（淡色地図・標準地図・航空写真）

## 構成

```
├─ index.html
├─ public/data/          地図で読み込むデータ（scripts/prepare_data.py で生成）
│   ├─ pharmacies.json   薬局と最寄り医療機関・距離
│   └─ medical.json      病院・診療所と最寄り薬局・距離
├─ scripts/
│   ├─ prepare_data.py   元データ → JSON の変換と距離計算
│   └─ summarize.py      距離の分布と遠い薬局の集計
└─ src/
    ├─ main.ts           データ読み込みと画面の組み立て
    ├─ map.ts            Leaflet の地図・点・線
    ├─ panel.ts          距離フィルターとランキング
    ├─ bins.ts           距離区分（色・半径・初期表示）
    ├─ types.ts          データの型
    └─ style.css
```

## 動かし方

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ に出力
```

## データを作り直す

1. 厚生労働省「医療情報ネットのオープンデータ」から次の3ファイルをダウンロードし、`raw/` に置く
   - 病院（施設票） `01-1_hospital_facility_info_*.csv`
   - 診療所（施設票） `02-1_clinic_facility_info_*.csv`
   - 薬局 `05_pharmacy_*.csv`
2. [Geolonia 住所データ](https://github.com/geolonia/japanese-addresses) の `latest.csv` を `raw/` に置く
3. 実行

```sh
pip install pandas numpy scikit-learn
npm run data
python3 scripts/summarize.py public/data/pharmacies.json
```

`--pref` を変えると他の都道府県、空文字にすると全国で作れます（`scripts/prepare_data.py --help`）。

### 計算方法

- 距離は緯度経度からの直線距離（ハバーサイン公式）。最寄り探索は scikit-learn の `BallTree` を使用
- 元データの座標が欠けている施設、または住所から求めた位置と大きくずれている施設は、住所から町丁目単位で座標を補完
- 老人ホームの医務室など、一般の人が受診しない施設は最寄りの候補から除外
- 最寄りの相手は都道府県で絞らずに探す（県境の施設が隣県の相手を最寄りにできるように）
- 最寄り探索は都道府県をまたいで行う（県境の薬局のため）

### 注意

- 医療情報ネットのデータには、離島やへき地の公立診療所が掲載されていないケースがあります。全国で計算すると、そうした地域の薬局が見かけ上「遠い」と判定されます
- 住所から補完した座標は町丁目の代表点なので、実際の位置とずれることがあります

## 出典・ライセンス

- 厚生労働省「医療情報ネットのオープンデータ」（2026年6月1日時点）を加工して作成（公共データ利用規約 第1.0版）
- Geolonia 住所データ（CC BY 4.0）を加工して利用
- 背景地図：[地理院タイル](https://maps.gsi.go.jp/development/ichiran.html)
