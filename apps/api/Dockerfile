# API de la plataforma (spec 21). Se construye desde la raíz del repo:
#   docker build -f apps/api/Dockerfile -t vitrina-api .
# Sin secretos en la imagen: todo llega por variables de entorno (regla 9).

FROM node:24.19.0-bookworm-slim AS base
ENV HUSKY=0 NX_DAEMON=false NX_NO_CLOUD=true
WORKDIR /repo
RUN corepack enable

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile && pnpm nx run api:build

# Solo dependencias de producción, sin scripts de instalación (husky y nx son de desarrollo).
FROM base AS dependencias
COPY . .
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

FROM gcr.io/distroless/nodejs24-debian12:nonroot
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencias /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist/main.js /repo/apps/api/dist/main.js.map ./apps/api/dist/
COPY --from=build /repo/apps/api/dist/registrar-hooks.js /repo/apps/api/dist/instrumentacion.js /repo/apps/api/dist/instrumentacion.js.map ./apps/api/dist/
WORKDIR /app/apps/api
EXPOSE 3000
# La imagen distroless ya arranca con node y el usuario nonroot (uid 65532).
CMD ["--enable-source-maps", "--import", "./dist/registrar-hooks.js", "--import", "./dist/instrumentacion.js", "dist/main.js"]
