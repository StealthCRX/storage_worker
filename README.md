# Storage Transfer

A secure file sharing and storage application built on Cloudflare's serverless infrastructure. Upload, download, and manage files of any size with chunked multipart uploads, access-code authentication, and a download audit trail.

**Live:** [https://storage-transfer.pages.dev](https://storage-transfer.pages.dev)

---

## Features

- **Chunked multipart uploads** — Large files are split into 5MB chunks and uploaded directly to R2 via presigned URLs
- **Multi-file upload** — Select or drag-and-drop multiple files at once, each with individual progress tracking
- **Cancel uploads** — Cancel any in-progress upload; the server-side multipart upload is aborted automatically
- **Download with audit trail** — Each download is logged with the user's name and timestamp
- **Delete files** — Remove files from both R2 storage and KV metadata via the UI
- **R2 sync** — Files deleted directly from the Cloudflare dashboard are automatically cleaned up from the listing
- **Access-code authentication** — Simple gate-keeping via a shared code + user name, with 24-hour JWT tokens
- **Serverless** — No servers to manage; scales automatically on Cloudflare Workers, R2, and KV

---

## Architecture

```
storage_worker/
├── frontend/                 # React SPA (Vite + Tailwind CSS)
│   ├── src/
│   │   ├── api/              # API client functions
│   │   ├── components/       # React components
│   │   ├── hooks/            # Custom React hooks
│   │   ├── lib/              # Chunker, uploader, token utils
│   │   ├── pages/            # Login and Dashboard pages
│   │   └── types/            # TypeScript interfaces
│   └── public/
│       └── _redirects        # Cloudflare Pages SPA routing
├── worker/                   # Cloudflare Worker API (Hono.js)
│   └── src/
│       ├── lib/              # JWT, KV, R2 presigned URL helpers
│       ├── middleware/        # CORS and auth middleware
│       └── routes/           # Auth, files, upload, download endpoints
└── .github/workflows/        # CI/CD pipelines
```

---

## Tech Stack

| Layer       | Technology                                       |
|-------------|--------------------------------------------------|
| Frontend    | React 18, TypeScript, Vite, Tailwind CSS, React Router |
| Backend     | Hono.js on Cloudflare Workers                    |
| Storage     | Cloudflare R2 (S3-compatible object storage)     |
| Database    | Cloudflare KV (key-value metadata store)         |
| Auth        | JWT (HS256) with access-code gate                |
| Presigning  | aws4fetch (S3-compatible presigned URLs)         |
| Deployment  | Cloudflare Pages (frontend), Cloudflare Workers (API) |
| CI/CD       | GitHub Actions                                   |

---

## API Endpoints

All endpoints except `/api/auth/verify` and `/` require a valid `Authorization: Bearer <token>` header.

| Method   | Endpoint                | Description                                   |
|----------|-------------------------|-----------------------------------------------|
| `GET`    | `/`                     | Health check — returns `{ status: "ok" }`     |
| `POST`   | `/api/auth/verify`      | Login with `{ code, name }`, returns JWT      |
| `GET`    | `/api/files`            | List all completed files (synced with R2)     |
| `DELETE` | `/api/files/:fileId`    | Delete a file from R2 and KV                  |
| `POST`   | `/api/upload/initiate`  | Start multipart upload, returns presigned URLs|
| `POST`   | `/api/upload/complete`  | Finalize multipart upload                     |
| `POST`   | `/api/upload/abort`     | Cancel an in-progress multipart upload        |
| `POST`   | `/api/download/:fileId` | Get presigned download URL + log download     |

---

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)
- A Cloudflare account with R2 and KV enabled

### 1. Clone the repository

```bash
git clone https://github.com/StealthCRX/storage_worker.git
cd storage_worker
```

### 2. Install dependencies

```bash
cd worker && npm install && cd ..
cd frontend && npm install && cd ..
```

### 3. Configure Cloudflare resources

**Login to Cloudflare:**

```bash
wrangler login
```

**Create a KV namespace:**

```bash
cd worker
npx wrangler kv namespace create "KV"
```

Copy the output `id` into `worker/wrangler.toml` under `[[kv_namespaces]]`.

**Create an R2 bucket** (if not already created):

```bash
npx wrangler r2 bucket create localdata
```

**Set R2 CORS** (required for browser uploads):

```bash
curl -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/r2/buckets/<BUCKET_NAME>/cors" \
  -H "Authorization: Bearer <API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"rules":[{"allowed":{"origins":["https://your-pages-domain.pages.dev","http://localhost:*"],"methods":["PUT","GET","POST","HEAD"],"headers":["*"]},"exposeHeaders":["ETag"],"maxAgeSeconds":3600}]}'
```

### 4. Update `worker/wrangler.toml`

Replace placeholder values with your actual Cloudflare account ID, R2 bucket name, and KV namespace ID:

```toml
name = "storage-transfer-worker"
main = "src/index.ts"
compatibility_date = "2024-06-20"
account_id = "<YOUR_ACCOUNT_ID>"

[vars]
ALLOWED_ORIGIN = "https://<YOUR_PROJECT>.pages.dev"
CHUNK_SIZE = "5242880"
R2_ACCOUNT_ID = "<YOUR_ACCOUNT_ID>"
R2_BUCKET_NAME = "<YOUR_BUCKET_NAME>"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "<YOUR_BUCKET_NAME>"

[[kv_namespaces]]
binding = "KV"
id = "<YOUR_KV_NAMESPACE_ID>"
```

### 5. Set worker secrets

```bash
cd worker
echo "<YOUR_ACCESS_CODE>" | npx wrangler secret put ACCESS_CODE
echo "<RANDOM_64_CHAR_HEX>" | npx wrangler secret put JWT_SECRET
echo "<YOUR_R2_ACCESS_KEY_ID>" | npx wrangler secret put R2_ACCESS_KEY_ID
echo "<YOUR_R2_SECRET_ACCESS_KEY>" | npx wrangler secret put R2_SECRET_ACCESS_KEY
```

R2 API tokens can be created at: **Cloudflare Dashboard > R2 > Manage R2 API Tokens**

### 6. Deploy

**Worker:**

```bash
cd worker
npx wrangler deploy
```

**Frontend:**

```bash
cd frontend
VITE_API_BASE_URL="https://<YOUR_WORKER>.workers.dev" npm run build
cd ..
CLOUDFLARE_ACCOUNT_ID="<YOUR_ACCOUNT_ID>" npx wrangler pages deploy frontend/dist --project-name=<YOUR_PROJECT>
```

---

## Local Development

**Start the worker dev server:**

```bash
cd worker
npm run dev
```

**Start the frontend dev server:**

```bash
cd frontend
VITE_API_BASE_URL="http://localhost:8787" npm run dev
```

The frontend will be available at `http://localhost:5173` and will proxy API requests to the local worker at `http://localhost:8787`.

---

## CI/CD

Both the frontend and worker have GitHub Actions workflows that auto-deploy on push to `main`.

### Required GitHub secrets

| Secret                  | Description                          |
|-------------------------|--------------------------------------|
| `CLOUDFLARE_API_TOKEN`  | Cloudflare API token with Workers and Pages write permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID           |

### Required GitHub variables

| Variable            | Description                                  |
|---------------------|----------------------------------------------|
| `VITE_API_BASE_URL` | Full URL of the deployed worker (e.g. `https://storage-transfer-worker.stealthcrx.workers.dev`) |

---

## Upload Flow

1. User selects one or more files in the browser
2. For each file, the frontend calls `/api/upload/initiate` which creates a multipart upload and returns presigned PUT URLs for each 5MB chunk
3. Chunks are uploaded directly from the browser to R2 (3 concurrent uploads with retry logic)
4. After all chunks complete, `/api/upload/complete` finalizes the multipart upload and marks the file as ready in KV
5. Users can cancel any in-progress upload, which aborts the R2 multipart upload

---

## Security

- **Access Code** — A shared code gates access; suitable for small teams, not multi-tenant production use
- **JWT** — 24-hour tokens signed with HS256; no refresh mechanism (users re-authenticate after expiry)
- **CORS** — Restricted to the configured `ALLOWED_ORIGIN` + localhost
- **Presigned URLs** — Time-limited (PUT: 6 hours, GET: 1 hour), signed with R2 credentials
- **No per-user permissions** — All authenticated users can see, download, and delete all files

---

## License

MIT
