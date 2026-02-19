#!/usr/bin/env bash
# =============================================================================
# NaijasPride — Server Setup Script
# Run ONCE as root on a fresh Hetzner Ubuntu 24.04 server
# =============================================================================
# Usage:
#   ssh root@95.217.156.28
#   curl -fsSL https://raw.githubusercontent.com/Chidi09/NaijasPride/main/scripts/server-setup.sh | bash
#
# Or after cloning:
#   bash scripts/server-setup.sh
# =============================================================================
set -euo pipefail

APP_USER="chidi"
APP_DIR="/opt/naijaspride"
REPO="https://github.com/Chidi09/NaijasPride.git"

echo ""
echo "============================================"
echo "  NaijasPride Server Setup"
echo "============================================"

# ── 1. System update ─────────────────────────────────────────────────────────
echo ""
echo "==> Updating system packages"
apt-get update -q
apt-get upgrade -y -q
apt-get install -y -q \
  curl git ufw fail2ban htop nano unzip \
  ca-certificates gnupg lsb-release

# ── 2. Create app user ───────────────────────────────────────────────────────
echo ""
echo "==> Creating user: $APP_USER"
if id "$APP_USER" &>/dev/null; then
  echo "    User $APP_USER already exists, skipping"
else
  useradd -m -s /bin/bash "$APP_USER"
  usermod -aG sudo "$APP_USER"
  echo "    User $APP_USER created"
fi

# Copy root's authorized_keys to chidi so same SSH key works
echo ""
echo "==> Copying SSH authorized_keys to $APP_USER"
mkdir -p "/home/$APP_USER/.ssh"
if [ -f /root/.ssh/authorized_keys ]; then
  cp /root/.ssh/authorized_keys "/home/$APP_USER/.ssh/authorized_keys"
  chown -R "$APP_USER:$APP_USER" "/home/$APP_USER/.ssh"
  chmod 700 "/home/$APP_USER/.ssh"
  chmod 600 "/home/$APP_USER/.ssh/authorized_keys"
  echo "    Done — you can now SSH as: ssh chidi@95.217.156.28"
fi

# ── 3. Install Docker ────────────────────────────────────────────────────────
echo ""
echo "==> Installing Docker"
if command -v docker &>/dev/null; then
  echo "    Docker already installed: $(docker --version)"
else
  curl -fsSL https://get.docker.com | sh
  echo "    Docker installed"
fi

# Add chidi to docker group (no sudo needed for docker commands)
usermod -aG docker "$APP_USER"
echo "    Added $APP_USER to docker group"

# ── 4. Firewall (UFW) ────────────────────────────────────────────────────────
echo ""
echo "==> Configuring firewall"
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp    # HTTP (Nginx/Caddy reverse proxy)
ufw allow 443/tcp   # HTTPS
ufw allow 3000/tcp  # API direct (remove once Nginx is set up)
ufw --force enable
echo "    Firewall enabled"

# ── 5. Harden SSH ────────────────────────────────────────────────────────────
echo ""
echo "==> Hardening SSH"
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
systemctl reload sshd
echo "    SSH hardened (root login disabled, password auth disabled)"
echo "    IMPORTANT: Make sure your SSH key works as $APP_USER before closing this session!"

# ── 6. Clone repo ────────────────────────────────────────────────────────────
echo ""
echo "==> Setting up app directory: $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  echo "    Repo already cloned, pulling latest"
  git -C "$APP_DIR" pull
else
  git clone "$REPO" "$APP_DIR"
  echo "    Repo cloned"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ── 7. Create .env placeholder ───────────────────────────────────────────────
echo ""
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "==> Created $APP_DIR/.env from example"
  echo "    IMPORTANT: Edit $APP_DIR/.env and fill in your secrets before deploying!"
  echo "    Run: nano $APP_DIR/.env"
else
  echo "==> .env already exists, skipping"
fi

# ── 8. Make scripts executable ───────────────────────────────────────────────
chmod +x "$APP_DIR/deploy.sh"

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  Setup complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Open a NEW terminal and test SSH as chidi:"
echo "       ssh chidi@95.217.156.28"
echo ""
echo "  2. Fill in your secrets:"
echo "       nano $APP_DIR/.env"
echo ""
echo "  3. Deploy:"
echo "       cd $APP_DIR && ./deploy.sh"
echo ""
echo "  NOTE: Do NOT close this root session until step 1 works!"
