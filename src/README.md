# BMAD Dashboard Foundation (Story 001)

## Stack
- Frontend: React + TypeScript + Tailwind (`src/client`)
- Backend: Node.js + Express (`src/server`)
- Shared contracts: TypeScript (`src/shared`)

## Run locally
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start backend API:
   ```bash
   npm run dev:server
   ```
3. Start frontend app:
   ```bash
   npm run dev:client
   ```

Frontend runs on `http://localhost:5173` and proxies `/api/*` to backend (`http://localhost:3001`).

## Verify acceptance criteria
- Health check:
  ```bash
  curl http://localhost:3001/api/v1/health
  ```
- Canonical status model:
  ```bash
  curl http://localhost:3001/api/v1/meta/status-model
  ```
- Workflow list and blocked/failed filtering:
  ```bash
  curl "http://localhost:3001/api/v1/workflows?status=blocked,failed"
  ```
- Workflow transitions:
  ```bash
  curl "http://localhost:3001/api/v1/workflows/wf-1002/transitions?limit=10"
  ```

## Realtime protocol
- WebSocket endpoint: `ws://localhost:3001/ws` (or `wss://<host>/ws`)
- Client messages: `auth`, `subscribe`, `heartbeat`, `resync_request`
- Server messages: `snapshot`, `event`, `stale_state`, `sync_status`, `error`

## Test
```bash
npm test
```
