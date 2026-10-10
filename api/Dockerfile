FROM node:24-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx tsc
CMD ["sh", "-c", "npx drizzle-kit migrate && node dist/seed-cli.js && node dist/server.js"]
