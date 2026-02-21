import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import {
  Box,
  Checkbox,
  FormControl,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  TextField,
} from "@mui/material";
import {
  createAsset,
  deleteAsset,
  exportCsv,
  exportGeoJson,
  getAssets,
  getQaIssues,
  login,
  resetAssetsData,
  setAuthToken,
  updateAsset,
} from "./api";
import type { AuthSession } from "./api";
import type { Asset, AssetFilters, QaIssue } from "./types";

const defaultFilters: AssetFilters = {
  search: "",
  region: [],
  type: [],
  status: [],
};

const emptyAsset: Omit<Asset, "id" | "createdAt" | "updatedAt"> = {
  name: "",
  region: "",
  type: "",
  status: "Active",
  latitude: -32.9283,
  longitude: 151.7817,
};

type SortKey =
  | "name"
  | "region"
  | "type"
  | "status"
  | "latitude"
  | "longitude"
  | "createdAt"
  | "updatedAt";
type QaFilter =
  | "ALL"
  | "MISSING_COORDINATES"
  | "DUPLICATE_POINT"
  | "MISSING_FIELDS"
  | "NO_ERRORS";

function UserIcon() {
  return (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" fill="currentColor" />
      <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="currentColor" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 17.25V20h2.75L17.8 8.95l-2.75-2.75L4 17.25z"
        fill="currentColor"
      />
      <path
        d="M19.71 7.04a1 1 0 0 0 0-1.41L18.37 4.3a1 1 0 0 0-1.41 0l-1.13 1.13 2.75 2.75 1.13-1.14z"
        fill="currentColor"
      />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 7h12l-1 13H7L6 7zm3-3h6l1 2H8l1-2z" fill="currentColor" />
    </svg>
  );
}

function BadgeIcon() {
  return (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="2" fill="currentColor" />
      <rect x="7" y="7" width="10" height="2" fill="#fff" />
      <rect x="7" y="11" width="6" height="2" fill="#fff" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M10 4H5v16h5v-2H7V6h3V4zm4 4l-1.41 1.41L14.17 11H9v2h5.17l-1.58 1.59L14 16l4-4-4-4z"
        fill="currentColor"
      />
    </svg>
  );
}

function qaClassName(code: QaIssue["code"]): string {
  if (code === "MISSING_COORDINATES") return "qa-badge qa-missing-coordinates";
  if (code === "DUPLICATE_POINT") return "qa-badge qa-duplicate-point";
  return "qa-badge qa-missing-fields";
}

function StatusDot({
  color,
  strokeWidth = 2,
}: {
  color: string;
  strokeWidth?: number;
}) {
  return (
    <svg className="status-dot" viewBox="0 0 12 12" aria-hidden="true">
      <circle
        cx="6"
        cy="6"
        r="4.5"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}

function statusColor(status: Asset["status"]): string {
  if (status === "Active") return "#0a7";
  if (status === "Planned") return "#f39c12";
  return "#95a5a6";
}

export default function App() {
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loginUsername, setLoginUsername] = useState("admin");
  const [loginPassword, setLoginPassword] = useState("adminPassword");
  const [authError, setAuthError] = useState("");

  const [assets, setAssets] = useState<Asset[]>([]);
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [filters, setFilters] = useState<AssetFilters>(defaultFilters);
  const [qaIssues, setQaIssues] = useState<QaIssue[]>([]);
  const [form, setForm] = useState(emptyAsset);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [qaRan, setQaRan] = useState(false);
  const [qaFilter, setQaFilter] = useState<QaFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const isAdmin = session?.role === "admin";
  const roleDescription = isAdmin
    ? "Manage, update, quality-check and export Crown land style spatial records."
    : "View, search and export Crown land style spatial records (read-only access).";

  const regions = useMemo(
    () => [...new Set(allAssets.map((a) => a.region))],
    [allAssets],
  );
  const types = useMemo(
    () => [...new Set(allAssets.map((a) => a.type))],
    [allAssets],
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
    if (!qaRan || qaFilter === "ALL") return sortedAssets;
    return sortedAssets.filter((asset) => {
      const codes = qaByAssetId.get(asset.id) ?? [];
      if (qaFilter === "NO_ERRORS") return codes.length === 0;
      return codes.includes(qaFilter);
    });
  }, [qaByAssetId, qaFilter, qaRan, sortedAssets]);

  useEffect(() => {
    const raw = localStorage.getItem("spatial-auth");
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as AuthSession;
      setSession(saved);
      setAuthToken(saved.token);
    } catch {
      localStorage.removeItem("spatial-auth");
    }
  }, []);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!accountMenuRef.current || !target) return;
      if (!accountMenuRef.current.contains(target)) {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  async function loadAssets() {
    setLoading(true);
    setError("");
    try {
      const [data, full] = await Promise.all([
        getAssets(filters),
        getAssets(defaultFilters),
      ]);
      setAssets(data);
      setAllAssets(full);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session) return;
    loadAssets();
  }, [filters.search, filters.region, filters.type, filters.status, session]);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setAuthError("");
    try {
      const nextSession = await login(loginUsername, loginPassword);
      setAuthToken(nextSession.token);
      setSession(nextSession);
      setAccountMenuOpen(false);
      localStorage.setItem("spatial-auth", JSON.stringify(nextSession));
    } catch (e) {
      setAuthError((e as Error).message);
    }
  }

  function handleLogout() {
    setSession(null);
    setAccountMenuOpen(false);
    setAuthToken("");
    localStorage.removeItem("spatial-auth");
    setAssets([]);
    setQaIssues([]);
    setQaRan(false);
  }

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
    if (!isAdmin) return;
    const confirmed = window.confirm(
      "Reset all working data to the original seed copy?",
    );
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

  function renderMultiValue(values: string[], fallback: string): string {
    return values.length > 0 ? values.join(", ") : fallback;
  }

  const hasActiveFilters =
    filters.search.trim().length > 0 ||
    filters.region.length > 0 ||
    filters.type.length > 0 ||
    filters.status.length > 0;

  async function submitForm(event: React.FormEvent) {
    event.preventDefault();
    if (!isAdmin) return;
    const isCreate = editingId === null;
    if (editingId) {
      await updateAsset(editingId, form);
    } else {
      await createAsset(form);
    }
    clearForm();
    await loadAssets();
    if (isCreate && qaRan) await runQa();
  }

  async function removeAsset(asset: Asset) {
    if (!isAdmin) return;
    const confirmed = window.confirm(
      `Delete asset ${asset.id} (${asset.name || "Unnamed"})?`,
    );
    if (!confirmed) return;
    await deleteAsset(asset.id);
    if (editingId === asset.id) clearForm();
    await loadAssets();
    if (qaRan) await runQa();
  }

  if (!session) {
    return (
      <div className="layout login-layout">
        <section className="login-shell">
          <aside className="login-brand">
            <p className="eyebrow">Spatial Asset Register</p>
            <h2>Secure Access Portal</h2>
            <p>
              Sign in to view map data and asset records. Permissions are based
              on your assigned role.
            </p>
            <ul>
              <li>Admin: full edit access</li>
              <li>User: read-only access</li>
            </ul>
          </aside>
          <section className="panel login-panel">
            <h2>Sign In</h2>
            <p className="login-subtitle">Enter credentials to continue.</p>
            <form className="login-form" onSubmit={handleLogin}>
              <label>
                Username
                <input
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="Enter username"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter password"
                />
              </label>
              <div className="actions">
                <button type="submit" className="primary-btn">
                  Sign In
                </button>
              </div>
            </form>
            {authError ? <p className="error">{authError}</p> : null}
            <div className="login-help">
              <p>
                <strong>Demo accounts</strong>
              </p>
              <div className="demo-grid">
                <button
                  type="button"
                  className="demo-card"
                  onClick={() => {
                    setLoginUsername("admin");
                    setLoginPassword("adminPassword");
                  }}
                >
                  <span className="demo-role">
                    <BadgeIcon /> Admin
                  </span>
                  <small className="demo-creds">admin / adminPassword</small>
                </button>
                <button
                  type="button"
                  className="demo-card"
                  onClick={() => {
                    setLoginUsername("user");
                    setLoginPassword("userPassword");
                  }}
                >
                  <span className="demo-role">
                    <UserIcon /> User
                  </span>
                  <small className="demo-creds">user / userPassword</small>
                </button>
              </div>
            </div>
          </section>
        </section>
      </div>
    );
  }

  return (
    <div className="layout">
      <header>
        <div className="header-top">
          <div>
            <h1>Spatial Asset Register Lite</h1>
            <p>{roleDescription}</p>
          </div>
          <div className="header-user">
            <div className="account-menu" ref={accountMenuRef}>
              <button
                type="button"
                className="user-pill user-pill-btn"
                onClick={() => setAccountMenuOpen((v) => !v)}
                aria-expanded={accountMenuOpen}
                aria-haspopup="menu"
              >
                <span className="user-icon" aria-hidden="true">
                  <UserIcon />
                </span>
                {session.displayName} ({session.role})
              </button>
              {accountMenuOpen ? (
                <div className="account-dropdown" role="menu">
                  {/* <button
                    type="button"
                    className="account-item"
                    role="menuitem"
                  >
                    <span className="account-item-icon" aria-hidden="true">
                      <BadgeIcon />
                    </span>
                    View account
                  </button> */}
                  <button
                    type="button"
                    className="account-item"
                    role="menuitem"
                    onClick={handleLogout}
                  >
                    <span className="account-item-icon" aria-hidden="true">
                      <LogoutIcon />
                    </span>
                    Logout
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <section className="panel">
        <h2>Search / Filter</h2>
        <Box
          className="grid filter-grid"
          sx={{ "& .MuiInputBase-root": { backgroundColor: "#fff" } }}
        >
          <TextField
            label="Search by name"
            size="small"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
          <FormControl size="small">
            <Select
              multiple
              value={filters.region}
              displayEmpty
              input={<OutlinedInput />}
              renderValue={(value) =>
                renderMultiValue(value as string[], "All regions")
              }
              inputProps={{ "aria-label": "Region" }}
              onChange={(e) => {
                const value = e.target.value;
                setFilters({
                  ...filters,
                  region: typeof value === "string" ? value.split(",") : value,
                });
              }}
            >
              {regions.map((region) => (
                <MenuItem key={region} value={region}>
                  <Checkbox checked={filters.region.includes(region)} />
                  <ListItemText primary={region} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small">
            <Select
              multiple
              value={filters.type}
              displayEmpty
              input={<OutlinedInput />}
              renderValue={(value) =>
                renderMultiValue(value as string[], "All types")
              }
              inputProps={{ "aria-label": "Type" }}
              onChange={(e) => {
                const value = e.target.value;
                setFilters({
                  ...filters,
                  type: typeof value === "string" ? value.split(",") : value,
                });
              }}
            >
              {types.map((type) => (
                <MenuItem key={type} value={type}>
                  <Checkbox checked={filters.type.includes(type)} />
                  <ListItemText primary={type} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small">
            <Select
              multiple
              value={filters.status}
              displayEmpty
              input={<OutlinedInput />}
              renderValue={(value) =>
                renderMultiValue(value as string[], "All status")
              }
              inputProps={{ "aria-label": "Status" }}
              onChange={(e) => {
                const value = e.target.value;
                setFilters({
                  ...filters,
                  status: typeof value === "string" ? value.split(",") : value,
                });
              }}
            >
              <MenuItem value="Active">
                <Checkbox checked={filters.status.includes("Active")} />
                <span className="status-filter-dot">
                  <StatusDot color="#0a7" strokeWidth={2.8} />
                </span>
                Active
              </MenuItem>
              <MenuItem value="Inactive">
                <Checkbox checked={filters.status.includes("Inactive")} />
                <span className="status-filter-dot">
                  <StatusDot color="#95a5a6" strokeWidth={2.8} />
                </span>
                Inactive
              </MenuItem>
              <MenuItem value="Planned">
                <Checkbox checked={filters.status.includes("Planned")} />
                <span className="status-filter-dot">
                  <StatusDot color="#f39c12" strokeWidth={2.8} />
                </span>
                Planned
              </MenuItem>
            </Select>
          </FormControl>
          <button
            type="button"
            className="filter-clear-btn"
            aria-label="Clear"
            title="Clear"
            onClick={() => setFilters({ ...defaultFilters })}
            disabled={!hasActiveFilters}
          >
            Clear
          </button>
        </Box>
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
                  {isAdmin ? (
                    <button
                      type="button"
                      className="icon-btn"
                      data-label="Edit"
                      aria-label={`Edit ${asset.id}`}
                      onClick={() => startEdit(asset)}
                    >
                      <EditIcon />
                    </button>
                  ) : null}
                </Popup>
              </CircleMarker>
            ))}
        </MapContainer>
      </section>

      {isAdmin ? (
        <section className="panel">
          <h2>{editingId ? "Update Asset" : "Add Asset"}</h2>
          <form className="grid add-asset-grid" onSubmit={submitForm}>
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
      ) : null}

      <section className="panel">
        <h2>Data Table</h2>
        {loading ? <p>Loading...</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Asset ID</th>
                <th
                  className="sortable-head"
                  onClick={() => toggleSort("name")}
                >
                  Name{sortLabel("name")}
                </th>
                <th
                  className="sortable-head"
                  onClick={() => toggleSort("region")}
                >
                  Region{sortLabel("region")}
                </th>
                <th
                  className="sortable-head"
                  onClick={() => toggleSort("type")}
                >
                  Type{sortLabel("type")}
                </th>
                <th
                  className="sortable-head"
                  onClick={() => toggleSort("status")}
                >
                  Status{sortLabel("status")}
                </th>
                <th
                  className="sortable-head"
                  onClick={() => toggleSort("latitude")}
                >
                  Latitude{sortLabel("latitude")}
                </th>
                <th
                  className="sortable-head"
                  onClick={() => toggleSort("longitude")}
                >
                  Longitude{sortLabel("longitude")}
                </th>
                {isAdmin ? <th>Action</th> : null}
                {isAdmin && qaRan ? <th>QA Errors</th> : null}
              </tr>
            </thead>
            <tbody>
              {visibleAssets.map((asset) => (
                <tr key={asset.id}>
                  <td>{asset.id}</td>
                  <td>{asset.name}</td>
                  <td>{asset.region}</td>
                  <td>{asset.type}</td>
                  <td>
                    <span className="status-cell">
                      <StatusDot color={statusColor(asset.status)} />
                      {asset.status}
                    </span>
                  </td>
                  <td>{asset.latitude ?? "N/A"}</td>
                  <td>{asset.longitude ?? "N/A"}</td>
                  {isAdmin ? (
                    <td>
                      <div className="icon-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          data-label="Edit"
                          aria-label={`Edit ${asset.id}`}
                          onClick={() => startEdit(asset)}
                        >
                          <EditIcon />
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn-delete"
                          data-label="Delete"
                          aria-label={`Delete ${asset.id}`}
                          onClick={() => removeAsset(asset)}
                        >
                          <DeleteIcon />
                        </button>
                      </div>
                    </td>
                  ) : null}
                  {isAdmin && qaRan ? (
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

      {isAdmin ? (
        <section className="panel">
          <h2>QA + Export</h2>
          <div className="actions">
            {!qaRan ? (
              <button onClick={runQa}>Run QA Checks</button>
            ) : (
              <button onClick={hideQa}>Hide QA Checks</button>
            )}
            <button onClick={() => exportCsv(filters)}>Export CSV</button>
            <button onClick={() => exportGeoJson(filters)}>
              Export GeoJSON
            </button>
            {isAdmin ? (
              <button type="button" onClick={resetDataToSeed}>
                Reset Data
              </button>
            ) : null}
          </div>
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
      ) : null}

      <footer className="footer">
        &copy; 2026 Maggie Huang. All rights reserved.
      </footer>
    </div>
  );
}
