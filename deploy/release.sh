#!/usr/bin/env bash
#
# Server-side half of a deploy. CI uploads a release tarball, then runs this.
#
#   bash release.sh <release-id> <tarball-path>
#
# Atomic: the new release is unpacked beside the running one and only becomes
# `current` after migrations succeed. If the health check fails, the previous
# release is put back and the deploy exits non-zero.
set -euo pipefail

APP_NAME="notebook"
APP_ROOT="/srv/${APP_NAME}"
APP_USER="notebook"
KEEP_RELEASES=5
HEALTH_URL="http://127.0.0.1:3000/login"
HEALTH_TIMEOUT=60

RELEASE_ID="${1:?usage: release.sh <release-id> <tarball>}"
TARBALL="${2:?usage: release.sh <release-id> <tarball>}"
RELEASE_DIR="${APP_ROOT}/releases/${RELEASE_ID}"

log() { printf "\033[1;34m[deploy]\033[0m %s\n" "$*"; }
fail() { printf "\033[1;31m[deploy]\033[0m %s\n" "$*" >&2; exit 1; }

[[ -f "${TARBALL}" ]] || fail "tarball not found: ${TARBALL}"

PREVIOUS=""
if [[ -L "${APP_ROOT}/current" ]]; then
  PREVIOUS="$(readlink -f "${APP_ROOT}/current")"
  log "current release: $(basename "${PREVIOUS}")"
fi

# ------------------------------------------------------------------- unpack
log "unpacking ${RELEASE_ID}"
rm -rf "${RELEASE_DIR}"
mkdir -p "${RELEASE_DIR}"
tar -xzf "${TARBALL}" -C "${RELEASE_DIR}"
rm -f "${TARBALL}"

# The service reads its config from the shared env file, never from the release.
ln -sfn "${APP_ROOT}/shared/.env" "${RELEASE_DIR}/.env"
sudo chown -R "${APP_USER}:${APP_USER}" "${RELEASE_DIR}"

# ---------------------------------------------------------------- migrations
# Run BEFORE the swap. A failure here must not leave a half-deployed app, and
# migrations in this app are additive, so the old release keeps working.
log "running migrations"
set -a
# shellcheck disable=SC1091
source "${APP_ROOT}/shared/.env"
set +a
if ! (cd "${RELEASE_DIR}" && node migrate.mjs); then
  rm -rf "${RELEASE_DIR}"
  fail "migrations failed — nothing was swapped, previous release still serving"
fi

# --------------------------------------------------------------------- swap
log "switching current -> ${RELEASE_ID}"
ln -sfn "${RELEASE_DIR}" "${APP_ROOT}/current.new"
mv -Tf "${APP_ROOT}/current.new" "${APP_ROOT}/current"

sudo systemctl restart "${APP_NAME}"

# ------------------------------------------------------------- health check
log "waiting for health check"
healthy=0
for _ in $(seq 1 "${HEALTH_TIMEOUT}"); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "${HEALTH_URL}" || true)"
  if [[ "${code}" == "200" ]]; then healthy=1; break; fi
  sleep 1
done

if [[ "${healthy}" -ne 1 ]]; then
  printf "\033[1;31m[deploy]\033[0m health check failed\n" >&2
  journalctl -u "${APP_NAME}" -n 40 --no-pager >&2 || true

  if [[ -n "${PREVIOUS}" && -d "${PREVIOUS}" ]]; then
    log "rolling back to $(basename "${PREVIOUS}")"
    ln -sfn "${PREVIOUS}" "${APP_ROOT}/current.new"
    mv -Tf "${APP_ROOT}/current.new" "${APP_ROOT}/current"
    sudo systemctl restart "${APP_NAME}"
    rm -rf "${RELEASE_DIR}"
    fail "rolled back — previous release restored"
  fi
  fail "no previous release to roll back to"
fi

log "healthy"

# ------------------------------------------------------------------- prune
cd "${APP_ROOT}/releases"
# shellcheck disable=SC2012
ls -1dt */ 2>/dev/null | tail -n "+$((KEEP_RELEASES + 1))" | while read -r old; do
  [[ "$(readlink -f "${old}")" == "$(readlink -f "${APP_ROOT}/current")" ]] && continue
  log "pruning old release ${old%/}"
  rm -rf "${old}"
done

log "deployed ${RELEASE_ID}"
