# Dairy Farm API. Build from the repository root:  docker compose -f deploy/docker-compose.yml build
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

# Install only the server's packages (the mobile app's are not needed here).
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci -w packages/shared -w apps/api --include-workspace-root --ignore-scripts --include=dev

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w packages/shared && npm run build -w apps/api

WORKDIR /app/apps/api
EXPOSE 3000
# Apply any new database changes, then start.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
