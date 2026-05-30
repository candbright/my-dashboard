# ============================================================
# my-dashboard (Next.js) Dockerfile
# ============================================================

FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=30002

COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline || npm install

COPY . .
RUN npm run build

EXPOSE 30002
CMD ["npm", "start"]
