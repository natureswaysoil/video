# Build stage
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
# Do not hide TypeScript build failures. A bad build should fail here,
# instead of deploying an image with missing files in /app/dist.
RUN npm run build

# Runtime stage
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
# Default envs can be overridden at deploy time
ENV NODE_ENV=production
ENV RUN_ONCE=true
CMD ["node", "dist/cli.js"]
