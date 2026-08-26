FROM node:22-alpine

RUN apk add --no-cache bash

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npx hardhat compile

COPY docker-entrypoint.sh /usr/local/bin/laurel-chain
RUN chmod +x /usr/local/bin/laurel-chain

EXPOSE 8545

CMD ["laurel-chain"]
