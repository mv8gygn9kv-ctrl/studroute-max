FROM node:20-alpine

# MAX API v2 uses a certificate chain rooted in the Russian Trusted CA.
# The official CA bundle is vendored in the public max-action repository.
# We verify the published SHA-256 before trusting it.
RUN apk add --no-cache ca-certificates curl \
    && mkdir -p /app/certs \
    && curl -fsSL https://raw.githubusercontent.com/Fgeeha/max-action/Master/internal/maxapi/certs/russian_trusted_ca.pem \
       -o /app/certs/russian_trusted_ca.pem \
    && echo "6d1b66e7c1aa2512ad3abb50d6a6f144c9ee9d80fd7fbe1c9255a39f8e790944  /app/certs/russian_trusted_ca.pem" \
       | sha256sum -c -

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY public ./public
COPY data ./data
COPY scripts ./scripts
COPY openapi.yaml DATA-API.yaml ./

ENV NODE_ENV=production
ENV PORT=8080
ENV NODE_EXTRA_CA_CERTS=/app/certs/russian_trusted_ca.pem

EXPOSE 8080
CMD ["node", "src/server.js"]
