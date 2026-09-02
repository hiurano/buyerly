FROM node:22-alpine AS build

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/index.html frontend/postcss.config.js frontend/tailwind.config.js ./
COPY frontend/tsconfig.json frontend/tsconfig.node.json frontend/vite.config.ts ./
COPY frontend/public ./public
COPY frontend/src ./src
RUN npm run build

FROM nginx:1.27-alpine

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY webapp/privacy.html webapp/terms.html webapp/data-deletion.html /usr/share/nginx/html/

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=4 \
    CMD wget -qO- http://127.0.0.1/health/live >/dev/null || exit 1
