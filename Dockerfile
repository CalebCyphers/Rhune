FROM node:20-alpine as base

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Run as non-root user
USER node

CMD ["node", "index.js"]
