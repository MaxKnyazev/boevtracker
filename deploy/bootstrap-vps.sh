#!/usr/bin/env bash
# Bootstrap BoevTracker on a fresh Ubuntu 22.04/24.04 VPS (REG.RU or similar).
# Run as root once: bash bootstrap-vps.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/boevtracker}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
REPO_URL="${REPO_URL:-}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root (sudo)."
  exit 1
fi

if [[ -z "$REPO_URL" ]]; then
  echo "Usage: REPO_URL=git@github.com:ORG/boevtracker.git bash bootstrap-vps.sh"
  echo "   or: REPO_URL=https://github.com/ORG/boevtracker.git bash bootstrap-vps.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git ufw

# Docker Engine + Compose plugin
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# Deploy user
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"

mkdir -p /home/"$DEPLOY_USER"/.ssh
chmod 700 /home/"$DEPLOY_USER"/.ssh
touch /home/"$DEPLOY_USER"/.ssh/authorized_keys
chmod 600 /home/"$DEPLOY_USER"/.ssh/authorized_keys
chown -R "$DEPLOY_USER":"$DEPLOY_USER" /home/"$DEPLOY_USER"/.ssh

# Firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# App directory
mkdir -p "$(dirname "$APP_DIR")"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$APP_DIR"

if [[ ! -f "$APP_DIR/.env" ]]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  chown "$DEPLOY_USER":"$DEPLOY_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo
  echo "==> Created $APP_DIR/.env from .env.example"
  echo "==> Edit secrets before first start:"
  echo "    sudo -u $DEPLOY_USER nano $APP_DIR/.env"
fi

echo
echo "Bootstrap complete."
echo
echo "Next steps:"
echo "  1. Add your GitHub Actions deploy public key to:"
echo "       /home/$DEPLOY_USER/.ssh/authorized_keys"
echo "  2. Edit $APP_DIR/.env (DOMAIN, passwords, JWT/COOKIE secrets, CORS_ORIGIN, S3_PUBLIC_URL)"
echo "  3. Point DNS A-record of DOMAIN to this server IP"
echo "  4. First start:"
echo "       cd $APP_DIR"
echo "       sudo -u $DEPLOY_USER docker compose -f docker-compose.prod.yml --env-file .env up -d --build"
echo "  5. Create admin user (see deploy/README.md)"
echo "  6. Add GitHub Secrets: VPS_HOST, VPS_USER=$DEPLOY_USER, VPS_SSH_KEY, VPS_PORT=22"
