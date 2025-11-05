# Stage 1: build minimal image
FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

RUN npm install --omit=dev

# Copy app source code
COPY . .

# Set environment
ENV NODE_ENV=production
ENV PORT=9000

EXPOSE 9000

CMD ["node", "server.js"]
