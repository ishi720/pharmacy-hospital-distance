import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { BINS, binIndexOf, isProminent } from "./bins";
import type { NearestPair, Place } from "./types";

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

interface PairMarker {
  marker: L.CircleMarker;
  binIndex: number;
}

export interface DistanceLayers {
  /** 距離区分ごとのレイヤー（BINS と同じ順番） */
  groups: L.LayerGroup[];
  /** 距離区分ごとの「最寄りへの直線と相手の印」のレイヤー（BINS と同じ順番） */
  lineGroups: L.LayerGroup[];
  /** 施設から地図上のマーカーを引く */
  markerOf: (p: NearestPair) => L.CircleMarker | undefined;
}

/** ズームに合わせて点の大きさを変える（広域では小さく、拡大すると大きく） */
const radiusScale = (zoom: number) => Math.max(0.55, Math.min(1.8, (zoom - 8) / 4));

/** 施設を最寄りまでの距離で色分けし、最寄りへの直線を引く。pairs は近い順に並べておく */
export function createDistanceLayers(map: L.Map, pairs: NearestPair[]): DistanceLayers {
  const renderer = L.canvas({ padding: 0.5 });
  const groups = BINS.map(() => L.layerGroup());
  const lineGroups = BINS.map(() => L.layerGroup());
  const markers: PairMarker[] = [];
  const byPair = new Map<NearestPair, L.CircleMarker>();

  // 近い順に並んでいるので、遠い施設ほど後から描かれて上に重なる
  for (const p of pairs) {
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
        .bindPopup(
          `<b>${escapeHtml(p.nearest.name)}</b><br>${escapeHtml(p.nearest.detail)}<br>（${escapeHtml(p.name)} の最寄り）`,
        )
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
        `<b>${escapeHtml(p.name)}</b><br>${escapeHtml(p.detail)}<br>` +
          `最寄り：${escapeHtml(p.nearest.name)}<br>距離：<b>${p.distanceM.toLocaleString()}m</b>`,
      )
      .addTo(group);
    markers.push({ marker, binIndex });
    byPair.set(p, marker);
  }

  const resize = () => {
    const s = radiusScale(map.getZoom());
    for (const { marker, binIndex } of markers) marker.setRadius(BINS[binIndex].radius * s);
  };
  map.on("zoomend", resize);
  resize();

  return { groups, lineGroups, markerOf: (p) => byPair.get(p) };
}

/** 相手側の施設を灰色の小さな点で表示するレイヤー */
export function createPlaceLayer(places: Place[]): L.LayerGroup {
  const renderer = L.canvas({ padding: 0.5 });
  return L.layerGroup(
    places.map((f) =>
      L.circleMarker([f.lat, f.lng], {
        renderer,
        radius: 1.8,
        stroke: false,
        fillColor: "#444",
        fillOpacity: 0.5,
      }).bindPopup(`<b>${escapeHtml(f.name)}</b><br>${escapeHtml(f.detail)}`),
    ),
  );
}
