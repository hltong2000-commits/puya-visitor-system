FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js db.js .env.example ./
COPY public ./public
COPY cloudbase/schema.sql ./cloudbase/schema.sql

EXPOSE 3000
CMD ["node", "server.js"]
