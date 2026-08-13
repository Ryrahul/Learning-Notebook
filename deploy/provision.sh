#!/usr/bin/env bash
#
# One-time server bootstrap for a bare Debian 12 / Ubuntu 24.04 box.
#
# CI/CD deploys *onto* a prepared machine; this is what prepares it. Run once
# as a sudo-capable user:
#
#   scp -r deploy devops@YOUR_HOST:~/ && ssh devops@YOUR_HOST 'sudo bash ~/deploy/provision.sh'
#
# Idempotent: safe to re-run after changing versions or config.
set -euo pipefail

APP_NAME="notebook"
APP_USER="notebook"
APP_ROOT="/srv/${APP_NAME}"
NODE_MAJOR="22"
PG_DB="learning_notebook"
PG_USER="notebook"
APP_PORT="3000"

# Public origin. Set to a real domain to get automatic HTTPS from Caddy.
# With a bare IP, Let's Encrypt cannot issue a certificate, so we serve plain
# HTTP — fine for internal testing, not for real users (see note at the end).
PUBLIC_HOST="${PUBLIC_HOST:-}"

log() { printf "\n\033[1;34m==>\033[0m %s\n" "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo bash $0" >&2
  exit 1
fi

# ---------------------------------------------------------------- base packages
log "Installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  ca-certificates curl gnupg lsb-release \
  rsync tar sudo ufw \
  postgresql postgresql-contrib \
  debian-keyring debian-archive-keyring apt-transport-https

# ---------------------------------------------------------------------- node
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt "${NODE_MAJOR}" ]]; then
  log "Installing Node.js ${NODE_MAJOR}"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
fi
log "Node: $(node -v)"

# --------------------------------------------------------------------- caddy
# Caddy terminates TLS and reverse-proxies to the app. It gets and renews
# Let's Encrypt certificates automatically when PUBLIC_HOST is a real domain.
if ! command -v caddy >/dev/null 2>&1; then
  log "Installing Caddy"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
fi

# ------------------------------------------------------------------ app user
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  log "Creating service user ${APP_USER}"
  useradd --system --create-home --home-dir "/home/${APP_USER}" --shell /usr/sbin/nologin "${APP_USER}"
fi

log "Creating ${APP_ROOT}"
mkdir -p "${APP_ROOT}"/{releases,shared,backups}
chown -R "${APP_USER}:${APP_USER}" "${APP_ROOT}"

# The deploying user (the one CI logs in as) needs to write releases and
# restart the service, without full root.
DEPLOY_USER="${SUDO_USER:-devops}"
usermod -aG "${APP_USER}" "${DEPLOY_USER}" 2>/dev/null || true
chmod -R g+rwX "${APP_ROOT}"

# sudo matches command paths literally, so use the resolved path: on Debian
# /bin is a symlink to /usr/bin and a /bin/... rule never matches.
SYSTEMCTL="$(command -v systemctl)"
cat > /etc/sudoers.d/${APP_NAME}-deploy <<EOF
# Let the deploy user manage only this service — no general root.
${DEPLOY_USER} ALL=(root) NOPASSWD: ${SYSTEMCTL} restart ${APP_NAME}, \\
  ${SYSTEMCTL} start ${APP_NAME}, ${SYSTEMCTL} stop ${APP_NAME}, \\
  ${SYSTEMCTL} status ${APP_NAME}, ${SYSTEMCTL} is-active ${APP_NAME}, \\
  ${SYSTEMCTL} reload caddy
${DEPLOY_USER} ALL=(${APP_USER}) NOPASSWD: ALL
EOF
# Reject a malformed drop-in rather than breaking sudo for everyone.
visudo -cf /etc/sudoers.d/${APP_NAME}-deploy >/dev/null
chmod 440 /etc/sudoers.d/${APP_NAME}-deploy

# ------------------------------------------------------------------ postgres
log "Configuring PostgreSQL"
systemctl enable --now postgresql

PG_PASS_FILE="${APP_ROOT}/shared/.pgpass_generated"
if [[ ! -f "${PG_PASS_FILE}" ]]; then
  openssl rand -base64 32 | tr -d '/+=' | head -c 32 > "${PG_PASS_FILE}"
  chmod 600 "${PG_PASS_FILE}"
fi
PG_PASS="$(cat "${PG_PASS_FILE}")"

sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'" | grep -q 1 \
  || sudo -u postgres psql -qc "CREATE ROLE ${PG_USER} LOGIN PASSWORD '${PG_PASS}';"
sudo -u postgres psql -qc "ALTER ROLE ${PG_USER} PASSWORD '${PG_PASS}';"

sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" | grep -q 1 \
  || sudo -u postgres createdb -O "${PG_USER}" "${PG_DB}"

# Postgres sizing for an 8 GB box shared with the app.
PG_VER="$(sudo -u postgres psql -tAc 'SHOW server_version_num' | cut -c1-2)"
PG_CONF="/etc/postgresql/${PG_VER}/main/conf.d/${APP_NAME}.conf"
mkdir -p "$(dirname "${PG_CONF}")"
cat > "${PG_CONF}" <<'EOF'
# Tuned for ~8 GB RAM shared with the Node process.
shared_buffers = 2GB
effective_cache_size = 4GB
maintenance_work_mem = 512MB
work_mem = 16MB
# Canvas rows are large jsonb rewritten on every autosave, so keep autovacuum
# aggressive or page_document bloats.
autovacuum_vacuum_scale_factor = 0.05
autovacuum_analyze_scale_factor = 0.02
EOF
systemctl restart postgresql

# ------------------------------------------------------------ shared env file
ENV_FILE="${APP_ROOT}/shared/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  log "Creating ${ENV_FILE}"
  SECRET="$(openssl rand -base64 32)"
  ORIGIN="http://$(curl -fsS --max-time 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
  [[ -n "${PUBLIC_HOST}" ]] && ORIGIN="https://${PUBLIC_HOST}"
  cat > "${ENV_FILE}" <<EOF
DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@127.0.0.1:5432/${PG_DB}"
BETTER_AUTH_SECRET="${SECRET}"
BETTER_AUTH_URL="${ORIGIN}"
NEXT_PUBLIC_APP_URL="${ORIGIN}"
NODE_ENV="production"
PORT="${APP_PORT}"
HOSTNAME="127.0.0.1"
EOF
else
  log "Keeping existing ${ENV_FILE}"
fi
chown "${APP_USER}:${APP_USER}" "${ENV_FILE}"
chmod 640 "${ENV_FILE}"

# ------------------------------------------------------------------- systemd
log "Installing systemd unit"
cat > "/etc/systemd/system/${APP_NAME}.service" <<EOF
[Unit]
Description=Notebook (Next.js)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_ROOT}/current
EnvironmentFile=${APP_ROOT}/shared/.env
ExecStart=/usr/bin/node ${APP_ROOT}/current/server.js
Restart=always
RestartSec=2
# The app binds loopback only; Caddy is the public edge.
Environment=HOSTNAME=127.0.0.1

# Hardening: it needs nothing outside its own directory.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_ROOT}
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictSUIDSGID=true

StandardOutput=journal
StandardError=journal
SyslogIdentifier=${APP_NAME}

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "${APP_NAME}" >/dev/null

# --------------------------------------------------------------------- caddy
log "Configuring Caddy"
if [[ -n "${PUBLIC_HOST}" ]]; then
  SITE="${PUBLIC_HOST}"
else
  # No domain: serve plain HTTP on :80. Automatic HTTPS needs a domain.
  SITE=":80"
fi
cat > /etc/caddy/Caddyfile <<EOF
${SITE} {
	encode zstd gzip

	# Canvas documents and pasted images can be large.
	request_body {
		max_size 16MB
	}

	# Immutable build assets — safe to cache hard because filenames are hashed.
	@static path /_next/static/*
	header @static Cache-Control "public, max-age=31536000, immutable"

	reverse_proxy 127.0.0.1:${APP_PORT}
}
EOF
caddy fmt --overwrite /etc/caddy/Caddyfile >/dev/null 2>&1 || true
systemctl enable --now caddy
systemctl reload caddy || systemctl restart caddy

# ------------------------------------------------------------------ firewall
log "Configuring firewall"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

# ------------------------------------------------------------------- backups
log "Installing nightly database backup"
cat > /etc/cron.daily/${APP_NAME}-backup <<EOF
#!/bin/sh
# Everything — including pasted images — lives in Postgres, so this dump is a
# complete backup of the application.
set -e
DIR="${APP_ROOT}/backups"
sudo -u postgres pg_dump -Fc ${PG_DB} > "\${DIR}/${PG_DB}-\$(date +%F).dump"
find "\${DIR}" -name '*.dump' -mtime +14 -delete
EOF
chmod +x /etc/cron.daily/${APP_NAME}-backup

log "Provisioning complete"
cat <<EOF

  App root     : ${APP_ROOT}
  Service      : systemctl status ${APP_NAME}
  Env file     : ${APP_ROOT}/shared/.env   (generated secrets — keep safe)
  Database     : ${PG_DB} as ${PG_USER} (loopback only)
  Backups      : ${APP_ROOT}/backups, nightly, 14-day retention

  The service will not start until the first deploy puts a release in
  ${APP_ROOT}/current — that is what the GitHub Actions workflow does.

EOF

if [[ -z "${PUBLIC_HOST}" ]]; then
  cat <<'EOF'
  NOTE: no PUBLIC_HOST set, so Caddy is serving plain HTTP on port 80.
  Session cookies are sent without the Secure flag over HTTP. Fine for
  internal testing; before real users, point a domain at this box and re-run:

      sudo PUBLIC_HOST=notebook.example.com bash ~/deploy/provision.sh

  That switches Caddy to automatic HTTPS and rewrites the auth origin.

EOF
fi
