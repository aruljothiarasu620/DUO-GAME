# Dockerfile for Server deployment
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

RUN npm install --prefix server
RUN npm install --prefix client

COPY shared ./shared
COPY client ./client
COPY server ./server

RUN npm run build --prefix client
RUN npm run build --prefix server

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 3001

CMD ["node", "server/dist/index.js"]
