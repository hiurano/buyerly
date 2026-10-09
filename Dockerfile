# One image for the whole application: the React build is served by the API.

FROM node:22-alpine AS frontend

WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/index.html frontend/postcss.config.js frontend/tailwind.config.js ./
COPY frontend/tsconfig.json frontend/tsconfig.node.json frontend/vite.config.ts ./
COPY frontend/public ./public
COPY frontend/src ./src
# The release sha, so an open tab can tell when the server runs a newer one.
ARG APP_VERSION=local
ENV APP_VERSION=${APP_VERSION}
RUN npm run build

FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    tzdata \
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
COPY scripts/rotate_meta_tokens.py ./scripts/rotate_meta_tokens.py
COPY scripts/set_user_password.py ./scripts/set_user_password.py
COPY --from=frontend /frontend/dist ./frontend/dist

# The command is selected per service in docker-compose.yml.
CMD ["python", "-m", "services.api"]
