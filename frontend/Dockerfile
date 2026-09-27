# mamacrochet web (plan 10) — production image (Next.js standalone output).
#
# Build context is the REPO ROOT (see deploy/docker-compose.yml):
#   docker build -f frontend/Dockerfile --build-arg NEXT_PUBLIC_SITE_URL=https://… .
# NEXT_PUBLIC_* values are inlined at BUILD time, so rebuild the image when
# the public URL changes.

FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable # pnpm shim (the version is pinned in package.json)
ENV NEXT_TELEMETRY_DISABLED=1
# Public config, inlined into the client bundle at build time.
ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_SITE_URL=
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/package.json frontend/pnpm-workspace.yaml ./
COPY frontend/next.config.ts frontend/postcss.config.mjs frontend/tsconfig.json ./
COPY frontend/messages ./messages
COPY frontend/public ./public
COPY frontend/src ./src
RUN pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
# standalone = server.js + bundled node_modules; static assets + public
# must be copied over (Next expects them at these exact paths).
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
