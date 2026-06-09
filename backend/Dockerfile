# ---------- Builder ----------
FROM node:20-alpine AS builder
WORKDIR /app
# Prisma needs OpenSSL on Alpine/musl, else the schema engine fails to load.
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build \
  && (test -f dist/main.js || (echo "BUILD ERROR: dist/main.js missing"; ls -R dist; exit 1))

# ---------- Runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate
COPY --from=builder /app/dist ./dist
EXPOSE 3000
# Migrations are applied as a separate deploy step (not per-replica on startup,
# which causes advisory-lock contention). Just run the API here.
CMD ["node", "dist/main.js"]
