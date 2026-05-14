# Comment Sync Server

This repository provides the backend for realtime component comments.

## App

The server app is:

```txt
apps/comment-server
```

It provides:

- REST API for comments
- Socket.IO realtime updates
- MVP project-token authentication, with optional JWT authentication
- PostgreSQL persistence
- cleanup for resolved comments after 24 hours

## Environment

Create `/Users/riteshyadav/Dev/comment-sync-server/apps/comment-server/.env`:

```env
PORT=4000
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require"
PROJECT_TOKEN="replace-with-a-long-random-secret"
# Optional later, when a real auth flow can mint tokens:
# JWT_SECRET="replace-with-a-long-random-secret"
CORS_ORIGIN=http://localhost:6006,http://127.0.0.1:6006
```

At least one of `PROJECT_TOKEN` or `JWT_SECRET` is required for REST and Socket.IO auth. Use `PROJECT_TOKEN` for MVP deployment smoke tests; JWT remains available for production auth.

## Local Development

```sh
cd /Users/riteshyadav/Dev/comment-sync-server
npm install
npm run dev
```

The server listens on `http://localhost:4000` by default.

Health check:

```sh
curl http://localhost:4000/health
```

Expected response:

```json
{"ok":true}
```

## Configure A Client Token

For the MVP path, use the raw `PROJECT_TOKEN` value in Storybook as
`STORYBOOK_COMMENTS_TOKEN` or `parameters.comments.token`.

For the JWT path, use the same `JWT_SECRET` configured in `.env` to generate a
project-scoped token:


```sh
cd /Users/riteshyadav/Dev/comment-sync-server
npm run token -w apps/comment-server -- wanderon admin 7d
```

Use the generated JWT in Storybook as `STORYBOOK_COMMENTS_TOKEN` or `parameters.comments.token`.

## REST API

- `GET /api/comments?projectId=...&componentId=...`
- `POST /api/comments`
- `PATCH /api/comments/:id/resolve`
- `PATCH /api/comments/:id/restore`

All routes require a valid token. `PROJECT_TOKEN` allows MVP access to all projects; JWTs are scoped to the requested `projectId`.

The list response shape is:

```ts
{
  comments: {
    open: Comment[];
    resolved: Comment[];
  }
}
```

## Socket.IO API

Client to server:

- `comment:subscribe`
- `comments:sync`

Server to client:

- `comments:initial`
- `comment:created`
- `comment:resolved`
- `comment:restored`
- `comment:deleted`

The SDK sends comment mutations over REST. The server broadcasts mutations to the component room.

## Realtime Notification Contract

Storybook notification bells rely on the same component-room broadcasts as the
comment panel:

- `comment:created` creates an unread notification in every connected manager client.
- `comment:resolved` and `comment:restored` update unresolved counts.
- `comment:deleted` removes matching unread notifications and updates unresolved counts.
- `comments:initial` provides the current room state when a client connects.

The server should not track notification read/open state. Read state belongs to
each Storybook client because every browser may open comments independently.

For this to work, every comment mutation must emit to the room generated from:

```txt
${projectId}:component:${componentId}
```

The SDK joins this room with `comment:subscribe`; Storybook never constructs the
room directly.

## Database

The server uses PostgreSQL through `pg`.

At startup, it runs schema setup through `ensureSchema()`. Required tables:

- `comments`
- `comment_events`

Resolved comments get `delete_after = resolved_at + 24 hours`. The cleanup job runs every 10 minutes and emits `comment:deleted` events.

## Build

```sh
cd /Users/riteshyadav/Dev/comment-sync-server
npm run build
```

## Start Production Build

Run from the app directory so `.env` is loaded from `apps/comment-server`:

```sh
cd /Users/riteshyadav/Dev/comment-sync-server/apps/comment-server
npm run start
```

## Railway Deployment

Set these Railway service variables:

- `DATABASE_URL` with the Neon connection string, including `sslmode=require`
- `PROJECT_TOKEN` with a long random secret for MVP auth
- `JWT_SECRET` only if JWT auth is enabled
- `CORS_ORIGIN` with the deployed Storybook/component-library origin, or `*` for early smoke tests

Use the default root scripts unless Railway needs explicit commands:

```sh
npm run build
npm run start
```

Do not set `PORT` manually; Railway provides it at runtime.

## Vercel Notes

Set these environment variables in Vercel:

- `DATABASE_URL`
- `PROJECT_TOKEN`
- `JWT_SECRET` if JWT auth is enabled
- `CORS_ORIGIN`

Use the deployed URL for both Storybook values:

- `STORYBOOK_COMMENTS_API_BASE_URL`
- `STORYBOOK_COMMENTS_SOCKET_URL`

The backend currently uses a long-running HTTP server plus Socket.IO. Do not
deploy this exact app as a standard Vercel Serverless Function if you need
persistent WebSocket connections. Use a long-running Node host, or split REST to
Vercel and move Socket.IO to a host that supports persistent connections.
