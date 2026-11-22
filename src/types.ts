export type MedicalKind = "hospital" | "clinic";

export interface MedicalFacility {
  name: string;
  kind: MedicalKind;
  lat: number;
  lng: number;
}

export interface Pharmacy {
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** 最寄りの病院・診療所までの直線距離（m） */
  distanceM: number;
  nearest: MedicalFacility & { address: string };
}
