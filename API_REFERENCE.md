# Drilling Lab API Reference

## Pipeline Endpoints

### Live Status
```
GET /api/pipeline/stats
```
Returns current pipeline status, well counts, ingestion metrics, queue status.

**Response:**
```json
{
  "totalRecords": 123456789,
  "wellsWithData": 42,
  "activeWells": 5,
  "ingestionRunning": true,
  "queue": { "complete": 20, "in_progress": 2, "queued": 5, "pending": 15 },
  "byRig": [...],
  "wellData": [...]
}
```

---

### Pipeline History (NEW)
```
GET /api/pipeline/history
```
Returns last 50 pipeline runs with timestamps, metrics, and status.

**Response:**
```json
{
  "runs": [
    {
      "_id": "...",
      "start_time": "2026-02-03T13:39:24.843Z",
      "end_time": "2026-02-03T13:39:26.742Z",
      "duration_seconds": 1.899,
      "wells_processed": 2,
      "wells_skipped": 0,
      "wells_failed": 0,
      "records_inserted": 0,
      "errors": [],
      "success": true,
      "mode": "specific"
    }
  ],
  "count": 4
}
```

---

### Health History (NEW)
```
GET /api/pipeline/health-history
```
Returns last 100 health check logs from `pipeline_health_log`.

**Response:**
```json
{
  "logs": [...],
  "count": 100
}
```

---

### Daily Volume (NEW)
```
GET /api/pipeline/daily-volume
```
Aggregates daily ingestion metrics from pipeline runs.

**Response:**
```json
{
  "dailyVolume": [
    {
      "date": "2026-02-03",
      "records": 0,
      "wells": 6,
      "runs": 4,
      "avgRuntime": 1.23,
      "errors": 0
    }
  ],
  "count": 1
}
```

---

### Pipeline Control
```
POST /api/pipeline/start
POST /api/pipeline/stop
```
Start or stop the ingestion pipeline via systemd.

**Request (start):**
```json
{
  "rigs": "142 148 570 26 571"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Started ingestion for rigs: 142 148 570 26 571"
}
```

---

## Schema Endpoints

### MongoDB Stats
```
GET /api/schema/stats
```
Returns live MongoDB collection stats (counts, sizes, indexes, fields).

**Response:**
```json
{
  "database": "drilling_lab",
  "collections": [
    {
      "name": "nov_wells",
      "count": 51,
      "sizeBytes": 123456,
      "indexes": [...],
      "fields": [...]
    }
  ],
  "totals": {
    "collections": 25,
    "documents": 123456789,
    "dataSizeBytes": 12345678901,
    "storageSizeBytes": 23456789012,
    "indexSizeBytes": 1234567890
  }
}
```

---

### TimescaleDB Silver Stats (NEW)
```
GET /api/schema/silver-stats
```
Returns live TimescaleDB silver schema statistics.

**Response:**
```json
{
  "schema": "silver",
  "tables": [
    {
      "name": "silver.edr_1s",
      "tableName": "edr_1s",
      "type": "hypertable",
      "rowCount": 12345678,
      "totalSizeBytes": 1234567890,
      "tableSizeBytes": 1000000000,
      "indexesSizeBytes": 234567890,
      "isHypertable": true,
      "numChunks": 42,
      "compressionEnabled": true,
      "compressionRatio": 4.2,
      "compressedChunks": 30
    }
  ],
  "totals": {
    "tables": 11,
    "hypertables": 7,
    "continuousAggs": 4,
    "totalRows": 123456789,
    "totalSizeBytes": 12345678901,
    "compressedTables": 4
  }
}
```

**Table Types:**
- `hypertable` — TimescaleDB hypertable (time-series optimized)
- `continuous_agg` — Materialized view with auto-refresh
- `table` — Regular PostgreSQL table

---

## Testing Commands

```bash
# Test all endpoints
curl http://localhost:3001/api/pipeline/stats | jq
curl http://localhost:3001/api/pipeline/history | jq
curl http://localhost:3001/api/pipeline/health-history | jq
curl http://localhost:3001/api/pipeline/daily-volume | jq
curl http://localhost:3001/api/schema/stats | jq
curl http://localhost:3001/api/schema/silver-stats | jq

# Health check
curl http://localhost:3001/api/health

# Start pipeline
curl -X POST http://localhost:3001/api/pipeline/start \
  -H "Content-Type: application/json" \
  -d '{"rigs": "142 148 570 26"}'

# Stop pipeline
curl -X POST http://localhost:3001/api/pipeline/stop
```

---

## Database Connections

**MongoDB:**
```javascript
const MONGO_URI = process.env.MONGO_URI || 'mongodb://192.168.0.63:27017'
const DB_NAME = 'drilling_lab'
```

**TimescaleDB (PostgreSQL):**
```javascript
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'drilling_lab',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres'
})
```

---

## Frontend Pages

- **Pipeline:** http://app.drillinglab.ai/pipeline
  - Live Status tab (existing)
  - History tab (NEW)

- **Schema Map:** http://app.drillinglab.ai/schema
  - MongoDB tab (existing, enhanced)
  - Silver tab (NEW - live TimescaleDB stats)

---

## Notes

- All endpoints use MongoDB `req.db` provided by middleware
- TimescaleDB endpoints use dedicated `pg` Pool
- Row counts are approximate (using `pg_class.reltuples`) for performance
- Compression stats only available if TimescaleDB compression is enabled
- Auto-refresh on frontend: 60 seconds (configurable)
