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
- Data: In-memory dataset (can be replaced with Cosmos DB)

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

## API Endpoints

- `GET /api/assets`
- `POST /api/assets`
- `PUT /api/assets/:id`
- `GET /api/assets/qa`
- `GET /api/assets/export/csv`
- `GET /api/assets/export/geojson`

## Cosmos DB Adaptation Notes (database)

- Keep asset properties in a container with `id` as partition key or region-based partition key.
- Store coordinates as numeric `latitude` and `longitude`.
- For GeoJSON output, transform records in API:
  - `coordinates: [longitude, latitude]`.
- Add server-side validation before write:
  - coordinate bounds
  - required attributes
  - duplicate point logic

## Demo Checklist

- Open map and verify points load.
- Filter by `region = Hunter`, `status = Active`.
- Edit one asset and confirm table/map refresh.
- Run QA checks and verify issue list renders.
- Export CSV and GeoJSON with active filters.
