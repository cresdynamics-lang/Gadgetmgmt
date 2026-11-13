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
compose -f compose.runtime-candidate.yaml -f .runtime-preflight.yaml run --rm --no-deps -T nodejs node -e '
const {PrismaClient}=require("@prisma/client");
const p=new PrismaClient({log:[]});
(async()=>{try { await p.$queryRawUnsafe("SELECT 1");
const count=await p.user.count({where:{role:"OWNER",email:process.env.INITIAL_OWNER_EMAIL.trim().toLowerCase()}});
if(count!==1) throw new Error("owner selection");
console.log("Production database connection and owner selection verified.");
} catch {console.error("Production database/owner preflight failed; running service was not changed.");process.exitCode=1;} finally {await p.$disconnect();}})();'
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
