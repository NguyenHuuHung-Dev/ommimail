FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @omnimail/api build
CMD ["node","apps/api/dist/server.js"]
