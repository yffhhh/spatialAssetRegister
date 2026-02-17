import type { Asset, AssetFilters, QaIssue } from "./types";

const API_BASE = "http://localhost:4000/api";
let authToken = "";

export interface AuthSession {
  token: string;
  username: string;
  displayName: string;
  role: "admin" | "user";
}

export function setAuthToken(token: string): void {
  authToken = token;
}

function authHeaders(): HeadersInit {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

export async function login(
  username: string,
  password: string,
): Promise<AuthSession> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new Error("Invalid username or password");
  }
  return response.json() as Promise<AuthSession>;
}

function toQuery(filters: AssetFilters): string {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      if (value.length > 0) query.set(key, value.join(","));
      return;
    }
    if (value.trim()) {
      query.set(key, value.trim());
    }
  });
  return query.toString();
}

export async function getAssets(filters: AssetFilters): Promise<Asset[]> {
  const query = toQuery(filters);
  const response = await fetch(`${API_BASE}/assets${query ? `?${query}` : ""}`);
  if (!response.ok) {
    throw new Error("Failed to load assets");
  }
  return response.json() as Promise<Asset[]>;
}

export async function createAsset(
  payload: Omit<Asset, "id" | "createdAt" | "updatedAt">,
): Promise<Asset> {
  const response = await fetch(`${API_BASE}/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Failed to create asset");
  }
  return response.json() as Promise<Asset>;
}

export async function updateAsset(
  id: string,
  payload: Partial<Asset>,
): Promise<Asset> {
  const response = await fetch(`${API_BASE}/assets/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Failed to update asset");
  }
  return response.json() as Promise<Asset>;
}

export async function deleteAsset(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/assets/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to delete asset");
  }
}

export async function resetAssetsData(): Promise<void> {
  const response = await fetch(`${API_BASE}/assets/reset`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error("Failed to reset asset data");
  }
}

export async function getQaIssues(): Promise<QaIssue[]> {
  const response = await fetch(`${API_BASE}/assets/qa`);
  if (!response.ok) {
    throw new Error("Failed to run QA checks");
  }
  return response.json() as Promise<QaIssue[]>;
}

export async function exportCsv(filters: AssetFilters): Promise<void> {
  const query = toQuery(filters);
  const response = await fetch(
    `${API_BASE}/assets/export/csv${query ? `?${query}` : ""}`,
  );
  if (!response.ok) {
    throw new Error("Failed to export CSV");
  }
  const blob = await response.blob();
  downloadBlob(blob, buildExportFilename("csv"));
}

export async function exportGeoJson(filters: AssetFilters): Promise<void> {
  const query = toQuery(filters);
  const response = await fetch(
    `${API_BASE}/assets/export/geojson${query ? `?${query}` : ""}`,
  );
  if (!response.ok) {
    throw new Error("Failed to export GeoJSON");
  }
  const blob = await response.blob();
  downloadBlob(blob, buildExportFilename("geojson"));
}

function buildExportFilename(ext: "csv" | "geojson"): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `spatial-assets-${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}.${ext}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
