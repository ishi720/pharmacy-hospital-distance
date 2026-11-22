import "./style.css";
import type L from "leaflet";
import { BINS, binIndexOf } from "./bins";
import { createDistanceLayers, createMap, createPlaceLayer, escapeHtml, type DistanceLayers } from "./map";
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

const RANKING_SIZE = 15;

/** 最寄りとして選ばれた施設と、それを最寄りにしている施設（距離を問わず全件） */
interface Hub {
  target: Place;
  sources: NearestPair[];
}

function hubsOf(pairs: NearestPair[]): Hub[] {
  const byTarget = new Map<string, Hub>();
  for (const p of pairs) {
    const { name, lat, lng } = p.nearest;
    const key = `${name}|${lat}|${lng}`;
    const hub = byTarget.get(key);
    if (hub) hub.sources.push(p);
    else byTarget.set(key, { target: p.nearest, sources: [p] });
  }
  return [...byTarget.values()].sort((a, b) => b.sources.length - a.sources.length);
}

type RankingMode = "far" | "hub";

/** タブ1つ分の表示（薬局→医療機関 または 医療機関→薬局） */
interface View {
  tab: HTMLButtonElement;
  binsTitle: string;
  othersLabel: string;
  lineNote: string;
  rankingTitle: Record<RankingMode, string>;
  /** 最寄りにしている側の呼び名（ポップアップ用） */
  sourceLabel: string;
  pairs: NearestPair[];
  hubs: Hub[];
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
      rankingTitle: {
        far: "病院・診療所から遠い薬局 TOP15",
        hub: "病院・診療所に最も近い薬局の件数 TOP15",
      },
      sourceLabel: "薬局",
      pairs: pharmacyPairs,
      hubs: hubsOf(pharmacyPairs),
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
      rankingTitle: {
        far: "薬局から遠い病院・診療所 TOP15",
        hub: "薬局に最も近い病院・診療所の件数 TOP15",
      },
      sourceLabel: "病院・診療所",
      pairs: medicalPairs,
      hubs: hubsOf(medicalPairs),
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

  let rankingMode: RankingMode = "far";
  const rankingTabs: Record<RankingMode, HTMLButtonElement> = { far: $("rank-far"), hub: $("rank-hub") };
  let setBinVisible: (binIndex: number, visible: boolean) => void = () => {};

  const showBin = (distanceM: number) => {
    const i = binIndexOf(distanceM);
    if (!current.visible[i]) setBinVisible(i, true);
  };

  const renderCurrentRanking = () => {
    const view = current;
    for (const [mode, tab] of Object.entries(rankingTabs)) tab.setAttribute("aria-selected", String(mode === rankingMode));
    $("ranking-title").textContent = view.rankingTitle[rankingMode];
    const ranking = $("ranking");

    if (rankingMode === "far") {
      const top = [...view.pairs].sort((a, b) => b.distanceM - a.distanceM).slice(0, RANKING_SIZE);
      renderRanking(
        ranking,
        top,
        (p) => ({ name: p.name, detail: p.detail, value: `${(p.distanceM / 1000).toFixed(2)}km` }),
        (p) => {
          setOthersVisible(true);
          showBin(p.distanceM);
          map.flyToBounds(
            [
              [p.lat, p.lng],
              [p.nearest.lat, p.nearest.lng],
            ],
            { padding: [60, 60], maxZoom: 17 },
          );
          map.once("moveend", () => view.layers.markerOf(p)?.openPopup());
        },
      );
    } else {
      renderRanking(
        ranking,
        view.hubs.slice(0, RANKING_SIZE),
        (h) => ({ name: h.target.name, detail: h.target.detail, value: `${h.sources.length}件` }),
        (h) => {
          setOthersVisible(true);
          for (const p of h.sources) showBin(p.distanceM);
          const { target } = h;
          map.flyToBounds(
            [[target.lat, target.lng], ...h.sources.map((p): [number, number] => [p.lat, p.lng])],
            { padding: [60, 60], maxZoom: 17 },
          );
          map.once("moveend", () =>
            map.openPopup(
              `<b>${escapeHtml(target.name)}</b><br>${escapeHtml(target.detail)}<br>` +
                `ここが最も近い${view.sourceLabel}：<b>${h.sources.length}件</b>`,
              [target.lat, target.lng],
            ),
          );
        },
      );
    }
  };

  for (const [mode, tab] of Object.entries(rankingTabs) as [RankingMode, HTMLButtonElement][]) {
    tab.addEventListener("click", () => {
      rankingMode = mode;
      renderCurrentRanking();
    });
  }

  const show = (view: View) => {
    current = view;
    for (const v of views) v.tab.setAttribute("aria-selected", String(v === view));
    $("bins-title").textContent = view.binsTitle;
    $("others-label").textContent = view.othersLabel;
    $("line-note").textContent = view.lineNote;
    map.closePopup();

    setBinVisible = renderBinFilters($("bins"), view.pairs, view.visible, (i, v) => {
      view.visible[i] = v;
      redraw();
    });
    renderCurrentRanking();
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
