#!/bin/sh
set -eu
: "${POCKETBASE_SUPERUSER_EMAIL:?Set the PocketBase service account email}"
: "${POCKETBASE_SUPERUSER_PASSWORD:?Set the PocketBase service account password}"
pocketbase --dir=/pb_data --migrationsDir=/pb_migrations --hooksDir=/pb_hooks migrate up
pocketbase --dir=/pb_data --migrationsDir=/pb_migrations --hooksDir=/pb_hooks superuser upsert "$POCKETBASE_SUPERUSER_EMAIL" "$POCKETBASE_SUPERUSER_PASSWORD"
exec pocketbase serve --http=0.0.0.0:8090 --dir=/pb_data --migrationsDir=/pb_migrations --hooksDir=/pb_hooks --automigrate=false
