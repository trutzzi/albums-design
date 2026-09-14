FROM node:22-slim
WORKDIR /repo
RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/config/package.json packages/config/
COPY packages/domain-kernel/package.json packages/domain-kernel/
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --filter @albumflow/worker...

COPY packages packages
# The worker is a second entrypoint into the API's application core, so it ships with it.
COPY apps/api apps/api
COPY apps/worker apps/worker

WORKDIR /repo/apps/worker
ENV NODE_ENV=production
CMD ["pnpm", "exec", "tsx", "src/worker.ts"]
