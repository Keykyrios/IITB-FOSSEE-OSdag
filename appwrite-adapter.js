// appwrite-adapter.js
// Intercepts fetch calls when the user selects "Appwrite" mode in index.html,
// translating each REST endpoint into the equivalent Appwrite Web SDK call.

(function () {
  // We need to wait for the Appwrite SDK to load.  If it hasn't loaded yet
  // (e.g. the script tag is missing or blocked), the adapter gracefully
  // logs a warning and does nothing.
  if (typeof Appwrite === 'undefined') {
    console.warn('[appwrite-adapter] Appwrite SDK not loaded. Make sure the CDN script tag is uncommented in index.html.');
    return;
  }

  const { Client, Account, Databases, Storage, Query, ID } = Appwrite;

  let client = null;
  let account = null;
  let databases = null;
  let storage = null;

  function getConfig() {
    return {
      endpoint:         document.getElementById('awEndpoint').value.trim(),
      projectId:        document.getElementById('awProjectId').value.trim(),
      databaseId:       document.getElementById('awDatabaseId').value.trim(),
      filesCollectionId: document.getElementById('awFilesCollectionId').value.trim(),
      bucketId:         document.getElementById('awBucketId').value.trim(),
    };
  }

  function initClient() {
    const cfg = getConfig();
    client = new Client();
    client.setEndpoint(cfg.endpoint).setProject(cfg.projectId);
    account = new Account(client);
    databases = new Databases(client);
    storage = new Storage(client);
  }

  function json(status, body) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async function handleRegister(req) {
    const { email, password } = await req.json();
    if (!email || !password) return json(400, { error: 'email and password are required' });

    try {
      initClient();
      const user = await account.create(ID.unique(), email, password);

      return json(201, { id: user.$id, email: user.email });
    } catch (err) {
      if (err.code === 409) return json(409, { error: 'An account with that email already exists' });
      console.error('[appwrite-adapter] register error:', err);
      return json(err.code || 500, { error: err.message || 'Registration failed' });
    }
  }

  async function handleLogin(req) {
    const { email, password } = await req.json();
    if (!email || !password) return json(400, { error: 'Invalid email or password' });

    try {
      initClient();
      await account.createEmailPasswordSession(email, password);
      const user = await account.get();
      // Appwrite uses cookie-based sessions, so there's no JWT to return.
      // We return a placeholder so the UI can display something, but the
      // actual auth state lives in the Appwrite session cookie.
      return json(200, {
        token: 'appwrite-session-active',
        user: { id: user.$id, email: user.email },
      });
    } catch (err) {
      // Same generic message regardless of whether the email exists.
      return json(401, { error: 'Invalid email or password' });
    }
  }

  async function handleLogout() {
    try {
      initClient();
      // Deletes the current session server-side, not just clearing a cookie.
      await account.deleteSession('current');
      return json(200, { message: 'Logged out' });
    } catch (err) {
      return json(200, { message: 'Logged out' });
    }
  }

  async function handleMe() {
    try {
      initClient();
      const user = await account.get();
      // account.get() can only return the current user — no way to
      // pass someone else's ID, so IDOR isn't possible here either.
      return json(200, {
        id: user.$id,
        email: user.email,
        profile: {
          fullName: user.name || '',
          displayName: user.email.split('@')[0],
          bio: '',
          createdAt: user.$createdAt,
          role: 'user',
        },
      });
    } catch (err) {
      return json(401, { error: 'Not authenticated' });
    }
  }

  async function handleFiles() {
    try {
      initClient();
      const user = await account.get();
      const cfg = getConfig();

      const result = await databases.listDocuments(
        cfg.databaseId,
        cfg.filesCollectionId,
        [Query.equal('userId', user.$id)]
      );

      const files = result.documents.map(doc => ({
        id: doc.$id,
        ownerId: doc.userId,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
        uploadedAt: doc.$createdAt,
      }));

      return json(200, { files });
    } catch (err) {
      if (err.code === 401) return json(401, { error: 'Not authenticated' });
      console.error('[appwrite-adapter] files error:', err);
      return json(500, { error: 'Failed to fetch files' });
    }
  }

  async function handleFileById(fileId) {
    try {
      initClient();
      const user = await account.get();
      const cfg = getConfig();

      const doc = await databases.getDocument(cfg.databaseId, cfg.filesCollectionId, fileId);

      if (doc.userId !== user.$id) {
        return json(403, { error: 'You do not have access to this file' });
      }

      return json(200, {
        file: {
          id: doc.$id,
          ownerId: doc.userId,
          fileName: doc.fileName,
          mimeType: doc.mimeType,
          sizeBytes: doc.sizeBytes,
          uploadedAt: doc.$createdAt,
        },
      });
    } catch (err) {
      if (err.code === 404) return json(404, { error: 'File not found' });
      if (err.code === 401) return json(401, { error: 'Not authenticated' });
      console.error('[appwrite-adapter] file-by-id error:', err);
      return json(500, { error: 'Failed to fetch file' });
    }
  }

  async function handleFileDownload(fileId) {
    try {
      initClient();
      const user = await account.get();
      const cfg = getConfig();

      const doc = await databases.getDocument(cfg.databaseId, cfg.filesCollectionId, fileId);
      if (doc.userId !== user.$id) {
        return new Response('Forbidden', { status: 403 });
      }

      const url = storage.getFileDownload(cfg.bucketId, doc.storageFileId);
      const fileResponse = await fetch(url);
      return fileResponse;
    } catch (err) {
      if (err.code === 404) return new Response('File not found', { status: 404 });
      if (err.code === 401) return new Response('Not authenticated', { status: 401 });
      console.error('[appwrite-adapter] download error:', err);
      return new Response('Download failed', { status: 500 });
    }
  }

  // Intercept window.fetch when Appwrite mode is active
  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    // Check if Appwrite mode is selected
    const modeInputs = document.querySelectorAll('input[name="backendMode"]');
    let mode = 'mock';
    for (const inp of modeInputs) {
      if (inp.checked) { mode = inp.value; break; }
    }

    if (mode !== 'appwrite') return originalFetch.call(window, input, init);

    const url = typeof input === 'string' ? input : input.url;
    let pathname;
    try {
      pathname = new URL(url, window.location.href).pathname;
    } catch {
      return originalFetch.call(window, input, init);
    }

    const req = new Request(url, init);

    if (pathname === '/register' && req.method === 'POST') return handleRegister(req);
    if (pathname === '/login'    && req.method === 'POST') return handleLogin(req);
    if (pathname === '/logout'   && req.method === 'POST') return handleLogout();
    if (pathname === '/me'       && req.method === 'GET')  return handleMe();
    if (pathname === '/files'    && req.method === 'GET')  return handleFiles();

    let m = pathname.match(/^\/files\/([^/]+)\/download$/);
    if (m && req.method === 'GET') return handleFileDownload(m[1]);

    m = pathname.match(/^\/files\/([^/]+)$/);
    if (m && req.method === 'GET') return handleFileById(m[1]);

    // No route matched — pass through to real fetch. This is critical:
    // the Appwrite SDK makes its own fetch calls to the Appwrite server,
    // and those URLs (e.g. /v1/account/sessions) don't match our patterns.
    return originalFetch.call(window, input, init);
  };

  console.info('[appwrite-adapter] ready — select "Appwrite" mode in the UI to use it.');
})();
