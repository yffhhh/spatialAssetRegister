export type AssetStatus = "Active" | "Inactive" | "Planned";

export interface Asset {
  id: string;
  name: string;
  region: string;
  type: string;
  status: AssetStatus;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetFilters {
  search: string;
  region: string[];
  type: string[];
  status: string[];
}

export interface QaIssue {
  code: "MISSING_COORDINATES" | "DUPLICATE_POINT" | "MISSING_FIELDS";
  assetId: string;
  message: string;
}
