# Appwrite Backend — Setup Guide

This document walks through setting up the Appwrite backend from scratch.

## Prerequisites

- An [Appwrite Cloud](https://cloud.appwrite.io) account (or a self-hosted Appwrite instance)
- Node.js 18+ (for the seed script)

## 1. Create a Project

1. Log into the Appwrite console.
2. Click **Create Project**.  Name it whatever you like (e.g. `auth-demo`).
3. Note your **Project ID** — you'll enter it in the `index.html` settings panel.

## 2. Enable Email/Password Authentication

1. In your project, go to **Auth → Settings**.
2. Make sure **Email/Password** is enabled (it usually is by default).

## 3. Create a Database

1. Go to **Databases** → **Create Database**.
2. Name it (e.g. `main`).  Note the **Database ID**.

## 4. Create the `files` Collection

Inside your database, create a collection:

- **Collection ID**: `files` (or whatever you prefer — just update `index.html` to match)
- **Permissions**: Set **Document Security** to enabled. This makes Appwrite check per-document permissions rather than collection-level ones.

### Attributes

| Key             | Type    | Size  | Required | Default |
|-----------------|---------|-------|----------|---------|
| `userId`        | String  | 36    | Yes      | —       |
| `fileName`      | String  | 255   | Yes      | —       |
| `mimeType`      | String  | 127   | Yes      | —       |
| `sizeBytes`     | Integer | —     | Yes      | 0       |
| `storageFileId` | String  | 36    | Yes      | —       |

### Indexes

| Key              | Type  | Attributes |
|------------------|-------|------------|
| `idx_userId`     | Key   | `userId`   |

## 5. Create a Storage Bucket

1. Go to **Storage** → **Create Bucket**.
2. **Bucket ID**: `user-files` (or match what's in `index.html`).
3. **Permissions**: Enable **File Security** so each file's permissions are checked individually.
4. Set maximum file size as needed (e.g. 10 MB).

## 6. Get an API Key (for the seed script)

1. Go to **Overview → API Keys → Create API Key**.
2. Grant these scopes:
   - `users.read`, `users.write`
   - `databases.read`, `databases.write`
   - `documents.read`, `documents.write`
   - `files.read`, `files.write`
3. Copy the key — you'll need it for `seed-appwrite.js`.

## 7. Seed Test Data

```bash
cd appwrite-backend
npm install

# Set environment variables (or create a .env file)
export APPWRITE_ENDPOINT="https://cloud.appwrite.io/v1"
export APPWRITE_PROJECT_ID="your-project-id"
export APPWRITE_API_KEY="your-api-key"
export APPWRITE_DATABASE_ID="your-database-id"
export APPWRITE_FILES_COLLECTION_ID="files"
export APPWRITE_BUCKET_ID="user-files"

npm run seed
```

The seed script creates the 3 test users, uploads sample files to storage, and creates the corresponding documents in the `files` collection with correct per-user permissions.

## 8. Configure `index.html`

1. Open `index.html` in a browser (serve it over HTTP, e.g. `npx serve .`).
2. Select the **Appwrite** radio button.
3. Fill in:
   - **Endpoint**: your Appwrite endpoint (e.g. `https://cloud.appwrite.io/v1`)
   - **Project ID**: from step 1
   - **Database ID**: from step 3
   - **Files collection ID**: from step 4
   - **Storage bucket ID**: from step 5
4. Use the quick-fill buttons to test each seeded user.

## What Appwrite Handles Automatically

- **Password hashing**: Appwrite uses bcrypt internally. You never see or manage password hashes.
- **Session management**: Appwrite creates httpOnly session cookies. No JWTs to manage.
- **Rate limiting**: Appwrite applies its own rate limits to auth endpoints.
- **CORS**: Appwrite handles CORS for configured platforms.
- **Email validation**: Appwrite validates email format on account creation.

## What You Configure Yourself

- **Collection schema**: You define what attributes exist on documents.
- **Document permissions**: You set who can read/write each document (e.g. `user:{userId}`).
- **Bucket permissions**: You set who can access each file.
- **Data isolation**: By setting document-level permissions to `read("user:{userId}")`, Appwrite enforces that only the owner can read their own documents. However, the adapter also does an explicit ownership check to return the correct HTTP status codes (403 vs 404).
