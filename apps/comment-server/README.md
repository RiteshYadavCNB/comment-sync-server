# Comment Server

Backend service for realtime component comments.

## Run

```sh
npm install
npm run dev
```

Set `DATABASE_URL` and at least one auth option:

- `PROJECT_TOKEN` for MVP deployment testing.
- `JWT_SECRET` when a real auth flow can mint project-scoped JWTs.

Clients send either token as `Authorization: Bearer <token>` for REST requests
and as `auth.token` for Socket.IO.

Create a local test token:

```sh
npm run token -w apps/comment-server -- wanderon admin 7d
```

This JWT helper requires `JWT_SECRET`. For the MVP `PROJECT_TOKEN` flow, use the
raw `PROJECT_TOKEN` value as the client token instead.

## Railway

Set `DATABASE_URL`, `PROJECT_TOKEN`, and `CORS_ORIGIN` in Railway. Add
`JWT_SECRET` only when JWT auth is enabled. Railway provides `PORT`, so do not
set it manually.

## API

- `GET /api/comments?projectId=...&componentId=...`
- `POST /api/comments`
- `PATCH /api/comments/:id/resolve`
- `PATCH /api/comments/:id/restore`

## Socket.IO events

Client to server:

- `comment:subscribe`
- `comment:create`
- `comment:resolve`
- `comment:restore`
- `comments:sync`

Server to client:

- `comments:initial`
- `comment:created`
- `comment:resolved`
- `comment:restored`
- `comment:deleted`
