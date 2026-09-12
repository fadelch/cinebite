# CineBite

CineBite is the foundation for a platform that will allow cinema customers to order food and have it delivered directly to their seats.

## Current Phase

**Phase 1 — Project Foundation**

This phase contains only the Next.js foundation, Firebase client and server configuration, environment validation, a health endpoint, and baseline security headers. Cinema ordering features are intentionally deferred to later phases.

## Technology

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Firebase Client SDK and Admin SDK
- Zod
- ESLint
- Vercel-ready environment configuration

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local`.
3. Add the Firebase client credentials from **Firebase Console → Project settings → General → Your apps → Web app**.
4. Add Firebase Admin credentials from **Firebase Console → Project settings → Service accounts → Generate new private key**. Copy `project_id`, `client_email`, and `private_key` into their matching environment variables. Keep the private key quoted if it contains escaped `\n` characters.
5. Start the development server:

   ```bash
   npm run dev
   ```

The health check is available at `GET /api/health`.

## Environment variables

Client-safe values:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Server-only values:

```env
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
```

## Security

`.env.local` must never be committed. Firebase Admin credentials are validated and used only in server-only modules. Service-account JSON and private key files are ignored by Git. Production secrets will be configured in Vercel project settings when deployment begins.
