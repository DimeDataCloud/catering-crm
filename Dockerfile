FROM node:24-slim
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
ENV PORT=3011
EXPOSE 3011
CMD ["node", "server/index.js"]
