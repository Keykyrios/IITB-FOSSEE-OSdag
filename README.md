# Secure Login System

A login / registration / logout system implemented twice - once with a custom Node.js + Express + PostgreSQL backend, and once using Appwrite as a managed backend. Both implementations work with the same `index.html` testing client.

---

## Repository Structure

```
├── index.html              # Provided test client (shared by both backends)
├── mock-api.js             # Provided in-browser mock (for offline testing)
├── seed-data.json          # Provided seed data (3 users, 6 files)
├── appwrite-adapter.js     # Client-side adapter for Appwrite mode
│
├── custom-backend/         # Implementation 1: Node + Express + PostgreSQL
│   ├── src/
│   │   ├── server.js       # Express app entry point
│   │   ├── config.js       # Environment + RSA key loading
│   │   ├── db.js           # PostgreSQL connection pool
│   │   ├── seed.js         # Database seeding script
│   │   ├── middleware/     # Auth + rate limiting
│   │   ├── routes/         # /register, /login, /logout, /me, /files
│   │   └── utils/          # JWT (RS256) + Argon2id hashing
│   ├── migrations/         # SQL schema
│   ├── scripts/            # Key generation
│   ├── docker-compose.yml  # PostgreSQL container
│   └── .env.example
│
└── appwrite-backend/       # Implementation 2: Appwrite
    ├── setup-guide.md      # Console setup instructions
    └── seed-appwrite.js    # Server SDK seeding script
```

---

## Test Users

All three users share the same password (as specified in `seed-data.json`):

| Email               | Password       | Files                                |
|---------------------|----------------|--------------------------------------|
| alice@example.com   | Password123!   | resume_alice.pdf, profile_photo.jpg  |
| bob@example.com     | Password123!   | project_notes.txt, invoice_march.pdf |
| carol@example.com   | Password123!   | test_plan.docx, vacation.png         |

---

## Quick Start - Custom Backend

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (for PostgreSQL)
- Node.js 18+

### Steps

```bash
cd custom-backend

# 1. Start PostgreSQL
docker compose up -d

# 2. Install dependencies
npm install

# 3. Create .env from example
cp .env.example .env

# 4. Generate RSA keys + seed the database (one command)
npm run setup

# 5. Start the server
npm run dev
```

The server starts on `http://localhost:3000` and serves `index.html` directly. Open that URL in a browser, select **Custom REST backend**, and test away.

### Running Without Docker

If you have PostgreSQL running locally, edit the `DATABASE_URL` in `.env` to point at your instance, then follow steps 2-5 above.

---

## Quick Start - Appwrite Backend

See [appwrite-backend/setup-guide.md](appwrite-backend/setup-guide.md) for the full walkthrough. In short:

1. Create an Appwrite project (cloud or self-hosted)
2. Create a database, a `files` collection with the required attributes, and a `user-files` storage bucket
3. Set document-level and file-level permissions
4. Run `cd appwrite-backend && npm install && npm run seed`
5. Open `index.html`, select **Appwrite** mode, fill in your project settings, and test

---

## Design Decisions

### JWT (RS256) vs. Session-Based Auth

I picked stateless JWTs with RS256 for the custom backend. The main reason is that asymmetric signing separates concerns better than HS256 - the private key stays on the server and does the signing, while the public key can be handed out to any service that needs to verify tokens. If you're running a single Express app this is arguably overkill, but it's the pattern I'd want in production so I went with it here.

The other practical reason is that `index.html` is built around Bearer tokens (it stores the token in an input field and sends it in the Authorization header), so JWT is the natural fit. A session-cookie approach would've been simpler in some ways since you get server-side invalidation for free, but then I wouldn't get to show how logout works with stateless tokens. Plus the Appwrite implementation uses cookies anyway, so this way the submission covers both patterns.

### How Logout Works

This is where stateless JWTs get interesting. The token is cryptographically valid until it expires, so just clearing it from the client isn't enough - if someone copied the token, they could keep using it.

To handle this, every JWT I issue gets a unique `jti` (just a UUID). When someone hits `POST /logout`, I write that `jti` into a `token_blacklist` table along with when the token was going to expire anyway. The auth middleware checks this table on every request. If your token's `jti` is in there, you get a 401. The entries are bounded by the token's original TTL, so the table never grows unbounded - old rows can be pruned with a simple `DELETE WHERE expires_at < NOW()`.

### User Data Isolation

`GET /me` doesn't take any user ID parameter at all. Not in the URL, not in query params, nowhere. It pulls the user's identity from the JWT's `sub` claim, queries the DB for that user, and returns the result. There's no input to tamper with, so IDOR just isn't possible on this endpoint.

For files, `GET /files` filters with `WHERE owner_id = $1` using the JWT identity. `GET /files/:id` does a lookup by file ID first - if the file doesn't exist you get 404, if it exists but belongs to someone else you get 403. The task spec specifically asks for this 403/404 distinction even though in production you'd probably return 404 for both to avoid leaking file existence. `GET /files/:id/download` does the same ownership check before streaming anything.

### What Appwrite Handled vs. What I Configured

Appwrite takes care of password hashing (bcrypt under the hood), session management with httpOnly cookies, rate limiting on auth endpoints, CORS, and email format validation. Basically all the auth plumbing.

What I had to set up myself: the database schema (collection attributes and types), document-level permissions so each user can only read their own documents, bucket permissions for the same reason, and the adapter layer (`appwrite-adapter.js`) that maps the REST calls from `index.html` to Appwrite SDK methods. The adapter also handles the 403/404 distinction manually since Appwrite's permission system would just block access without differentiating.

---

## Security Measures

| Layer | Measure | Details |
|-------|---------|---------|
| Password storage | Argon2id | OWASP's current top recommendation. Memory-hard (64 MB), time cost 3. |
| Token signing | RS256 (asymmetric) | 2048-bit RSA keypair. Private key never leaves the server. |
| Token revocation | Server-side blacklist | `jti` recorded in PostgreSQL on logout. Checked on every request. |
| Login errors | Generic message | "Invalid email or password" - same response whether the email exists or not. |
| Rate limiting (IP) | express-rate-limit | 100 req/15min globally, 10 req/15min on `/login`. |
| Rate limiting (account) | Per-email lockout | 5 failed attempts in 15 minutes = 429 response. Tracked in `login_attempts` table. |
| IDOR prevention | No external user ID | `/me` derives identity from the JWT only. `/files` queries filter by authenticated user. |
| Security headers | Helmet.js | Sets `X-Content-Type-Options`, `Strict-Transport-Security`, `X-Frame-Options`, etc. |

---

## What I'd Improve Given More Time

**Refresh token rotation.** Right now tokens live for 30 minutes, which is fine for a demo but in production I'd want short-lived access tokens (5 min) with a longer-lived refresh token. On each refresh you rotate the pair, so a stolen refresh token gets invalidated the next time the real user refreshes. More complex (needs a `refresh_tokens` table, a `/refresh` endpoint, reuse detection) but standard practice.

**Move the blacklist to Redis.** The token blacklist works fine in PostgreSQL but it means every authenticated request hits the DB just to check if the token was revoked. A Redis set with TTL-based expiry would be sub-millisecond and self-cleaning. At scale, this is the part where "stateless JWT" starts to feel like a lie.

**Post-quantum readiness.** RSA-2048 is fine today but won't survive a sufficiently large quantum computer. I'd look into hybrid signing with ML-DSA (the NIST-standardized version of Dilithium) or at minimum experiment with CRYSTALS-Kyber for key encapsulation. The `liboqs` Node bindings exist but aren't production-ready yet, so for now RS256 is the pragmatic choice.

**Stronger password validation.** I'm only checking length (8+ chars). A real system should check against the haveibeenpwned API or a local top-10k list, and probably enforce some character variety. Email verification too - right now anyone can register with any address.

**Integration tests.** The `index.html` client is great for manual testing but I'd want a Supertest suite that runs the full flow automatically: register, login, hit protected routes, try cross-user access, logout, confirm the token is dead. Would take maybe an afternoon to write.

---

## License

This is a task submission, not a published library. No license is specified.

