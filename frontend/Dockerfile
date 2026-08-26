FROM node:22-alpine

RUN apk add --no-cache bash

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

COPY docker-entrypoint.sh /usr/local/bin/laurel-web
# Strip CR in case the build context was checked out on Windows with CRLF.
RUN sed -i 's/\r$//' /usr/local/bin/laurel-web && chmod +x /usr/local/bin/laurel-web

EXPOSE 5173

CMD ["laurel-web"]
