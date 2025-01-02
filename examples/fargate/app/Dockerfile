FROM node:lts AS builder

WORKDIR /app

COPY package.json yarn.lock index.ts ./

RUN yarn install --frozen-lockfile
RUN npx esbuild --bundle index.ts --target="node18" --platform="node" --outfile="index.js"

FROM node:18-alpine
COPY --from=builder /app/index.js /app/index.js
EXPOSE 80
CMD ["node", "/app/index.js"]
