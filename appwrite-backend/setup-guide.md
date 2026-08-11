# Appwrite Backend - Setup Guide

This walks through setting up the Appwrite backend from scratch. The Appwrite implementation uses the same `index.html` test client as the custom backend. An adapter layer (`appwrite-adapter.js`) intercepts `fetch` calls and translates them into Appwrite Web SDK calls, so `index.html` doesn't need any modifications.

---

## Prerequisites

- An [Appwrite](https://appwrite.io/) account (Cloud or self-hosted)
- Node.js 18+

---

## 1. Create an Appwrite Project

1. Log in to the Appwrite Console (`https://cloud.appwrite.io` or your self-hosted instance).
2. Click **Create Project**.
3. Name it something like `secure-auth-demo` and note the **Project ID**.
4. Under **Settings > Platforms**, add a **Web** platform with hostname `localhost` (or `*` for development). This lets the Web SDK make requests without CORS errors.

---

## 2. Create a Database

1. Go to **Databases** in the sidebar.
2. Click **Create Database**. Name it whatever you want (e.g. `auth_db`).
3. Note the **Database ID**.

---

## 3. Create the `files` Collection

Inside the database you just created:

1. Click **Create Collection**. Name it `files` (or note whatever ID you choose).
2. Add these **attributes**:

| Key             | Type    | Size | Required | Notes                        |
|-----------------|---------|------|----------|------------------------------|
| `userId`        | String  | 128  | Yes      | Owner's Appwrite user ID     |
| `fileName`      | String  | 256  | Yes      | Original file name           |
| `mimeType`      | String  | 128  | Yes      | e.g. `application/pdf`       |
| `sizeBytes`     | Integer | n/a  | Yes      | File size in bytes           |
| `storageFileId` | String  | 128  | Yes      | ID of the file in Storage    |

3. Under **Settings > Permissions**, add:
   - **Role: Users** -> Check **Read** and **Create**

   Then enable **Document Security** (the toggle at the bottom). This is important because it makes Appwrite check each document's own permission list on top of the collection-level permissions. The seed script sets per-document permissions so each user can only read their own file documents.

4. Create an **Index** on the `userId` attribute (type: **Key**) so queries filter efficiently.

---

## 4. Create a Storage Bucket

1. Go to **Storage** in the sidebar.
2. Click **Create Bucket**. Name it `user-files` (or note whatever ID you choose).
3. Under **Settings > Permissions**, add:
   - **Role: Users** -> Check **Read** and **Create**
4. Enable **File Security** (same idea as Document Security: per-file permissions get enforced).

---

## 5. Generate an API Key

1. Go to **Overview > API Keys** (or **Settings > API Keys** depending on your console version).
2. Create a new key with these scopes:
   - `users.read`, `users.write` (to create test users via the Server SDK)
   - `databases.read`, `databases.write` (to create seed documents)
   - `storage.read`, `storage.write` (to upload seed files)
3. Copy the **API Key**. You'll need it for the seed script.

---

## 6. Configure Environment Variables

Set these before running the seed script. You can export them in your shell or create a `.env` file (the seed script reads from `process.env`):

```bash
export APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1   # or your self-hosted URL
export APPWRITE_PROJECT_ID=your_project_id
export APPWRITE_API_KEY=your_api_key
export APPWRITE_DATABASE_ID=your_database_id
export APPWRITE_FILES_COLLECTION_ID=files                # or your collection ID
export APPWRITE_BUCKET_ID=user-files                     # or your bucket ID
```

---

## 7. Seed Test Data

```bash
cd appwrite-backend
npm install
npm run seed
```

This creates three test users (alice, bob, carol, all with password `Password123!`), uploads sample files to the storage bucket, and creates corresponding documents in the `files` collection with per-user permissions.

---

## 8. Test

1. Open `index.html` in a browser (either from the filesystem or served via the custom backend at `http://localhost:3000`).
2. Select **Appwrite** mode in the "Backend mode" section.
3. Fill in your Appwrite settings (endpoint, project ID, database ID, collection ID, bucket ID).
4. Use the quick-fill buttons to log in as Alice, Bob, or Carol and test the protected endpoints.

---

## What Appwrite Handles vs. What You Configure

| Responsibility               | Handled by Appwrite         | Configured by you          |
|------------------------------|-----------------------------|----------------------------|
| Password hashing             | Yes (Argon2 internally)     | Nothing needed             |
| Session management           | Yes (httpOnly cookies)      | Nothing needed             |
| Rate limiting on auth        | Yes (built-in)              | Nothing needed             |
| CORS                         | Yes (via platform config)   | Add `localhost` platform   |
| Email format validation      | Yes                         | Nothing needed             |
| Database schema              | No                          | Collection + attributes    |
| Document-level permissions   | Enforced by SDK             | Enable + set per-document  |
| File-level permissions       | Enforced by SDK             | Enable + set per-file      |
| 403 vs 404 distinction       | No                          | Adapter logic              |
| REST-to-SDK translation      | No                          | `appwrite-adapter.js`      |

---

## Troubleshooting

- **401 on login**: Make sure you added `localhost` (or `*`) as a Web platform in your Appwrite project settings.
- **Missing attributes error on seed**: Double-check that all five attributes (`userId`, `fileName`, `mimeType`, `sizeBytes`, `storageFileId`) exist in your collection with the correct types and sizes.
- **Permission denied on document read**: Make sure **Document Security** is enabled on the collection. Without it, the per-document permissions set by the seed script get ignored.
- **CORS errors in browser**: The Appwrite Web SDK makes direct requests to your Appwrite server. The platform hostname needs to match where you're serving `index.html` from.
