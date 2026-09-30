# syntax=docker/dockerfile:1
# Build from the REPO ROOT, not this folder (infra/docker-compose.apps.yml does):
#   docker build -f gateway/Dockerfile .
# The gRPC clients load ../proto relative to the working directory, so the
# image mirrors the repo layout: /app/gateway + /app/proto.

# ---- build: full deps, compile TypeScript ----
FROM node:24-bookworm-slim AS build
WORKDIR /app/gateway
COPY gateway/package*.json ./
RUN npm ci
COPY gateway/ ./
RUN npm run build

# ---- runtime: production deps only (no Prisma — gateway has no database) ----
FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/gateway
COPY gateway/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/gateway/dist ./dist
COPY proto /app/proto
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
