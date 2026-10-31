FROM node:20-alpine
WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund

COPY client/package*.json ./client/
RUN cd client && npm ci --no-audit --no-fund

COPY client ./client
RUN cd client && npm run build

COPY server ./server

ENV PORT=7860 NODE_ENV=production UPLOADS_DIR=/tmp/uploads
EXPOSE 7860
CMD ["node", "server/index.js"]
