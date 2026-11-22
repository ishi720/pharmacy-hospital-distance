import { BINS, binIndexOf } from "./bins";
import type { NearestPair } from "./types";

/** 距離区分のチェックボックスを描画し、変更されたら onChange を呼ぶ */
export function renderBinFilters(
  container: HTMLElement,
  pairs: NearestPair[],
  visible: readonly boolean[],
  onChange: (binIndex: number, visible: boolean) => void,
): (binIndex: number, visible: boolean) => void {
  const counts = BINS.map(() => 0);
  for (const p of pairs) counts[binIndexOf(p.distanceM)]++;
  container.replaceChildren();

  const inputs = BINS.map((bin, i) => {
    const label = document.createElement("label");
    label.className = "row";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = `bin-${i}`;
    input.checked = visible[i];
    input.addEventListener("change", () => onChange(i, input.checked));
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = bin.color;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = `${counts[i].toLocaleString()}件`;
    label.append(input, swatch, bin.label, count);
    container.append(label);
    return input;
  });

  // 外から（ランキングのクリックなどで）チェック状態を変えるための関数
  return (binIndex, visible) => {
    inputs[binIndex].checked = visible;
    onChange(binIndex, visible);
  };
}

export interface RankItem {
  name: string;
  detail: string;
  /** 右端に出す値（距離や件数） */
  value: string;
}

/** ランキングを描画する（items は並べ替え済み） */
export function renderRanking<T>(
  container: HTMLElement,
  items: T[],
  describe: (item: T) => RankItem,
  onSelect: (item: T) => void,
): void {
  container.replaceChildren();
  items.forEach((item, i) => {
    const { name: title, detail, value } = describe(item);
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = String(i + 1);
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = title;
    const addr = document.createElement("small");
    addr.textContent = detail.replace("東京都", "");
    name.append(addr);
    const val = document.createElement("span");
    val.className = "distance";
    val.textContent = value;
    button.append(rank, name, val);
    button.addEventListener("click", () => onSelect(item));
    li.append(button);
    container.append(li);
  });
}
