FROM node:22-slim

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build Mastra
RUN pnpm run build

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080
CMD ["pnpm", "run", "start"]
