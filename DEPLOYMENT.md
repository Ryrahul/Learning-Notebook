# Deployment

Push to `main` → GitHub Actions typechecks, lints, builds, ships an 18 MB
bundle over SSH, migrates, swaps atomically, health-checks, and rolls back if
the new release doesn't come up.

CI/CD deploys **onto a prepared machine**. A bare VM needs `provision.sh` run
once first.

---

## Shape

```text
push to main
   │
   ├─ verify   typecheck · lint · next build (standalone)   ~1.8 GB peak RAM
   │           └─ assemble release.tar.gz                   18 MB
   │
   └─ deploy   scp bundle ──▶ server
               ssh release.sh
                  ├─ unpack to releases/<ts>-<sha>
                  ├─ run migrations          ← fails here ⇒ nothing swapped
                  ├─ current ─▶ new release  ← atomic symlink swap
                  ├─ systemctl restart
                  ├─ health check (60s)      ← fails ⇒ roll back, exit 1
                  └─ prune to last 5 releases
```

On the server:

```text
/srv/notebook/
  releases/20260814093000-a1b2c3d/   the app (server.js, .next, node_modules)
  current -> releases/…              symlink the service runs from
  shared/.env                        secrets — never in git, survives deploys
  backups/                           nightly pg_dump, 14-day retention
```

---

## Current state

The production host is provisioned and serving at **http://74.225.251.245**.
CI secrets are set, and the pipeline has been exercised end to end. What is
left is a domain — until then Caddy serves plain HTTP (see the note below).

## One-time: provision the server

```bash
scp -r deploy devops@YOUR_HOST:~/
ssh devops@YOUR_HOST 'sudo bash ~/deploy/provision.sh'
```

Installs Node 22, PostgreSQL, Caddy and `ufw`; creates the `notebook` service
user, database and role; writes `/srv/notebook/shared/.env` with a generated
`BETTER_AUTH_SECRET` and database password; installs the systemd unit and a
nightly backup job.

Idempotent — re-run it any time, e.g. once DNS points at the box:

```bash
ssh devops@YOUR_HOST 'sudo PUBLIC_HOST=notebook.example.com bash ~/deploy/provision.sh'
```

That switches Caddy to automatic HTTPS and rewrites the auth origin.

> **Without a domain**, Caddy serves plain **HTTP on :80** — Let's Encrypt
> cannot issue a certificate for a bare IP. Session cookies then travel without
> the `Secure` flag. Fine for internal testing; get a domain before real users.

---

## One-time: give CI its own key

Do **not** put a personal SSH key in CI. Generate a dedicated deploy key:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/notebook_deploy -N "" -C "github-actions-notebook"

# authorise it on the server
ssh-copy-id -i ~/.ssh/notebook_deploy.pub devops@YOUR_HOST

# host key, so CI can't be MITM'd
ssh-keyscan -t ed25519 YOUR_HOST
```

### GitHub secrets — Settings → Secrets and variables → Actions

> Already configured for this repository. Re-do this only when rotating the key
> or moving hosts.

| Secret | Value |
| --- | --- |
| `DEPLOY_HOST` | server IP or hostname |
| `DEPLOY_USER` | `devops` |
| `DEPLOY_SSH_KEY` | contents of `~/.ssh/notebook_deploy` (the **private** key) |
| `DEPLOY_KNOWN_HOSTS` | output of the `ssh-keyscan` above |

### Variables (same page, "Variables" tab)

| Variable | Value |
| --- | --- |
| `PUBLIC_APP_URL` | `https://notebook.example.com` — omit to fall back to `http://<DEPLOY_HOST>` |

Application secrets (`DATABASE_URL`, `BETTER_AUTH_SECRET`) deliberately live
only in `/srv/notebook/shared/.env` on the server. CI never sees them, so a
compromised workflow cannot read the database.

---

## Deploying

Push to `main`, or run the **Deploy** workflow manually. Concurrency is capped
at one — two releases racing the `current` symlink is how you end up serving a
half-swapped app.

### Rolling back by hand

```bash
ssh devops@YOUR_HOST
ls -t /srv/notebook/releases          # pick the previous one
sudo ln -sfn /srv/notebook/releases/<id> /srv/notebook/current.new
sudo mv -Tf /srv/notebook/current.new /srv/notebook/current
sudo systemctl restart notebook
```

Migrations are **not** reversed. They are additive so far, so an older release
runs fine against a newer schema — but check before rolling back across a
migration that drops or renames anything.

### Operating

```bash
sudo systemctl status notebook
journalctl -u notebook -f
sudo -u postgres psql learning_notebook
ls -lh /srv/notebook/backups
```

---

## Why it's built this way

**Build in CI, not on the box.** `next build` peaks at **1.77 GB RSS**
(measured). Doing that on a small VM risks the OOM killer taking out Postgres
alongside it. Runners are free and disposable.

**Ship `output: "standalone"`.** The bundle is **18 MB** compressed, 70 MB
unpacked, versus ~1.2 GB if `node_modules` went along. Deploys take seconds.

**Build on Linux.** The standalone output keeps pnpm's symlinked
`node_modules` *and* traces platform-specific binaries. A macOS-built bundle
will not run on the Debian target. The workflow uses `ubuntu-latest`, and packs
with `tar` because it preserves symlinks (`cp -r` breaks them).

**Migrate before swapping.** A failed migration leaves the previous release
serving and never touches `current`.

**`drizzle-kit` never reaches production.** `scripts/migrate.mjs` drives
drizzle-orm's migrator directly against the committed `drizzle/` folder, so the
migration bookkeeping is identical to `pnpm db:migrate` locally, without the
dev toolchain on the server.

**The app binds loopback only.** Caddy is the sole public listener; `ufw`
allows 22/80/443. The systemd unit runs as an unprivileged user under
`ProtectSystem=strict` with write access to nothing but `/srv/notebook`.

---

## Known gaps

- **`page_revision` has no retention policy** and is the largest projected
  consumer of disk. Add a pruning job before it matters.
- **Single instance.** The `pg` pool is `max: 10` per process; if you scale to
  multiple instances, raise Postgres `max_connections` or add pgbouncer.
- **Heatmap days bucket in the database session's timezone**, not the viewer's.
  Fine for one region; pass the client's IANA zone if that changes.
- **No staging environment.** `main` goes straight to production.
