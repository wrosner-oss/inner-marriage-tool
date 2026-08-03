# Inner Marriage Tool

A web app for generating personalized "Your Inner Marriage according to Shamanic
Astrology" reading **emails** for the participants of Amelia's classes.

Charts are computed locally (no scraping). Readings are assembled from Amelia's
own reusable copy — never AI-generated; gaps are flagged for her to fill. Every
reading gets a human review + edit step before a Gmail draft is created.

## Stack

Vite + React + TypeScript · Express · Prisma. Dev on SQLite, production on MySQL.
Deploys as a Docker container (Portainer) behind Pangolin.

## Develop

```bash
npm install
npm run db:migrate   # first time (SQLite dev DB)
npm run db:seed      # loads the content library
npm run dev          # API on :3001, web on :5173
```

## Build / run production

```bash
npm run build        # builds the frontend
npm start            # Express serves API + built frontend on :3001
```

See `MORNING.md` for the current status and next steps, and
`docs/superpowers/specs/` for the design spec.
