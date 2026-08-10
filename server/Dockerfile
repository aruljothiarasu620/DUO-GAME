# Dockerfile for server
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/
COPY shared ./shared

RUN npm run install:all

COPY server ./server
COPY client ./client

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

COPY package.json ./
COPY server/package*.json ./server/
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/shared ./shared

EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

CMD ["node", "server/dist/index.js"]
