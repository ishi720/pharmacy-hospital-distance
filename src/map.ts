import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { BINS, binIndexOf, isProminent } from "./bins";
import type { MedicalFacility, Pharmacy } from "./types";

const GSI_ATTRIBUTION = '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>';
const gsi = (id: string, ext = "png") =>
  L.tileLayer(`https://cyberjapandata.gsi.go.jp/xyz/${id}/{z}/{x}/{y}.${ext}`, {
    maxZoom: 18,
    attribution: GSI_ATTRIBUTION,
  });

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function createMap(el: HTMLElement): L.Map {
  const map = L.map(el, { preferCanvas: true }).setView([35.68, 139.45], 10);
  const pale = gsi("pale").addTo(map);
  L.control
    .layers({ 淡色地図: pale, 標準地図: gsi("std"), 航空写真: gsi("seamlessphoto", "jpg") }, undefined, {
      position: "topright",
    })
    .addTo(map);
  return map;
}

interface PharmacyMarker {
  marker: L.CircleMarker;
  binIndex: number;
}

export interface PharmacyLayers {
  /** 距離区分ごとのレイヤー（BINS と同じ順番） */
  groups: L.LayerGroup[];
  /** 距離区分ごとの「最寄り施設への直線と施設の印」のレイヤー（BINS と同じ順番） */
  lineGroups: L.LayerGroup[];
  /** 薬局から地図上のマーカーを引く */
  markerOf: (p: Pharmacy) => L.CircleMarker | undefined;
}

/** ズームに合わせて点の大きさを変える（広域では小さく、拡大すると大きく） */
const radiusScale = (zoom: number) => Math.max(0.55, Math.min(1.8, (zoom - 8) / 4));

export function createPharmacyLayers(map: L.Map, pharmacies: Pharmacy[]): PharmacyLayers {
  const renderer = L.canvas({ padding: 0.5 });
  const groups = BINS.map(() => L.layerGroup());
  const lineGroups = BINS.map(() => L.layerGroup());
  const markers: PharmacyMarker[] = [];
  const byPharmacy = new Map<Pharmacy, L.CircleMarker>();

  // pharmacies は近い順に並んでいるので、遠い薬局ほど後から描かれて上に重なる
  for (const p of pharmacies) {
    const binIndex = binIndexOf(p.distanceM);
    const bin = BINS[binIndex];
    const group = groups[binIndex];
    const lineGroup = lineGroups[binIndex];
    const prominent = isProminent(binIndex);

    if (bin.drawLine) {
      L.polyline(
        [
          [p.lat, p.lng],
          [p.nearest.lat, p.nearest.lng],
        ],
        {
          renderer,
          color: bin.color,
          weight: prominent ? 2.5 : 1.5,
          opacity: 0.85,
          dashArray: prominent ? undefined : "4 3",
          interactive: false,
        },
      ).addTo(lineGroup);
      L.circleMarker([p.nearest.lat, p.nearest.lng], {
        renderer,
        radius: 3,
        color: bin.color,
        weight: 1.5,
        fillColor: "#fff",
        fillOpacity: 1,
      })
        .bindPopup(`<b>${escapeHtml(p.nearest.name)}</b><br>${escapeHtml(p.nearest.address)}<br>（${escapeHtml(p.name)} の最寄り）`)
        .addTo(lineGroup);
    }

    const marker = L.circleMarker([p.lat, p.lng], {
      renderer,
      radius: bin.radius,
      stroke: prominent,
      color: "#fff",
      weight: 1,
      fillColor: bin.color,
      fillOpacity: binIndex >= 2 ? 0.95 : 0.6,
    })
      .bindPopup(
        `<b>${escapeHtml(p.name)}</b><br>${escapeHtml(p.address)}<br>` +
          `最寄り：${escapeHtml(p.nearest.name)}<br>距離：<b>${p.distanceM.toLocaleString()}m</b>`,
      )
      .addTo(group);
    markers.push({ marker, binIndex });
    byPharmacy.set(p, marker);
  }

  const resize = () => {
    const s = radiusScale(map.getZoom());
    for (const { marker, binIndex } of markers) marker.setRadius(BINS[binIndex].radius * s);
  };
  map.on("zoomend", resize);
  resize();

  return { groups, lineGroups, markerOf: (p) => byPharmacy.get(p) };
}

export function createMedicalLayer(facilities: MedicalFacility[]): L.LayerGroup {
  const renderer = L.canvas({ padding: 0.5 });
  const label = { hospital: "病院", clinic: "診療所" } as const;
  return L.layerGroup(
    facilities.map((f) =>
      L.circleMarker([f.lat, f.lng], {
        renderer,
        radius: 1.8,
        stroke: false,
        fillColor: "#444",
        fillOpacity: 0.5,
      }).bindPopup(`<b>${escapeHtml(f.name)}</b><br>${label[f.kind]}`),
    ),
  );
}
