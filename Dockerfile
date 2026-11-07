# One image for the whole application (#611): the TypeScript server serves
# the API, the React build and the uploads; the same image runs the worker,
# the migrations and the backup service (docker-compose.yml).

# Docker Hub's official node image through AWS's public mirror: the VPS's
# anonymous Docker Hub pulls hit its rate limit (429) and failed deploys.
FROM public.ecr.aws/docker/library/node:24-slim

WORKDIR /app

# postgresql-client and util-linux (flock) are for the backup service.
RUN apt-get update && apt-get install -y --no-install-recommends \
    tzdata \
    postgresql-client \
    util-linux \
    && rm -rf /var/lib/apt/lists/*

# npm workspaces: one lock file at the root. Every workspace's dependencies
# are installed for the build; the development ones are pruned after it.
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY server/package.json ./server/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci

COPY packages/shared ./packages/shared

# The TypeScript server.
COPY server/tsconfig.json server/tsconfig.build.json ./server/
COPY server/src ./server/src
RUN npm run build --workspace @buyerly/server

# The React app. The release sha goes into it, so an open tab can tell when
# the server runs a newer one; the service worker (#499) is compiled into
# dist/sw.js. The public site's pages are rendered from frontend/site and the
# release notes in changelog/ (#700).
COPY frontend/index.html frontend/tsconfig.json frontend/tsconfig.node.json frontend/vite.config.ts ./frontend/
COPY frontend/public ./frontend/public
COPY frontend/src ./frontend/src
COPY frontend/sw ./frontend/sw
COPY frontend/site ./frontend/site
COPY changelog ./changelog
ARG APP_VERSION=local
ENV APP_VERSION=${APP_VERSION}
RUN npm run build --workspace buyerly-frontend \
    && rm -rf frontend/src frontend/sw frontend/public frontend/site changelog \
    && npm prune --omit=dev \
    && npm cache clean --force

COPY scripts/backup_service.sh scripts/backup_db.sh scripts/backup_env.sh scripts/offsite_sync.sh ./scripts/

# The command is selected per service in docker-compose.yml.
CMD ["node", "server/dist/main.js"]
