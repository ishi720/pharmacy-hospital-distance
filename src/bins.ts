export interface DistanceBin {
  /** この値（m）未満がこの区分 */
  max: number;
  label: string;
  color: string;
  /** 最初から表示するか */
  visible: boolean;
  /** ズーム12のときの点の半径（px） */
  radius: number;
  /** 最寄りへの線を引くか（50m未満は短すぎて見えない） */
  drawLine: boolean;
}

export const BINS: DistanceBin[] = [
  { max: 50, label: "50m未満", color: "#8fb8b3", visible: false, radius: 2, drawLine: false },
  { max: 100, label: "50〜100m", color: "#3a9e92", visible: false, radius: 2.5, drawLine: true },
  { max: 200, label: "100〜200m", color: "#e3a21a", visible: true, radius: 3.5, drawLine: true },
  { max: 500, label: "200〜500m", color: "#e0561b", visible: true, radius: 5, drawLine: true },
  { max: Infinity, label: "500m以上", color: "#b0122d", visible: true, radius: 7, drawLine: true },
];

export const binIndexOf = (distanceM: number): number => BINS.findIndex((b) => distanceM < b.max);

/** 遠い区分ほど目立たせる（200m以上は太い実線＋白フチ） */
export const isProminent = (binIndex: number): boolean => binIndex >= 3;
