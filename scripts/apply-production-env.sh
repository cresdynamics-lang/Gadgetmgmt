#!/bin/bash
# Validate candidate credentials before changing the running production service.
set -euo pipefail
cd "${1:?deploy path required}"
umask 077
export HOST_UID="$(id -u)" HOST_GID="$(id -g)"
compose() {
  if docker info >/dev/null 2>&1; then docker compose "$@";
  else sudo -n docker compose "$@"; fi
}
chmod 600 .runtime.env.candidate
cat > .runtime-preflight.yaml <<'YAML'
services:
  nodejs:
    env_file:
      - path: .runtime.env.candidate
        format: raw
YAML
cleanup() { rm -f .runtime.env.candidate .runtime-preflight.yaml compose.runtime-candidate.yaml; }
trap cleanup EXIT
# Never print Prisma errors: they can include database connection strings.
if ! compose -f compose.runtime-candidate.yaml -f .runtime-preflight.yaml run --rm --no-deps -T nodejs node -e '
const {PrismaClient}=require("@prisma/client");
const p=new PrismaClient({log:[]});
(async()=>{try { await p.$queryRawUnsafe("SELECT 1");
const count=await p.user.count({where:{role:"OWNER",email:process.env.INITIAL_OWNER_EMAIL.trim().toLowerCase()}});
if(count!==1) throw new Error("owner selection");
console.log("Production database connection and owner selection verified.");
} catch (error) {const code=error.code || error.errorCode; if(typeof code==="string" && /^[A-Z0-9_]+$/.test(code)) console.error("Database error code: "+code); console.error("Failure type: "+error.name); console.error("Database failure category: "+(/authentication failed/i.test(error.message)?"authentication":/reach database/i.test(error.message)?"unreachable":/does not exist/i.test(error.message)?"missing database": "other")); console.error("Production database/owner preflight failed; running service was not changed.");process.exitCode=1;} finally {await p.$disconnect();}})();'; then
  echo "Database service diagnostics (no credentials):"
  command -v psql || true
  command -v pg_isready >/dev/null && pg_isready || true
  if sudo -n -u postgres psql -Atqc 'SELECT current_user' 2>/dev/null; then
    echo "Local PostgreSQL administrator access is available."
    sudo -n -u postgres psql -Atqc "SELECT 'non-system database: ' || datname || ', owner: ' || pg_get_userbyid(datdba) FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres'"

  fi
  if docker info >/dev/null 2>&1; then docker ps --format '{{.Names}} {{.Image}} {{.Ports}}';
  else sudo -n docker ps --format '{{.Names}} {{.Image}} {{.Ports}}'; fi
  exit 1
fi
cp compose.yaml compose.yaml.before-runtime
had_runtime=0
if [ -f .runtime.env ]; then cp .runtime.env .runtime.env.before-runtime; had_runtime=1; fi
mv .runtime.env.candidate .runtime.env
mv compose.runtime-candidate.yaml compose.yaml
rollback() {
  cp compose.yaml.before-runtime compose.yaml
  if [ "$had_runtime" -eq 1 ]; then mv .runtime.env.before-runtime .runtime.env; else rm -f .runtime.env; fi
  compose -f compose.yaml up -d --no-build --no-deps --force-recreate nodejs
  echo "Runtime update failed; restored previous service configuration."
  exit 1
}
compose -f compose.yaml up -d --no-build --no-deps --force-recreate nodejs || rollback
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 5 -o /dev/null http://127.0.0.1:3005/login; then
    echo "Production runtime secrets applied; local login HTTP 200."
    rm -f .runtime.env.before-runtime compose.yaml.before-runtime
    exit 0
  fi
  sleep 1
done
rollback
