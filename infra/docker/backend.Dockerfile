# One image, run as two different Fly.io process groups (see infra/fly/fly.toml).
#
# infra/docker/api.Dockerfile and worker.Dockerfile stay as they are — they're
# still what CI's image-build job exercises, and what a plain "one container per
# service" host would use. This one exists because Fly's [processes] pattern runs
# both process groups from the SAME image with different start commands, and
# building the image twice for two Fly apps would only double the deploy time for
# no reason — the API and worker already share every dependency.
FROM node:22-slim
WORKDIR /repo
RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/config/package.json packages/config/
COPY packages/domain-kernel/package.json packages/domain-kernel/
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --filter @albumflow/api... --filter @albumflow/worker...

COPY packages packages
COPY apps/api apps/api
COPY apps/worker apps/worker

WORKDIR /repo
ENV NODE_ENV=production
EXPOSE 4000
# No CMD: fly.toml's [processes] supplies the command for whichever process
# group a given Machine is running.
