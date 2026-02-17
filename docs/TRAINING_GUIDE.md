# Training Guide - Spatial Asset Register Lite

## Page 1 - Quick Start for Staff

### Purpose

This application supports basic spatial asset maintenance, visualization, and data quality checks.

### Log in / Open

1. Start the app (`npm run dev`) or open deployed URL.
2. Land on the dashboard with map, filters, and data table.

### View Spatial Assets

1. The center panel shows the map with point markers.
2. Click a point marker to open a pop-up with asset details.
3. Select `Edit` in the pop-up to load that record into the edit form.

### Search and Filter

1. Use `Search by name` for partial keyword match.
2. Use `Region`, `Asset Type`, and `Status` dropdowns for exact filtering.
3. Filters immediately refresh map and data table.

### Maintain Records

1. Use `Add Asset` form to create a new record.
2. Required fields: `name`, `region`, `type`, `status`.
3. Optional coordinates: `latitude`, `longitude`.
4. Click `Create` to submit.
5. To update, click `Edit` from map/table and then `Update`.

## Page 2 - QA and Data Delivery

### Run Data QA

1. Click `Run QA Checks`.
2. Review QA issue list containing:
   - `MISSING_COORDINATES`
   - `DUPLICATE_POINT`
   - `MISSING_FIELDS`
3. Open the affected record and update values.

### Export Data

1. Apply desired filters first.
2. Click `Export CSV` to download tabular dataset.
3. Click `Export GeoJSON` to download GIS-ready point features.

### Recommended Future Enhancements

1. Add role-based access control.
2. Add audit logs for every update.
3. Integrate with enterprise database (Cosmos DB / corporate DB).
4. Add geometry support for polygons and lines.
