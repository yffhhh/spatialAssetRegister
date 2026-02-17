import cors from "cors";
import express from "express";
import { issueToken, validateCredentials, verifyToken } from "./auth";
import { seedAssets } from "./data";
import type { Asset, QaIssue } from "./types";

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json());

let assets: Asset[] = seedAssets.map((asset) => ({ ...asset }));

function authenticate(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    res.status(401).json({ message: "Missing token" });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ message: "Invalid token" });
    return;
  }
  (req as express.Request & { user?: { username: string; role: "admin" | "user" } }).user = payload;
  next();
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const role = (req as express.Request & { user?: { role: "admin" | "user" } }).user?.role;
  if (role !== "admin") {
    res.status(403).json({ message: "Admin role required" });
    return;
  }
  next();
}

function filterAssets(query: Record<string, string | undefined>): Asset[] {
  const search = (query.search ?? "").toLowerCase();
  const regions = (query.region ?? "").toLowerCase().split(",").filter(Boolean);
  const types = (query.type ?? "").toLowerCase().split(",").filter(Boolean);
  const statuses = (query.status ?? "").toLowerCase().split(",").filter(Boolean);

  return assets.filter((asset) => {
    const nameMatch = !search || asset.name.toLowerCase().includes(search);
    const regionMatch = regions.length === 0 || regions.includes(asset.region.toLowerCase());
    const typeMatch = types.length === 0 || types.includes(asset.type.toLowerCase());
    const statusMatch = statuses.length === 0 || statuses.includes(asset.status.toLowerCase());
    return nameMatch && regionMatch && typeMatch && statusMatch;
  });
}

function runQaChecks(records: Asset[]): QaIssue[] {
  const issues: QaIssue[] = [];
  const pointBuckets = new Map<string, string[]>();

  records.forEach((asset) => {
    if (asset.latitude === null || asset.longitude === null) {
      issues.push({
        code: "MISSING_COORDINATES",
        assetId: asset.id,
        message: "Latitude/Longitude is missing."
      });
    } else {
      const key = `${asset.latitude},${asset.longitude}`;
      const list = pointBuckets.get(key) ?? [];
      list.push(asset.id);
      pointBuckets.set(key, list);
    }

    if (!asset.name || !asset.region || !asset.type || !asset.status) {
      issues.push({
        code: "MISSING_FIELDS",
        assetId: asset.id,
        message: "One or more required fields are empty."
      });
    }
  });

  pointBuckets.forEach((ids) => {
    if (ids.length > 1) {
      ids.forEach((id) => {
        issues.push({
          code: "DUPLICATE_POINT",
          assetId: id,
          message: `Shares coordinates with assets: ${ids.filter((x) => x !== id).join(", ")}.`
        });
      });
    }
  });

  return issues;
}

function toCsv(records: Asset[]): string {
  const headers = ["id", "name", "region", "type", "status", "latitude", "longitude", "createdAt", "updatedAt"];
  const rows = records.map((asset) =>
    [
      asset.id,
      asset.name,
      asset.region,
      asset.type,
      asset.status,
      asset.latitude ?? "",
      asset.longitude ?? "",
      asset.createdAt,
      asset.updatedAt
    ]
      .map((field) => `"${String(field).replaceAll("\"", "\"\"")}"`)
      .join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

function generateUniqueAssetId(records: Asset[]): string {
  const existingIds = new Set(records.map((asset) => asset.id));
  for (let attempts = 0; attempts < 10000; attempts += 1) {
    const candidate = `A-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }
  throw new Error("Failed to generate unique asset ID");
}

app.get("/api/assets", (req, res) => {
  const records = filterAssets(req.query as Record<string, string>);
  res.json(records);
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ message: "username and password are required" });
    return;
  }

  const account = await validateCredentials(username, password);
  if (!account) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const token = issueToken(account.username, account.role);
  res.json({ token, username: account.username, displayName: account.displayName, role: account.role });
});

app.post("/api/assets", authenticate, requireAdmin, (req, res) => {
  const payload = req.body as Omit<Asset, "id" | "createdAt" | "updatedAt">;
  const id = generateUniqueAssetId(assets);
  const now = new Date().toISOString();
  const record: Asset = { ...payload, id, createdAt: now, updatedAt: now };
  assets.unshift(record);
  res.status(201).json(record);
});

app.put("/api/assets/:id", authenticate, requireAdmin, (req, res) => {
  const { id } = req.params;
  const index = assets.findIndex((asset) => asset.id === id);
  if (index === -1) {
    res.status(404).json({ message: "Asset not found" });
    return;
  }
  assets[index] = {
    ...assets[index],
    ...req.body,
    id: assets[index].id,
    createdAt: assets[index].createdAt,
    updatedAt: new Date().toISOString()
  };
  res.json(assets[index]);
});

app.delete("/api/assets/:id", authenticate, requireAdmin, (req, res) => {
  const { id } = req.params;
  const index = assets.findIndex((asset) => asset.id === id);
  if (index === -1) {
    res.status(404).json({ message: "Asset not found" });
    return;
  }
  assets.splice(index, 1);
  res.status(204).send();
});

app.post("/api/assets/reset", authenticate, requireAdmin, (_, res) => {
  assets = seedAssets.map((asset) => ({ ...asset }));
  res.status(200).json({ message: "Working asset dataset reset to seed copy." });
});

app.get("/api/assets/qa", (_, res) => {
  res.json(runQaChecks(assets));
});

app.get("/api/assets/export/csv", (req, res) => {
  const csv = toCsv(filterAssets(req.query as Record<string, string>));
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=assets.csv");
  res.send(csv);
});

app.get("/api/assets/export/geojson", (req, res) => {
  const records = filterAssets(req.query as Record<string, string>);
  const geojson = {
    type: "FeatureCollection",
    features: records
      .filter((asset) => asset.latitude !== null && asset.longitude !== null)
      .map((asset) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [asset.longitude, asset.latitude]
        },
        properties: {
          id: asset.id,
          name: asset.name,
          region: asset.region,
          type: asset.type,
          status: asset.status,
          createdAt: asset.createdAt,
          updatedAt: asset.updatedAt
        }
      }))
  };
  res.setHeader("Content-Type", "application/geo+json");
  res.setHeader("Content-Disposition", "attachment; filename=assets.geojson");
  res.send(JSON.stringify(geojson, null, 2));
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Spatial Asset Register API running at http://localhost:${port}`);
});
