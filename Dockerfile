# Образ для хостингов с томами: Railway, Fly.io, собственный сервер.
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server ./server
COPY public ./public

# База и загруженные файлы лежат в /data — смонтируйте сюда том,
# иначе они пропадут при пересоздании контейнера.
ENV PORT=3000 \
    DB_PATH=/data/teamwork.db \
    UPLOAD_DIR=/data/uploads
VOLUME /data

EXPOSE 3000
CMD ["node", "server/index.js"]
