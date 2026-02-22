import "dotenv/config";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { issueToken, validateCredentials, verifyToken } from "./auth";
import { getDb } from "./db";
import { seedAssets } from "./data";
import type { Asset, QaIssue } from "./types";

const app = express();
const port = Number(process.env.PORT) || 4000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, "../dist");
const indexHtmlPath = path.join(distDir, "index.html");

app.use(cors());
app.use(express.json());

type AssetDocument = Asset & { _id?: unknown };

async function assetsCollection() {
  const db = await getDb();
  return db.collection<AssetDocument>("assets");
}

async function ensureSeedData(): Promise<void> {
  const collection = await assetsCollection();
  const count = await collection.countDocuments();
  if (count === 0) {
    await collection.insertMany(seedAssets.map((asset) => ({ ...asset })));
  }
}

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

function buildMongoFilter(query: Record<string, string | undefined>) {
  const search = (query.search ?? "").toLowerCase();
  const regions = (query.region ?? "").toLowerCase().split(",").filter(Boolean);
  const types = (query.type ?? "").toLowerCase().split(",").filter(Boolean);
  const statuses = (query.status ?? "").toLowerCase().split(",").filter(Boolean);

  const filters: Record<string, unknown>[] = [];
  if (search) filters.push({ name: { $regex: search, $options: "i" } });
  if (regions.length > 0) {
    filters.push({ region: { $in: regions.map((x) => new RegExp(`^${x}$`, "i")) } });
  }
  if (types.length > 0) {
    filters.push({ type: { $in: types.map((x) => new RegExp(`^${x}$`, "i")) } });
  }
  if (statuses.length > 0) {
    filters.push({ status: { $in: statuses.map((x) => new RegExp(`^${x}$`, "i")) } });
  }
  return filters.length > 0 ? { $and: filters } : {};
}

function stripMongoId(doc: AssetDocument): Asset {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, ...asset } = doc;
  return asset;
}

async function filterAssets(query: Record<string, string | undefined>): Promise<Asset[]> {
  const collection = await assetsCollection();
  const docs = await collection.find(buildMongoFilter(query)).toArray();
  return docs.map(stripMongoId);
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

async function generateUniqueAssetId(): Promise<string> {
  const collection = await assetsCollection();
  for (let attempts = 0; attempts < 10000; attempts += 1) {
    const candidate = `A-${Math.floor(1000 + Math.random() * 9000)}`;
    const exists = await collection.findOne({ id: candidate }, { projection: { _id: 1 } });
    if (!exists) {
      return candidate;
    }
  }
  throw new Error("Failed to generate unique asset ID");
}

app.get("/api/assets", async (req, res) => {
  const records = await filterAssets(req.query as Record<string, string>);
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

app.post("/api/assets", authenticate, requireAdmin, async (req, res) => {
  const payload = req.body as Omit<Asset, "id" | "createdAt" | "updatedAt">;
  const id = await generateUniqueAssetId();
  const now = new Date().toISOString();
  const record: Asset = { ...payload, id, createdAt: now, updatedAt: now };
  const collection = await assetsCollection();
  await collection.insertOne(record);
  res.status(201).json(record);
});

app.put("/api/assets/:id", authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const collection = await assetsCollection();
  const existing = await collection.findOne({ id });
  if (!existing) {
    res.status(404).json({ message: "Asset not found" });
    return;
  }
  const updated: Asset = {
    ...stripMongoId(existing),
    ...req.body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString()
  };
  await collection.updateOne({ id }, { $set: updated });
  res.json(updated);
});

app.delete("/api/assets/:id", authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const collection = await assetsCollection();
  const result = await collection.deleteOne({ id });
  if (result.deletedCount === 0) {
    res.status(404).json({ message: "Asset not found" });
    return;
  }
  res.status(204).send();
});

app.post("/api/assets/reset", authenticate, requireAdmin, async (_, res) => {
  const collection = await assetsCollection();
  await collection.deleteMany({});
  await collection.insertMany(seedAssets.map((asset) => ({ ...asset })));
  res.status(200).json({ message: "Working asset dataset reset to seed copy." });
});

app.get("/api/assets/qa", async (_, res) => {
  const collection = await assetsCollection();
  const records = (await collection.find({}).toArray()).map(stripMongoId);
  res.json(runQaChecks(records));
});

app.get("/api/assets/export/csv", async (req, res) => {
  const csv = toCsv(await filterAssets(req.query as Record<string, string>));
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=assets.csv");
  res.send(csv);
});

app.get("/api/assets/export/geojson", async (req, res) => {
  const records = await filterAssets(req.query as Record<string, string>);
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

async function startServer() {
  await ensureSeedData();

  if (fs.existsSync(indexHtmlPath)) {
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(indexHtmlPath);
    });
  }

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Spatial Asset Register running at http://localhost:${port}`);
  });
}

startServer().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server", error);
  process.exit(1);
});
