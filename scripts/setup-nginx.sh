#!/usr/bin/env bash
# =============================================================================
# NaijasPride — Nginx + SSL setup (run once after server-setup.sh)
# Sets up Nginx as a reverse proxy with automatic HTTPS via Certbot
# =============================================================================
# Usage:
#   bash scripts/setup-nginx.sh api.naijaspride.com
# =============================================================================
set -euo pipefail

DOMAIN="${1:-}"

if [ -z "$DOMAIN" ]; then
  echo "Usage: bash scripts/setup-nginx.sh api.naijaspride.com"
  exit 1
fi

# Default: blue stack starts on port 3001
INITIAL_PORT=3001

echo "==> Installing Nginx + Certbot"
apt-get update -q
apt-get install -y -q nginx certbot python3-certbot-nginx

echo "==> Writing Nginx config for $DOMAIN"
cat > /etc/nginx/sites-available/naijaspride <<NGINX
server {
    listen 80;
    server_name $DOMAIN;

    # Large body for file uploads
    client_max_body_size 100M;

    # Proxy to active stack (deploy.sh updates this port on every deploy)
    location / {
        proxy_pass http://localhost:$INITIAL_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/naijaspride /etc/nginx/sites-enabled/naijaspride
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

echo "==> Obtaining SSL certificate for $DOMAIN"
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@naijaspride.com"

echo "==> Setting up auto-renewal"
systemctl enable certbot.timer
systemctl start certbot.timer

echo ""
echo "============================================"
echo "  Nginx + SSL ready!"
echo "  https://$DOMAIN → localhost:$INITIAL_PORT"
echo "============================================"
