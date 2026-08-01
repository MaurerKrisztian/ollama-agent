FROM node:20-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates docker.io git procps ripgrep \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    CLIENT_DIST_DIR=/app/dist/client

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# These sources are needed only when the in-app benchmark runner builds its sandbox image.
COPY Dockerfile.benchmark tsconfig.json ./
COPY src ./src

EXPOSE 3001
CMD ["node", "dist/server/index.js"]
