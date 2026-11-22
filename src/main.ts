import "./style.css";
import { BINS, binIndexOf } from "./bins";
import { createMap, createMedicalLayer, createPharmacyLayers } from "./map";
import { renderBinFilters, renderRanking } from "./panel";
import type { MedicalFacility, Pharmacy } from "./types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function loadJson<T>(path: string): Promise<T> {
  // BASE_URL を付けて、GitHub Pages のサブパスでも読めるようにする
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!res.ok) throw new Error(`${path} を読み込めませんでした（${res.status}）`);
  return res.json() as Promise<T>;
}

async function main() {
  const map = createMap($("map"));
  const [pharmacies, medical] = await Promise.all([
    loadJson<Pharmacy[]>("data/pharmacies.json"),
    loadJson<MedicalFacility[]>("data/medical.json"),
  ]);

  const { groups, markerOf } = createPharmacyLayers(map, pharmacies);
  const medicalLayer = createMedicalLayer(medical);

  // 近い区分から順に追加し直すことで、遠い区分が常に上に描かれるようにする
  const visible = BINS.map((b) => b.visible);
  const redraw = () => {
    groups.forEach((g) => g.remove());
    groups.forEach((g, i) => visible[i] && g.addTo(map));
  };
  const setBinVisible = renderBinFilters($("bins"), pharmacies, (i, v) => {
    visible[i] = v;
    redraw();
  });
  redraw();

  const medicalToggle = $<HTMLInputElement>("medical-toggle");
  const setMedicalVisible = (v: boolean) => {
    medicalToggle.checked = v;
    if (v) medicalLayer.addTo(map);
    else medicalLayer.remove();
  };
  medicalToggle.addEventListener("change", () => setMedicalVisible(medicalToggle.checked));

  renderRanking($("ranking"), pharmacies, (p) => {
    setMedicalVisible(true);
    const binIndex = binIndexOf(p.distanceM);
    if (!visible[binIndex]) setBinVisible(binIndex, true);
    map.flyToBounds(
      [
        [p.lat, p.lng],
        [p.nearest.lat, p.nearest.lng],
      ],
      { padding: [60, 60], maxZoom: 17 },
    );
    map.once("moveend", () => markerOf(p)?.openPopup());
  });
}

main().catch((e: unknown) => {
  const msg = document.createElement("p");
  msg.className = "error";
  msg.textContent = e instanceof Error ? e.message : "データを読み込めませんでした。";
  $("side").prepend(msg);
});
