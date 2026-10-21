FROM node:22-bookworm-slim
ENV NODE_ENV=production DATA_STORE=firestore MALLOC_ARENA_MAX=2
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --chown=node:node dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/server.mjs"]
