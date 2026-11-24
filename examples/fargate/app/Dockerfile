# Keep both stages on the same Node major. Renovate keeps these tags current.
FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json index.ts ./

RUN npm ci
RUN npx esbuild --bundle index.ts --target="node24" --platform="node" --outfile="index.js"

FROM node:24-alpine
COPY --from=builder /app/index.js /app/index.js
EXPOSE 80
CMD ["node", "/app/index.js"]
