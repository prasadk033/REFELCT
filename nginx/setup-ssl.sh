#!/bin/bash
set -e

# Setup SSL certificates for REFELCT Nginx Reverse Proxy
# Usage:
#   1. Self-signed certificate (for IP or staging):
#      ./nginx/setup-ssl.sh self-signed [IP_OR_HOSTNAME]
#   2. Let's Encrypt certificate (for real domain):
#      ./nginx/setup-ssl.sh letsencrypt <DOMAIN> <EMAIL>

SSL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ssl"
mkdir -p "$SSL_DIR"

MODE="${1:-self-signed}"
DOMAIN="${2:-localhost}"
EMAIL="${3:-admin@example.com}"

if [ "$MODE" = "self-signed" ]; then
    echo "Generating self-signed SSL certificate for $DOMAIN..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$SSL_DIR/privkey.pem" \
        -out "$SSL_DIR/fullchain.pem" \
        -subj "/CN=$DOMAIN/O=REFELCT/C=US"
    echo "Self-signed certificate generated at $SSL_DIR"
elif [ "$MODE" = "letsencrypt" ]; then
    if [ -z "$2" ] || [ -z "$3" ]; then
        echo "Error: Domain and Email are required for Let's Encrypt."
        echo "Usage: ./nginx/setup-ssl.sh letsencrypt <DOMAIN> <EMAIL>"
        exit 1
    fi
    echo "Acquiring Let's Encrypt certificate for $DOMAIN ($EMAIL)..."
    docker run --rm -it \
        -v "$SSL_DIR:/etc/letsencrypt/live/$DOMAIN" \
        -v "$PWD/certbot/www:/var/www/certbot" \
        certbot/certbot certonly --webroot \
        --webroot-path=/var/www/certbot \
        --email "$EMAIL" --agree-tos --no-eff-email \
        -d "$DOMAIN"
    echo "Certificate acquired successfully!"
else
    echo "Unknown mode: $MODE"
    echo "Options: self-signed | letsencrypt"
    exit 1
fi
