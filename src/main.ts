import "./style.css";
import type L from "leaflet";
import { BINS, binIndexOf } from "./bins";
import { createDistanceLayers, createMap, createPlaceLayer, type DistanceLayers } from "./map";
import { renderBinFilters, renderRanking } from "./panel";
import type { MedicalFacility, MedicalKind, NearestPair, Pharmacy, Place } from "./types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function loadJson<T>(path: string): Promise<T> {
  // BASE_URL を付けて、GitHub Pages のサブパスでも読めるようにする
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!res.ok) throw new Error(`${path} を読み込めませんでした（${res.status}）`);
  return res.json() as Promise<T>;
}

const KIND_LABEL = { hospital: "病院", clinic: "診療所" } as const;

const toPlace = (f: { name: string; lat: number; lng: number }, detail: string): Place => ({
  name: f.name,
  detail,
  lat: f.lat,
  lng: f.lng,
});

/** タブ1つ分の表示（薬局→医療機関 または 医療機関→薬局） */
interface View {
  tab: HTMLButtonElement;
  binsTitle: string;
  othersLabel: string;
  lineNote: string;
  rankingTitle: string;
  pairs: NearestPair[];
  layers: DistanceLayers;
  /** 相手側の施設（灰色の点） */
  others: L.LayerGroup;
  /** 距離区分ごとの表示状態 */
  visible: boolean[];
}

async function main() {
  const map = createMap($("map"));
  const [pharmacies, medical] = await Promise.all([
    loadJson<Pharmacy[]>("data/pharmacies.json"),
    loadJson<MedicalFacility[]>("data/medical.json"),
  ]);

  // どちらの向きも最寄りと距離はデータ作成時に計算済み（近い順に並んでいる）
  const medicalDetail = (f: { kind: MedicalKind; address: string }) => `${KIND_LABEL[f.kind]}　${f.address}`;
  const pharmacyPairs: NearestPair[] = pharmacies.map((p) => ({
    ...toPlace(p, p.address),
    distanceM: p.distanceM,
    nearest: toPlace(p.nearest, medicalDetail(p.nearest)),
  }));
  const medicalPairs: NearestPair[] = medical.map((f) => ({
    ...toPlace(f, medicalDetail(f)),
    distanceM: f.distanceM,
    nearest: toPlace(f.nearest, f.nearest.address),
  }));
  const pharmacyPlaces: Place[] = pharmacyPairs.map(({ name, detail, lat, lng }) => ({ name, detail, lat, lng }));
  const medicalPlaces: Place[] = medicalPairs.map(({ name, detail, lat, lng }) => ({ name, detail, lat, lng }));

  const views: View[] = [
    {
      tab: $("tab-pharmacy"),
      binsTitle: "表示する距離（薬局から最寄りの病院・診療所まで）",
      othersLabel: "病院・診療所の位置（灰色）",
      lineNote: "チェックを入れると、各薬局から最寄りの病院・診療所（白抜きの丸）への直線も表示します。",
      rankingTitle: "病院・診療所から遠い薬局 TOP15",
      pairs: pharmacyPairs,
      layers: createDistanceLayers(map, pharmacyPairs),
      others: createPlaceLayer(medicalPlaces),
      visible: BINS.map((b) => b.visible),
    },
    {
      tab: $("tab-medical"),
      binsTitle: "表示する距離（病院・診療所から最寄りの薬局まで）",
      othersLabel: "薬局の位置（灰色）",
      lineNote:
        "チェックを入れると、各病院・診療所から最寄りの薬局（白抜きの丸）への直線も表示します。",
      rankingTitle: "薬局から遠い病院・診療所 TOP15",
      pairs: medicalPairs,
      layers: createDistanceLayers(map, medicalPairs),
      others: createPlaceLayer(pharmacyPlaces),
      visible: BINS.map((b) => b.visible),
    },
  ];

  let current = views[0];
  let othersVisible = false;
  const othersToggle = $<HTMLInputElement>("others-toggle");

  // 近い区分から順に追加し直すことで、遠い区分が常に上に描かれるようにする
  // 最寄りへの直線は相手側の施設（灰色）を表示しているときだけ描く
  const redraw = () => {
    for (const v of views) {
      v.layers.groups.forEach((g) => g.remove());
      v.layers.lineGroups.forEach((g) => g.remove());
      v.others.remove();
    }
    const { layers, visible, others } = current;
    if (othersVisible) others.addTo(map);
    layers.groups.forEach((g, i) => {
      if (!visible[i]) return;
      if (othersVisible) layers.lineGroups[i].addTo(map);
      g.addTo(map);
    });
  };

  const setOthersVisible = (v: boolean) => {
    othersToggle.checked = v;
    othersVisible = v;
    redraw();
  };
  othersToggle.addEventListener("change", () => setOthersVisible(othersToggle.checked));

  const show = (view: View) => {
    current = view;
    for (const v of views) v.tab.setAttribute("aria-selected", String(v === view));
    $("bins-title").textContent = view.binsTitle;
    $("others-label").textContent = view.othersLabel;
    $("line-note").textContent = view.lineNote;
    $("ranking-title").textContent = view.rankingTitle;
    map.closePopup();

    const setBinVisible = renderBinFilters($("bins"), view.pairs, view.visible, (i, v) => {
      view.visible[i] = v;
      redraw();
    });
    renderRanking($("ranking"), view.pairs, (p) => {
      setOthersVisible(true);
      const binIndex = binIndexOf(p.distanceM);
      if (!view.visible[binIndex]) setBinVisible(binIndex, true);
      map.flyToBounds(
        [
          [p.lat, p.lng],
          [p.nearest.lat, p.nearest.lng],
        ],
        { padding: [60, 60], maxZoom: 17 },
      );
      map.once("moveend", () => view.layers.markerOf(p)?.openPopup());
    });
    redraw();
  };

  for (const v of views) v.tab.addEventListener("click", () => show(v));
  show(current);
}

main().catch((e: unknown) => {
  const msg = document.createElement("p");
  msg.className = "error";
  msg.textContent = e instanceof Error ? e.message : "データを読み込めませんでした。";
  $("side").prepend(msg);
});
