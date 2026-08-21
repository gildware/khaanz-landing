# ---- Build Stage ----
FROM node:20-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_DASHBOARD_URL
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_FIREBASE_PHONE_AUTH_ENABLED
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_DASHBOARD_URL=$NEXT_PUBLIC_DASHBOARD_URL
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_FIREBASE_PHONE_AUTH_ENABLED=$NEXT_PUBLIC_FIREBASE_PHONE_AUTH_ENABLED
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

COPY package*.json ./
# `postinstall` runs `prisma generate`, which requires the schema to exist.
COPY prisma/schema.prisma ./prisma/schema.prisma
# Registry drops (ECONNRESET) are common on long `npm install`; retry the fetch.
RUN set -eux; \
    i=1; \
    until npm install --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000; do \
      i=$((i + 1)); \
      if [ "$i" -gt 5 ]; then exit 1; fi; \
      echo "npm install failed, retry $i/5 in 15s"; \
      sleep 15; \
    done

COPY . .
RUN npm run build
# Drop devDependencies here so the runner can copy node_modules without a
# second registry download (that step was failing on ECONNRESET).
RUN npm prune --omit=dev

# ---- Production Stage ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Runtime: resolve latest desktop POS installers from GitHub (no rebuild needed to change repo).
ENV DESKTOP_POS_GITHUB_REPO=gildware/khaanz-desktop-pos

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Needed for `npx prisma migrate deploy` and `npm run db:seed` inside the container.
# Seed imports `src/` (menu + repositories); Prisma CLI + tsx are production dependencies.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
# Production menu upgrade script (`npm run menu:upgrade`) lives here.
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

EXPOSE 3000
CMD ["npm", "start"]
