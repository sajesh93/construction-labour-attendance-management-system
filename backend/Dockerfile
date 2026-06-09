# ---------- Builder ----------
FROM node:20-alpine AS builder
WORKDIR /app
# Prisma needs OpenSSL on Alpine/musl, else the schema engine fails to load.
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

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
# Run migrations then start the API
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
