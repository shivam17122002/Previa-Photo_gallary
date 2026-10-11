# Previa

Previa is a private cloud file manager built with Next.js, NestJS, PostgreSQL, Prisma, Redis and S3 compatible storage.

## Run locally

1. Install Node.js and Docker Desktop.
2. Start the supporting services from the repository root:

   ```sh
   npm run docker:up
   ```

   This starts PostgreSQL, Redis and MinIO. MinIO's console is available on port `9001`.
3. Copy `backend/.env.example` to `backend/.env`. Set unique access and refresh secrets and an initial administrator email and password. For local development, local disk storage can be used by setting `STORAGE_DRIVER=local`.
4. Install dependencies and prepare the database:

   ```sh
   cd backend
   npm install
   npx prisma generate
   npx prisma db push
   npm run start:dev
   ```

5. In a second terminal:

   ```sh
   cd frontend
   npm install
   npm run dev
   ```

   Open `http://localhost:3000`. The Next.js app proxies `/api/v1` requests to the backend on port `4000`.

## What is included

- Admin approved registration, sign in, refresh token rotation, profile updates and password changes.
- Private file and nested folder management, search, favorites, direct and multipart uploads, streaming previews, downloads, trash and recovery.
- Per user quotas and storage accounting, scanning queue integration, notifications and administrator account review.
- Responsive dashboard and drive views for desktop and mobile.

The initial administrator is only seeded when `ADMIN_INITIAL_EMAIL` and `ADMIN_INITIAL_PASSWORD` are configured. Never use development credentials or secrets in a production deployment. Production deployments also need HTTPS, private object storage encryption, and a configured ClamAV or VirusTotal scanner.
