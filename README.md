# Spatial Asset Register Lite

This is a personal project for building and testing a lightweight spatial asset register workflow.

## Live Demo

- App URL: `https://spatialassetregister.onrender.com/`

## Delivered Scope

- Map display with basemap, asset point layer, and pop-up details
- Search and filters by name, region, asset type, and status
- Simple edit workflow (create or update asset records through API)
- Data QA checks:
  - missing coordinates
  - duplicate point locations
  - missing required fields
- Export data as CSV and GeoJSON
- User documentation and training guide

## Tech Stack

- Frontend: React + TypeScript + Leaflet (`react-leaflet`)
- API: Node.js + Express + TypeScript
- Data: MongoDB (`assets` collection) with seed reset support

## Run Locally

```bash
npm install
npm run dev
```

Development URLs:

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000`

Production-style local run (single service):

```bash
npm install
npm run build
npm run start
```

- App: `http://localhost:4000`
- API: `http://localhost:4000/api/*`

## Render Deployment (Single Web Service)

- Build Command: `npm install && npm run build`
- Start Command: `npm run start`
- Root Directory: leave empty (repo root)
- Service URL serves both:
  - frontend at `/`
  - API at `/api/*`

## Environment Variables

- `MONGODB_URI`: MongoDB connection string
- `MONGODB_DB_NAME`: Database name
- `JWT_SECRET`: JWT signing secret
- `PORT`: Optional local/server port (Render sets this automatically)

See `.env.example` for a template.

## API Endpoints

- `GET /api/assets`
- `POST /api/assets`
- `PUT /api/assets/:id`
- `GET /api/assets/qa`
- `GET /api/assets/export/csv`
- `GET /api/assets/export/geojson`

## Data Persistence Notes

- Asset CRUD operations are persisted to MongoDB.
- On server startup, if the `assets` collection is empty, seed records from `server/data.ts` are inserted.
- `Reset Dataset` clears current records and reloads seed records from `server/data.ts`.

## Demo Checklist

- Open map and verify points load.
- Filter by `region = Hunter`, `status = Active`.
- Edit one asset and confirm table/map refresh.
- Run QA checks and verify issue list renders.
- Export CSV and GeoJSON with active filters.
