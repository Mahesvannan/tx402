FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY openapi.json ./
COPY public ./public

ENV NODE_ENV=production
EXPOSE 4021

# node:20-alpine's built-in unprivileged user — the app needs no writable
# paths or privileged ports, so there's no reason to run as root (F3).
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD node -e "fetch('http://localhost:4021/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
