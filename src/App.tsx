import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import {
  createAsset,
  deleteAsset,
  exportCsv,
  exportGeoJson,
  getAssets,
  getQaIssues,
  resetAssetsData,
  updateAsset,
} from "./api";
import type { Asset, AssetFilters, QaIssue } from "./types";

const defaultFilters: AssetFilters = {
  search: "",
  region: "",
  type: "",
  status: "",
};

const emptyAsset: Omit<Asset, "id" | "createdAt" | "updatedAt"> = {
  name: "",
  region: "",
  type: "",
  status: "Active",
  latitude: -32.9283,
  longitude: 151.7817,
};

function qaClassName(code: QaIssue["code"]): string {
  if (code === "MISSING_COORDINATES") return "qa-badge qa-missing-coordinates";
  if (code === "DUPLICATE_POINT") return "qa-badge qa-duplicate-point";
  return "qa-badge qa-missing-fields";
}

type SortKey = "name" | "region" | "type" | "status" | "latitude" | "longitude" | "createdAt" | "updatedAt";
type QaFilter = "ALL" | "MISSING_COORDINATES" | "DUPLICATE_POINT" | "MISSING_FIELDS" | "NO_ERRORS";

export default function App() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [filters, setFilters] = useState<AssetFilters>(defaultFilters);
  const [qaIssues, setQaIssues] = useState<QaIssue[]>([]);
  const [form, setForm] = useState(emptyAsset);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [qaRan, setQaRan] = useState(false);
  const [qaFilter, setQaFilter] = useState<QaFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const regions = useMemo(
    () => [...new Set(assets.map((a) => a.region))],
    [assets],
  );
  const types = useMemo(
    () => [...new Set(assets.map((a) => a.type))],
    [assets],
  );
  const qaByAssetId = useMemo(() => {
    const grouped = new Map<string, string[]>();
    qaIssues.forEach((issue) => {
      const list = grouped.get(issue.assetId) ?? [];
      list.push(issue.code);
      grouped.set(issue.assetId, list);
    });
    return grouped;
  }, [qaIssues]);
  const sortedAssets = useMemo(() => {
    const list = [...assets];
    list.sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];

      if (typeof aValue === "number" || aValue === null) {
        const left = aValue ?? Number.NEGATIVE_INFINITY;
        const right = (bValue as number | null) ?? Number.NEGATIVE_INFINITY;
        return sortDirection === "asc" ? left - right : right - left;
      }

      const left = String(aValue).toLowerCase();
      const right = String(bValue).toLowerCase();
      if (left < right) return sortDirection === "asc" ? -1 : 1;
      if (left > right) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [assets, sortDirection, sortKey]);
  const visibleAssets = useMemo(() => {
    if (!qaRan || qaFilter === "ALL") {
      return sortedAssets;
    }

    return sortedAssets.filter((asset) => {
      const codes = qaByAssetId.get(asset.id) ?? [];
      if (qaFilter === "NO_ERRORS") {
        return codes.length === 0;
      }
      return codes.includes(qaFilter);
    });
  }, [qaByAssetId, qaFilter, qaRan, sortedAssets]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  }

  function sortLabel(key: SortKey): string {
    if (sortKey !== key) return "";
    return sortDirection === "asc" ? " ↑" : " ↓";
  }

  async function loadAssets() {
    setLoading(true);
    setError("");
    try {
      const data = await getAssets(filters);
      setAssets(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssets();
  }, [filters.search, filters.region, filters.type, filters.status]);

  async function runQa() {
    const issues = await getQaIssues();
    setQaIssues(issues);
    setQaRan(true);
  }

  function hideQa() {
    setQaRan(false);
    setQaFilter("ALL");
  }

  function resetView() {
    setFilters({ ...defaultFilters });
    setQaIssues([]);
    setQaRan(false);
    setQaFilter("ALL");
    setError("");
  }

  async function resetDataToSeed() {
    const confirmed = window.confirm("Reset all working data to the original seed copy?");
    if (!confirmed) return;
    await resetAssetsData();
    clearForm();
    resetView();
    await loadAssets();
  }

  function startEdit(asset: Asset) {
    setEditingId(asset.id);
    setForm({
      name: asset.name,
      region: asset.region,
      type: asset.type,
      status: asset.status,
      latitude: asset.latitude,
      longitude: asset.longitude,
    });
  }

  function clearForm() {
    setEditingId(null);
    setForm(emptyAsset);
  }

  async function submitForm(event: React.FormEvent) {
    event.preventDefault();
    const isCreate = editingId === null;
    if (editingId) {
      await updateAsset(editingId, form);
    } else {
      await createAsset(form);
    }
    clearForm();
    await loadAssets();
    if (isCreate && qaRan) {
      await runQa();
    }
  }

  async function removeAsset(asset: Asset) {
    const confirmed = window.confirm(
      `Delete asset ${asset.id} (${asset.name || "Unnamed"})?`,
    );
    if (!confirmed) return;
    await deleteAsset(asset.id);
    if (editingId === asset.id) {
      clearForm();
    }
    await loadAssets();
    if (qaRan) {
      await runQa();
    }
  }

  return (
    <div className="layout">
      <header>
        <h1>Spatial Asset Register Lite</h1>
        <p>
          Map, edit, quality-check and export Crown land style spatial records.
        </p>
      </header>

      <section className="panel">
        <h2>Search / Filter</h2>
        <div className="grid">
          <input
            placeholder="Search by name"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
          <select
            value={filters.region}
            onChange={(e) => setFilters({ ...filters, region: e.target.value })}
          >
            <option value="">All regions</option>
            {regions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
          <select
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          >
            <option value="">All asset types</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">All status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="Planned">Planned</option>
          </select>
        </div>
      </section>

      <section className="map-panel">
        <MapContainer
          center={[-32.92, 151.77]}
          zoom={10}
          scrollWheelZoom
          className="map"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {assets
            .filter(
              (asset) => asset.latitude !== null && asset.longitude !== null,
            )
            .map((asset) => (
              <CircleMarker
                key={asset.id}
                center={[asset.latitude as number, asset.longitude as number]}
                radius={8}
                pathOptions={{
                  color:
                    asset.status === "Active"
                      ? "#0a7"
                      : asset.status === "Planned"
                        ? "#f39c12"
                        : "#95a5a6",
                }}
              >
                <Popup>
                  <strong>{asset.name}</strong>
                  <br />
                  {asset.type} | {asset.region}
                  <br />
                  Status: {asset.status}
                  <br />
                  <button
                    type="button"
                    className="icon-btn"
                    data-label="Edit"
                    aria-label={`Edit ${asset.id}`}
                    onClick={() => startEdit(asset)}
                  >
                    ✎
                  </button>
                </Popup>
              </CircleMarker>
            ))}
        </MapContainer>
      </section>

      <section className="panel">
        <h2>{editingId ? "Update Asset" : "Add Asset"}</h2>
        <form className="grid" onSubmit={submitForm}>
          <input
            required
            value={form.name}
            placeholder="Asset name"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            required
            value={form.region}
            placeholder="Region"
            onChange={(e) => setForm({ ...form, region: e.target.value })}
          />
          <input
            required
            value={form.type}
            placeholder="Type"
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          />
          <select
            value={form.status}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value as Asset["status"] })
            }
          >
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="Planned">Planned</option>
          </select>
          <input
            type="number"
            placeholder="Latitude"
            value={form.latitude ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                latitude: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
          <input
            type="number"
            placeholder="Longitude"
            value={form.longitude ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                longitude: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
          <div className="actions">
            <button type="submit">{editingId ? "Update" : "Create"}</button>
            <button type="button" onClick={clearForm}>
              Clear
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Data Table</h2>
        {loading ? <p>Loading...</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th className="sortable-head" onClick={() => toggleSort("name")}>Name{sortLabel("name")}</th>
              <th className="sortable-head" onClick={() => toggleSort("region")}>Region{sortLabel("region")}</th>
              <th className="sortable-head" onClick={() => toggleSort("type")}>Type{sortLabel("type")}</th>
              <th className="sortable-head" onClick={() => toggleSort("status")}>Status{sortLabel("status")}</th>
              <th className="sortable-head" onClick={() => toggleSort("latitude")}>Latitude{sortLabel("latitude")}</th>
              <th className="sortable-head" onClick={() => toggleSort("longitude")}>Longitude{sortLabel("longitude")}</th>
              <th className="sortable-head" onClick={() => toggleSort("createdAt")}>Created At{sortLabel("createdAt")}</th>
              <th className="sortable-head" onClick={() => toggleSort("updatedAt")}>Updated At{sortLabel("updatedAt")}</th>
              <th>Action</th>
              {qaRan ? <th>QA Errors</th> : null}
            </tr>
          </thead>
          <tbody>
            {visibleAssets.map((asset) => (
              <tr key={asset.id}>
                <td>{asset.name}</td>
                <td>{asset.region}</td>
                <td>{asset.type}</td>
                <td>{asset.status}</td>
                <td>{asset.latitude ?? "N/A"}</td>
                <td>{asset.longitude ?? "N/A"}</td>
                <td>{new Date(asset.createdAt).toLocaleString()}</td>
                <td>{new Date(asset.updatedAt).toLocaleString()}</td>
                <td>
                  <div className="icon-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      data-label="Edit"
                      aria-label={`Edit ${asset.id}`}
                      onClick={() => startEdit(asset)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn-delete"
                      data-label="Delete"
                      aria-label={`Delete ${asset.id}`}
                      onClick={() => removeAsset(asset)}
                    >
                      🗑
                    </button>
                  </div>
                </td>
                {qaRan ? (
                  <td>
                    {(qaByAssetId.get(asset.id) ?? []).length === 0 ? (
                      <span className="qa-badge qa-none">None</span>
                    ) : (
                      (qaByAssetId.get(asset.id) ?? []).map((code) => (
                        <span
                          key={`${asset.id}-${code}`}
                          className={qaClassName(code as QaIssue["code"])}
                        >
                          {code}
                        </span>
                      ))
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section className="panel">
        <h2>QA + Export</h2>
        <div className="actions">
          {!qaRan ? (
            <button onClick={runQa}>Run QA Checks</button>
          ) : (
            <button onClick={hideQa}>Hide QA Checks</button>
          )}
          <button onClick={() => exportCsv(filters)}>Export CSV</button>
          <button onClick={() => exportGeoJson(filters)}>Export GeoJSON</button>
          <button type="button" onClick={resetView}>
            Reset
          </button>
          <button type="button" onClick={resetDataToSeed}>
            Reset Data
          </button>
        </div>
        {qaRan ? (
          <div className="qa-filter-row">
            <label htmlFor="qa-filter">QA Error Filter</label>
            <select
              id="qa-filter"
              value={qaFilter}
              onChange={(e) => setQaFilter(e.target.value as QaFilter)}
            >
              <option value="ALL">All assets</option>
              <option value="MISSING_COORDINATES">Missing coordinates</option>
              <option value="DUPLICATE_POINT">Duplicate point</option>
              <option value="MISSING_FIELDS">Missing fields</option>
              <option value="NO_ERRORS">No errors only</option>
            </select>
          </div>
        ) : null}
        {qaRan ? (
          <ul className="qa-list">
            {qaIssues.map((issue) => (
              <li key={`${issue.assetId}-${issue.code}`}>
                [{issue.code}] {issue.assetId}: {issue.message}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <footer className="footer">
        &copy; 2026 Maggie Huang. All rights reserved.
      </footer>
    </div>
  );
}
