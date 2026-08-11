// Seeds the Appwrite backend with test users and files using the Server SDK.
// Requires env vars: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY,
// APPWRITE_DATABASE_ID, APPWRITE_FILES_COLLECTION_ID, APPWRITE_BUCKET_ID.
// See setup-guide.md for details.

import { Client, Users, Databases, Storage, ID, Permission, Role, InputFile } from 'node-appwrite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Config from environment ---
const ENDPOINT      = process.env.APPWRITE_ENDPOINT           || 'https://cloud.appwrite.io/v1';
const PROJECT_ID    = process.env.APPWRITE_PROJECT_ID          || '';
const API_KEY       = process.env.APPWRITE_API_KEY             || '';
const DATABASE_ID   = process.env.APPWRITE_DATABASE_ID         || '';
const COLLECTION_ID = process.env.APPWRITE_FILES_COLLECTION_ID || 'files';
const BUCKET_ID     = process.env.APPWRITE_BUCKET_ID           || 'user-files';

if (!PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error('Missing required environment variables. See setup-guide.md.');
  process.exit(1);
}

// --- Appwrite client ---
const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const users = new Users(client);
const databases = new Databases(client);
const storage = new Storage(client);

// --- Load seed data ---
const seedData = JSON.parse(
  readFileSync(join(__dirname, '..', 'seed-data.json'), 'utf8')
);

async function createUser(email, password, name) {
  try {
    const user = await users.create(ID.unique(), email, undefined, password, name);
    console.log(`  Created user: ${email} (${user.$id})`);
    return user.$id;
  } catch (err) {
    if (err.code === 409) {
      // User already exists - find them by email
      const result = await users.list([`equal("email", ["${email}"])`]);
      if (result.users.length > 0) {
        console.log(`  User already exists: ${email} (${result.users[0].$id})`);
        return result.users[0].$id;
      }
    }
    throw err;
  }
}

async function uploadSampleFile(userId, fileName, mimeType) {
  // Create sample content
  const content = `[Sample file: ${fileName}]\nMime type: ${mimeType}\nOwner: ${userId}\n`;
  const buffer = Buffer.from(content, 'utf8');

  try {
    const file = await storage.createFile(
      BUCKET_ID,
      ID.unique(),
      InputFile.fromBuffer(buffer, fileName),
      [
        Permission.read(Role.user(userId)),
        Permission.write(Role.user(userId)),
      ]
    );
    console.log(`    Uploaded to storage: ${fileName} (${file.$id})`);
    return file.$id;
  } catch (err) {
    console.error(`    Failed to upload ${fileName}:`, err.message);
    throw err;
  }
}

async function createFileDocument(userId, storageFileId, fileData) {
  try {
    await databases.createDocument(
      DATABASE_ID,
      COLLECTION_ID,
      fileData.id, // Use the same ID from seed-data for consistency
      {
        userId,
        fileName: fileData.fileName,
        mimeType: fileData.mimeType,
        sizeBytes: fileData.sizeBytes,
        storageFileId,
      },
      [
        Permission.read(Role.user(userId)),
        Permission.update(Role.user(userId)),
      ]
    );
    console.log(`    Document created: ${fileData.fileName} (${fileData.id})`);
  } catch (err) {
    if (err.code === 409) {
      console.log(`    Document already exists: ${fileData.fileName} (${fileData.id})`);
      return;
    }
    throw err;
  }
}

async function main() {
  console.log('Seeding Appwrite backend...\n');

  for (const u of seedData.users) {
    const userId = await createUser(u.email, u.password, u.profile.fullName);

    for (const f of u.files) {
      const storageFileId = await uploadSampleFile(userId, f.fileName, f.mimeType);
      await createFileDocument(userId, storageFileId, f);
    }

    console.log('');
  }

  console.log('Done. Test credentials:');
  console.log('  alice@example.com / Password123!');
  console.log('  bob@example.com   / Password123!');
  console.log('  carol@example.com / Password123!');
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
