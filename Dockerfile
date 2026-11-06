# One image for the whole application: the React build is served by the API,
# and the TypeScript server (#611) runs from it too.

FROM node:24-slim AS frontend

# npm workspaces (#611): one lock file at the root; each stage installs only
# the workspace it builds.
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY server/package.json ./server/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --workspace buyerly-frontend

COPY packages/shared ./packages/shared
WORKDIR /app/frontend
COPY frontend/index.html ./
COPY frontend/tsconfig.json frontend/tsconfig.node.json frontend/vite.config.ts ./
COPY frontend/public ./public
COPY frontend/src ./src
# The service worker (#499); vite.config.ts compiles it into dist/sw.js.
COPY frontend/sw ./sw
# The release sha, so an open tab can tell when the server runs a newer one.
ARG APP_VERSION=local
ENV APP_VERSION=${APP_VERSION}
RUN npm run build

# The TypeScript server (#611), compiled; it runs from the same image as the
# Python services, as the `server` service in docker-compose.yml.
FROM node:24-slim AS server

WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY server/package.json ./server/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --workspace @buyerly/server
COPY packages/shared ./packages/shared
COPY server/tsconfig.json server/tsconfig.build.json ./server/
COPY server/src ./server/src
RUN npm run build --workspace @buyerly/server \
    && npm ci --workspace @buyerly/server --omit=dev

FROM python:3.12-slim

WORKDIR /app

# postgresql-client and util-linux (flock) are for the backup service.
RUN apt-get update && apt-get install -y --no-install-recommends \
    tzdata \
    postgresql-client \
    util-linux \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy only production runtime ownership. Documentation, tests, captures and
# workstation utilities never enter the image.
COPY alembic.ini ./alembic.ini
COPY alembic ./alembic
COPY api ./api
COPY core ./core
COPY database ./database
COPY meta_api ./meta_api
COPY rules ./rules
COPY scheduler ./scheduler
COPY services ./services
COPY scripts/backup_service.sh scripts/backup_db.sh scripts/backup_env.sh scripts/offsite_sync.py ./scripts/
COPY --from=frontend /app/frontend/dist ./frontend/dist

# Node and the server's production dependencies, for `node server/dist/main.js`.
COPY --from=server /usr/local/bin/node /usr/local/bin/node
COPY --from=server /app/package.json ./package.json
COPY --from=server /app/node_modules ./node_modules
COPY --from=server /app/packages/shared ./packages/shared
COPY --from=server /app/server/package.json ./server/package.json
COPY --from=server /app/server/dist ./server/dist

# The command is selected per service in docker-compose.yml.
CMD ["python", "-m", "services.api"]
