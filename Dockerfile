FROM node:20-alpine

EXPOSE 3000

WORKDIR /app

# Install essential build tools
RUN apk add --no-cache python3 make g++ git sqlite openssl

# Set npm config for Alpine
ENV npm_config_platform=linux
ENV npm_config_arch=x64
ENV npm_config_libc=musl

# Set Node options for memory during build
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Copy configuration files first
COPY package*.json ./
COPY remix.config.js ./
COPY vite.config.ts ./
COPY tsconfig*.json ./
COPY prisma ./prisma/

# Clean install with development dependencies for build
RUN rm -rf package-lock.json node_modules && \
    npm install --include=dev

# Verify critical build packages are installed
RUN npm list vite vite-tsconfig-paths @remix-run/dev typescript || true

# Copy the rest of the application
COPY . .

# Build the application
RUN npm run build

# Clean up development dependencies after build
RUN npm prune --production
RUN npm remove @shopify/app @shopify/cli

# Use your docker-start script which includes prisma setup
CMD ["npm", "run", "docker-start"]