FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production
ENV PORT=43123
EXPOSE 43123
VOLUME ["/app/data"]
CMD ["npm", "start"]
