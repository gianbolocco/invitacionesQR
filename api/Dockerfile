FROM node:24-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx tsc
# exec: node queda como PID 1 y recibe el SIGTERM del deploy. Sin eso, sh no lo
# reenvía y Docker mata el proceso a los 10 s, con requests a medio camino.
CMD ["sh", "-c", "node dist/migrate-cli.js && exec node dist/server.js"]
