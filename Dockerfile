FROM node:22-alpine

WORKDIR /app

RUN npm install -g pnpm@11.0.8

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma/

RUN pnpm install --frozen-lockfile
RUN pnpm prisma:generate

COPY tsconfig.json ./
COPY server ./server/

EXPOSE 4000

CMD ["pnpm", "server"]
