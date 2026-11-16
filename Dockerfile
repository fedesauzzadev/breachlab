# BreachLab — imagen mínima, sin build step (ADR D-0008).
# El aislamiento D-0003 NO vive acá: vive en el port binding del compose (127.0.0.1:3000:3000).
FROM node:24-alpine
WORKDIR /app

# Deps primero (capa cacheada): package-lock → install reproducible, solo runtime.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Código que el server sirve/ejecuta. test/, brain/, factory/, docs/screenshots quedan fuera (.dockerignore).
COPY server.js ./
COPY src/ ./src/
COPY public/ ./public/
COPY repo-sim/ ./repo-sim/
COPY docs/ ./docs/

# Dentro del contenedor el bind DEBE ser 0.0.0.0 (Docker no reacha el loopback del contenedor).
# Es el único lugar donde HOST se setea; el bot atacante sigue en 127.0.0.1 interno — mismo proceso.
ENV HOST=0.0.0.0

# No-root + data/ escribible para el usuario node (createLab la re-seedea al arrancar).
RUN mkdir -p data && chown node:node data
USER node

CMD ["node", "server.js"]
