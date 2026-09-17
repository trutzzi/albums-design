#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 26.04 box. Run once, as root, over SSH:
#
#   ssh -i ~/.ssh/albumflow_deploy root@80.97.27.100 'bash -s' < infra/scripts/provision-server.sh
#
# Safe to re-run — every step either checks first or is naturally idempotent
# (apt, a swapon check, ufw allow rules, Docker's own install script).
set -euo pipefail

echo "==> Updating the base system"
apt-get update -y
apt-get upgrade -y

echo "==> Swap file"
# 4GB of RAM with no swap means one big export job (pdf-lib holds the whole
# document in memory) can get the process OOM-killed outright. Swap turns that
# into "slow" instead of "gone" — the right trade for an infrequent background
# job, and it costs nothing.
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "    created 2G swapfile"
else
  echo "    swapfile already active"
fi

echo "==> Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
else
  echo "    already installed"
fi

echo "==> Firewall"
# Only what must be public: SSH, and Caddy's 80/443 (Caddy is the one process
# that terminates TLS and reverse-proxies to the API and to MinIO — Postgres,
# Redis and the containers themselves are never exposed to the internet).
apt-get install -y ufw fail2ban
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> fail2ban"
systemctl enable --now fail2ban

echo "==> App directory"
mkdir -p /opt/albumflow
echo
echo "Done. Next: copy .env.production.example to /opt/albumflow/.env on this"
echo "server and fill in real secrets — that file must never be committed and"
echo "never leaves this box except by you editing it directly."
