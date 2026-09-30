# syntax=docker/dockerfile:1
# Build from the REPO ROOT, not this folder (infra/docker-compose.apps.yml does):
#   docker build -f services/notification/Dockerfile .
# main.ts loads ../../proto relative to the working directory, so the image
# mirrors the repo layout: /app/services/notification + /app/proto.

# ---- build: full deps, Prisma client, compile TypeScript ----
FROM node:24-bookworm-slim AS build
WORKDIR /app/services/notification
COPY services/notification/package*.json ./
# Nothing in this stage needs an install script, so skip them for a faster, safer build.
RUN npm ci --ignore-scripts
COPY services/notification/ ./
# prisma7.config.ts reads DATABASE_URL; `generate` never connects, it only needs a value.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate \
 && npm run build

# ---- runtime: production deps only ----
FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/services/notification
COPY services/notification/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
# The generated client lives in node_modules/.prisma — carry it over from the build stage.
COPY --from=build /app/services/notification/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/services/notification/dist ./dist
COPY proto /app/proto
USER node
EXPOSE 3005
CMD ["node", "dist/main.js"]
