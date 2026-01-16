# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

# Install dependencies (including dev deps for build)
# Note: Since we generated package.json manually, we assume the user will have npm available in the build environment
# or we are running this in a CI environment.
RUN apk add --no-cache openssl
RUN npm install

COPY src ./src
COPY public ./public

# Generate Prisma Client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Production Stage
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# Install only production dependencies
RUN apk add --no-cache openssl
RUN npm install --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Generate Prisma Client for production (sometimes needed if binary targets differ, but copy usually works if same OS)
RUN npx prisma generate

EXPOSE 3000

CMD sh -c "npx prisma db push --accept-data-loss && npm start"
