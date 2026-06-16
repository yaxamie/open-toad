FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
COPY tsconfig.json ./
EXPOSE 3131
CMD ["node_modules/.bin/tsx", "src/index.ts"]
