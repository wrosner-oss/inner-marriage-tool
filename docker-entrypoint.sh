#!/bin/sh
set -e

# Sync the schema to the database (db push = no migration history needed for a
# single-practitioner app) and seed the content library (idempotent upserts).
echo "Syncing database schema..."
npx prisma db push --skip-generate
echo "Seeding content library..."
npx tsx prisma/seed.ts || echo "Seed skipped/failed (continuing)."

echo "Starting server..."
exec npx tsx server/index.ts
