export type MedicalKind = "hospital" | "clinic";

interface Facility {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

/** pharmacies.json の1件：薬局と、最寄りの病院・診療所 */
export interface Pharmacy extends Facility {
  /** 最寄りの病院・診療所までの直線距離（m） */
  distanceM: number;
  nearest: Facility & { kind: MedicalKind };
}

/** medical.json の1件：病院・診療所と、最寄りの薬局 */
export interface MedicalFacility extends Facility {
  kind: MedicalKind;
  /** 最寄りの薬局までの直線距離（m） */
  distanceM: number;
  nearest: Facility;
}

/** 地図とランキングに出す施設（detail は住所などの補足） */
export interface Place {
  name: string;
  detail: string;
  lat: number;
  lng: number;
}

/** ある施設と、その最寄りの相手（薬局→医療機関、または医療機関→薬局） */
export interface NearestPair extends Place {
  /** 最寄りの相手までの直線距離（m） */
  distanceM: number;
  nearest: Place;
}
