# Previa — Enterprise-Grade Cloud File Storage & Management Platform

Previa is a modern, security-first cloud-based file storage and management platform modeled after Google Drive, built strictly to the specifications of the Previa Product Requirements Document (PRD).

---

## 🚀 Key Features

- **Admin-Gated Registration & RBAC**: New user registrations are automatically placed into a `PENDING` state until explicitly reviewed and approved by an administrator.
- **Strict User-Level Data Isolation (Zero Data Leakage)**: Strict multi-tenant isolation enforced at both the database layer (`where: { userId }` on every query, preventing IDOR) and object storage layer (`users/{userId}/...` prefix).
- **Comprehensive File Lifecycle**: Single, multi-file, and chunked resumable uploads with progress tracking and network retries; file download; renaming; moving; starring (favorites); and search.
- **Hierarchical Folder Management**: Unlimited nested folders, breadcrumb navigation trail, folder renaming, folder moving with cycle prevention, and soft-delete cascading.
- **Rich In-Browser Previews**:
  - **Images**: High-resolution zoom in/out, rotation, dimensions, and thumbnails.
  - **Videos**: HTML5 player with seek bar, volume control, playback rate, and resolution/duration metadata.
  - **Audio**: Custom audio player with real-time animated waveform enhancement, seek scrubber, volume control, and metadata.
  - **Documents**: Clean in-browser **DOCX** document rendering via `mammoth`, **PDF** viewer, and **TXT / Markdown / Code** syntax viewer.
- **Recycle Bin (Trash & Recovery)**: Soft-deletion of files and folders, instant recovery, permanent deletion, and one-click "Empty Trash" with physical storage purging and quota reclamation.
- **Automated Malware Scanning & Security**: BullMQ queue pipeline integrating heuristic scanning, EICAR test signature detection, ClamAV daemon, and VirusTotal API. Automatically quarantines malicious files and alerts users.
- **Responsive Modern UI**: Built with Next.js App Router and Tailwind CSS, adapting smoothly across Desktop, Laptop, Tablet, and Mobile devices.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 15 (App Router), TypeScript, Tailwind CSS, Lucide Icons, Mammoth.js |
| **Backend** | NestJS REST API, TypeScript, Express, Multer, Helmet, Cookie-Parser, Passport |
| **Database & ORM** | PostgreSQL 16+ / 18, Prisma ORM |
| **Storage Backend** | Cloudflare R2 / AWS S3 / MinIO (with zero-config local filesystem fallback) |
| **Authentication** | JWT (Access Tokens + httpOnly Refresh Tokens), Bcrypt password hashing |
| **Queues & Caching** | Redis 7 + BullMQ (with automatic resilient embedded queue fallback) |
| **Security & Antivirus** | Heuristic Scanner, ClamAV Daemon protocol, VirusTotal REST API |

---

## 📁 Repository Structure

```
PORTFOLIO/
├── backend/                  # NestJS REST API Server
│   ├── prisma/
│   │   └── schema.prisma     # Prisma database models & relationships
│   ├── src/
│   │   ├── admin/            # Admin oversight, user approval, quotas & RBAC
│   │   ├── auth/             # Registration, login, approval gate, JWT rotation
│   │   ├── common/           # Guards, filters, decorators, file sanitization
│   │   ├── files/            # Uploads, chunked uploads, download, streaming, trash
│   │   ├── folders/          # Nested folder tree, breadcrumbs, moves, renames
│   │   ├── notifications/    # In-app notification center & alerts
│   │   ├── queues/           # BullMQ queue workers & event dispatchers
│   │   ├── scanner/          # Malware scanning (Heuristics, ClamAV, VirusTotal)
│   │   ├── storage/          # Local disk, Cloudflare R2 & AWS S3 storage adapters
│   │   └── main.ts           # Global bootstrap, Helmet, CORS, CookieParser
│   ├── .env.example          # Backend environment variable template
│   └── package.json
├── frontend/                 # Next.js 15 App Router Frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── drive/        # Main Google Drive-style file explorer UI
│   │   │   ├── login/        # Secure login page
│   │   │   ├── register/     # Registration with approval-status banner
│   │   │   ├── globals.css   # Custom styling and responsive design rules
│   │   │   └── layout.tsx    # Root layout
│   │   ├── lib/              # API client and formatting utilities
│   │   └── types/            # TypeScript interfaces
│   ├── .env.local            # Frontend environment configuration
│   └── package.json
├── docker-compose.yml        # Docker composition for PostgreSQL, Redis, and MinIO
└── README.md
```

---

## ⚙️ Environment Variables

### Backend Configuration (`backend/.env`)

```env
PORT=4000
NODE_ENV=development

# Database Connection (PostgreSQL)
DATABASE_URL="postgresql://postgres:Shivam%40123@localhost:5432/previa_db?schema=public"

# JWT Authentication Secrets
JWT_ACCESS_SECRET=previa_super_secret_jwt_access_token_key_2026_dev_mode_secure
JWT_REFRESH_SECRET=previa_super_secret_jwt_refresh_token_key_2026_dev_mode_secure
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d
COOKIE_SECRET=previa_cookie_secure_signature_salt_2026
CORS_ORIGIN=http://localhost:3000

# Object Storage Driver: "local" (zero-config disk) or "s3" / "r2" (Cloudflare R2 / AWS S3)
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=./uploads

# Cloudflare R2 / AWS S3 Credentials (when STORAGE_DRIVER=s3 or r2)
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=<your-access-key-id>
S3_SECRET_ACCESS_KEY=<your-secret-access-key>
S3_BUCKET_NAME=previa-storage
S3_FORCE_PATH_STYLE=false

# Caching & BullMQ Queue
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Malware Scanning: "mock" (built-in heuristics + EICAR), "clamav", or "virustotal"
MALWARE_SCAN_PROVIDER=mock
VIRUSTOTAL_API_KEY=
CLAMAV_HOST=localhost
CLAMAV_PORT=3310

# Default Seed Administrator
ADMIN_INITIAL_EMAIL=admin@previa.io
ADMIN_INITIAL_PASSWORD=AdminPass2026!
ADMIN_INITIAL_NAME="System Administrator"
```

### Frontend Configuration (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_APP_NAME="Previa Cloud Storage"
```

---

## 🚀 Quickstart Guide

### 1. Database Setup & Migrations

Ensure PostgreSQL is running, then synchronize the Prisma database schema:

```powershell
cd backend
npx prisma generate
npx prisma db push
```

### 2. Start the Backend API Server

```powershell
cd backend
npm run build
node dist/main.js
# Or in watch mode for development:
npm run start:dev
```
The REST API will be accessible at `http://localhost:4000/api/v1`.

### 3. Start the Next.js Frontend

```powershell
cd frontend
npm run build
npm run start
# Or in development mode:
npm run dev
```
The web application will be accessible at `http://localhost:3000`.

---

## 🔐 Default Admin Account

On first startup, Previa automatically seeds the primary administrator account:
- **Email**: `admin@previa.io`
- **Password**: `AdminPass2026!`

Log in with these credentials to review and approve pending registrations from the **People** tab.

---

## 🛡️ Security Architecture

1. **Gated Account Approval**: Users registering via `/register` cannot log in until an administrator approves their profile. Attempts to log in before approval receive a `403 Forbidden` response explaining the review status.
2. **Strict User-Level Isolation**: Every file, folder, and storage stream query verifies `where: { id, userId }`. Users cannot read, download, move, rename, or delete any object belonging to another user.
3. **Malware & Threat Defense**: All uploads pass through the security scanner pipeline. If an infected file is detected, it is immediately quarantined (`scanStatus: 'INFECTED'`), blocked from downloading or streaming, and a high-priority security alert is dispatched.
4. **Resumable Chunked Uploads**: Large files (>100MB) are automatically sliced into chunks and uploaded sequentially with retry capability, allowing uploads to resume gracefully without restarting from byte zero.
5. **Byte-Range Media Streaming**: Image/video/audio previews utilize HTTP `Range: bytes=start-end` streaming with `206 Partial Content`, enabling immediate browser seeking without downloading entire multi-gigabyte media files.
