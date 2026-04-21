# ---- Build Stage ----
FROM node:20-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_DASHBOARD_URL
ARG NEXT_PUBLIC_BASE_URL

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_DASHBOARD_URL=$NEXT_PUBLIC_DASHBOARD_URL
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL

COPY package*.json ./
# `postinstall` runs `prisma generate`, which requires the schema to exist.
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm install

COPY . .
RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
# Avoid running `postinstall` in the slim runtime image (it would try to run
# `prisma generate` without the Prisma CLI installed).
RUN npm install --omit=dev --ignore-scripts

# Prisma client is generated at build time in the builder; copy it into the slim runtime install.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["npm", "start"]
