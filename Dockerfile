FROM node:20-alpine
# MAX API с 19.07.2026 использует цепочку Russian Trusted CA.
# Добавляем корневой и выпускающий сертификаты Минцифры в trust store контейнера.
RUN apk add --no-cache ca-certificates curl openssl \
    && curl -kfsSL https://gu-st.ru/content/Other/doc/russian_trusted_root_ca.cer -o /tmp/russian_root.cer \
    && curl -kfsSL https://gu-st.ru/content/Other/doc/russian_trusted_sub_ca.cer -o /tmp/russian_sub.cer \
    && (openssl x509 -in /tmp/russian_root.cer -noout >/dev/null 2>&1 \
        && openssl x509 -in /tmp/russian_root.cer -out /usr/local/share/ca-certificates/russian_trusted_root_ca.crt \
        || openssl x509 -inform DER -in /tmp/russian_root.cer -out /usr/local/share/ca-certificates/russian_trusted_root_ca.crt) \
    && (openssl x509 -in /tmp/russian_sub.cer -noout >/dev/null 2>&1 \
        && openssl x509 -in /tmp/russian_sub.cer -out /usr/local/share/ca-certificates/russian_trusted_sub_ca.crt \
        || openssl x509 -inform DER -in /tmp/russian_sub.cer -out /usr/local/share/ca-certificates/russian_trusted_sub_ca.crt) \
    && openssl x509 -in /usr/local/share/ca-certificates/russian_trusted_root_ca.crt -noout -subject | grep -F "Russian Trusted Root CA" \
    && openssl x509 -in /usr/local/share/ca-certificates/russian_trusted_sub_ca.crt -noout -subject | grep -F "Russian Trusted Sub CA" \
    && update-ca-certificates \
    && rm -f /tmp/russian_root.cer /tmp/russian_sub.cer

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY data ./data
COPY scripts ./scripts
COPY openapi.yaml DATA-API.yaml ./

ENV NODE_ENV=production
ENV PORT=8080
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

EXPOSE 8080
CMD ["node", "src/server.js"]
