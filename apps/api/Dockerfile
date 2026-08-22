FROM node:20-alpine AS build
WORKDIR /repo
# Monorepo: build @nodo/shared + @nodo/api. Railway usa este Dockerfile desde la raíz.
RUN apk add --no-cache openssl
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile --filter @nodo/api... --filter @nodo/shared
RUN pnpm --filter @nodo/shared build
RUN pnpm --filter @nodo/api prisma:generate
RUN pnpm --filter @nodo/api build
RUN pnpm --filter @nodo/api deploy --prod /out
RUN cd /out && node_modules/.bin/prisma generate

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=build /out/dist ./dist
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/prisma ./prisma
EXPOSE 8080
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
