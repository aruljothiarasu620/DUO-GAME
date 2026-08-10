# Multi-stage Dockerfile for Split World Full-Stack / Backend Deployment

# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Copy root and package definitions
COPY package.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install dependencies
RUN npm install --prefix server
RUN npm install --prefix client

# Copy source code
COPY shared ./shared
COPY client ./client
COPY server ./server

# Build client dist and server dist
RUN npm run build --prefix client
RUN npm run build --prefix server

# Stage 2: Production runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy root package.json and workspace files
COPY --from=builder /app/package.json ./
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist

# Expose default port
EXPOSE 3001

# Run Node server
CMD ["node", "server/dist/index.js"]
