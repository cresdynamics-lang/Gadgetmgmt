#!/bin/bash
# Start the Next.js service and the Cloudflare tunnel on one Docker network.
# The tunnel token is a mode-600 file at DEPLOY_PATH/.tunnel-token.
# NEXTAUTH_SECRET is a mode-600 file at DEPLOY_PATH/.nextauth-secret.
# This script never prints either file.
set -euo pipefail

deploy_path="${1:?deploy path required}"
cd "$deploy_path"
chmod 600 .tunnel-token
if [ -x "$deploy_path/.node/bin/node" ]; then
  export PATH="$deploy_path/.node/bin:$PATH"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Blocker: Node.js is not available on the server."
  exit 1
fi
node_version="$(node -v)"
echo "node_version=${node_version}"
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 22 ]; then
  echo "Blocker: Node.js ${node_version} is older than 22."
  exit 1
fi
if [ ! -f .env ]; then
  for candidate in "$HOME/.env" "$HOME/.env.production"; do
    if [ -f "$candidate" ]; then
      ln -s "$candidate" .env
      echo "Using an existing environment file from the home directory."
      break
    fi
  done
fi
if [ ! -f .env ]; then
  echo "Blocker: no .env in the deploy directory, and none in the home directory. The app needs DATABASE_URL there. This workflow does not create that file."
  exit 1
fi
if [ ! -f .nextauth-secret ]; then
  echo "Blocker: NEXTAUTH_SECRET was not provided to the deploy."
  exit 1
fi
chmod 600 .nextauth-secret

stop_pid() {
  local file="$1"
  if [ -f "$file" ]; then
    local pid
    pid="$(cat "$file" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$file"
  fi
}

compose() {
  if docker info >/dev/null 2>&1; then
    docker compose "$@"
    return
  fi
  if sudo -n docker info >/dev/null 2>&1; then
    sudo -n docker compose "$@"
    return
  fi
  echo "Blocker: Docker is not available to this user, and sudo is not usable without a password."
  exit 1
}

wait_for_nodejs_ready() {
  local ready=0
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
    if compose logs --no-color --tail 80 nodejs 2>/dev/null | grep -q 'Ready'; then
      ready=1
      break
    fi
    sleep 1
  done
  if [ "$ready" -ne 1 ]; then
    echo "next start did not become ready."
    compose logs --no-color --tail 40 nodejs 2>/dev/null | sed -E \
      -e 's/(SECRET|TOKEN|PASSWORD|DATABASE_URL)=[^[:space:]]*/\1=***/g' \
      -e 's#postgres(ql)?://[^[:space:]]+#postgres://***#g' || true
    exit 1
  fi
}

local_login_status() {
  compose exec -T nodejs node -e 'const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),15000); fetch("http://127.0.0.1:3005/login",{signal:controller.signal,redirect:"manual"}).then((response)=>{clearTimeout(timer); process.stdout.write(String(response.status)); process.exit(response.status===200?0:1);}).catch(()=>{process.stdout.write("000"); process.exit(1);});' || true
}

stop_pid .cloudflared.pid
stop_pid .next-start.pid

if docker info >/dev/null 2>&1 || sudo -n docker info >/dev/null 2>&1; then
  compose down --remove-orphans >/dev/null 2>&1 || true
fi

# A previous host cloudflared can outlive its pid file. Stop only this deploy's copy.
old_pids=""
for proc in /proc/[0-9]*; do
  pid="${proc##*/}"
  [ -r "$proc/cmdline" ] || continue
  cmd="$(tr '\0' ' ' < "$proc/cmdline" 2>/dev/null || true)"
  case "$cmd" in
    *"${deploy_path}/bin/cloudflared"*)
      old_pids="$old_pids $pid"
      ;;
  esac
done
for pid in $old_pids; do
  kill "$pid" 2>/dev/null || true
done
sleep 1
for pid in $old_pids; do
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
done
if [ -f bin/cloudflared.new ]; then
  mv -f bin/cloudflared.new bin/cloudflared
fi
chmod 755 bin/cloudflared

umask 077
printf 'NEXTAUTH_SECRET=%s\n' "$(tr -d '\r\n' < .nextauth-secret)" > .nextauth.env
chmod 600 .nextauth.env
# Compose always loads this file. Keep a previous public APP_BASE_URL across
# deploys so the first boot already has it and we do not bounce nodejs again
# after the tunnel hostname is confirmed.
seeded_base=""
if [ -f .public-url.env ]; then
  seeded_base="$(sed -n 's/^APP_BASE_URL=//p' .public-url.env | tr -d '\r' | head -n 1)"
fi
case "$seeded_base" in
  https://[A-Za-z0-9.-]*)
    printf 'APP_BASE_URL=%s\n' "$seeded_base" > .public-url.env
    ;;
  *)
    seeded_base=""
    : > .public-url.env
    ;;
esac
chmod 600 .public-url.env

# Compose pins authentication to the public HTTPS origin so an internal tunnel
# Host header or stale localhost value cannot redirect sign-ins off the site.
if grep -Eq '^(NEXTAUTH_URL|AUTH_URL)=https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/?$' .env 2>/dev/null; then
  echo "Ignoring localhost NEXTAUTH_URL/AUTH_URL from .env. Compose uses the public HTTPS origin."
fi

rm -rf .web-context
mkdir -p .web-context
cp Dockerfile.web .web-context/Dockerfile
cp package.json package-lock.json next.config.ts tsconfig.json .web-context/
cp -a public prisma .next node_modules .web-context/

export HOST_UID="$(id -u)"
export HOST_GID="$(id -g)"

echo "Starting the nodejs service and the tunnel. Tunnel target is http://nodejs:3005."
compose up -d --build --force-recreate

# Pass the deployment password over stdin, never through arguments, logs or app env.
if [ ! -f .initial-owner-password ]; then
  echo "Blocker: the deployment owner password was not supplied."
  exit 1
fi
chmod 600 .initial-owner-password
trap 'rm -f .initial-owner-password' EXIT
compose exec -T nodejs node --input-type=module -e "$(cat bin/sync-production-owner.mjs)" < .initial-owner-password
rm -f .initial-owner-password
trap - EXIT

wait_for_nodejs_ready
code="$(local_login_status)"
echo "local_login_http=${code}"
echo "local_origin=http://127.0.0.1:3005"
echo "tunnel_origin=http://nodejs:3005"
if [ "$code" != "200" ]; then
  echo "The app did not return 200 for /login on the server."
  compose logs --no-color --tail 40 nodejs 2>/dev/null | sed -E \
    -e 's/(SECRET|TOKEN|PASSWORD|DATABASE_URL)=[^[:space:]]*/\1=***/g' \
    -e 's#postgres(ql)?://[^[:space:]]+#postgres://***#g' || true
  exit 1
fi

compose logs --no-color --tail 200 cloudflared > .cloudflared.log 2>/dev/null || true
connected=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
  compose logs --no-color --tail 200 cloudflared > .cloudflared.log 2>/dev/null || true
  if grep -q 'Registered tunnel connection' .cloudflared.log 2>/dev/null; then
    connected=1
    break
  fi
  sleep 1
done

if [ "$connected" -ne 1 ]; then
  echo "cloudflared did not register a tunnel connection."
  sed -E 's/(token|TOKEN|eyJ[A-Za-z0-9_-]{8,})/***REDACTED***/g' .cloudflared.log | tail -n 40
  exit 1
fi

origin="http://nodejs:3005"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  compose logs --no-color --tail 200 cloudflared > .cloudflared.log 2>/dev/null || true
  if grep -q 'Updated to new configuration' .cloudflared.log 2>/dev/null; then
    break
  fi
  sleep 1
done

tunnel_info="$(node --input-type=module -e '
import { readFileSync } from "node:fs";
const text = readFileSync(".cloudflared.log", "utf8");
const services = new Set();
const hosts = new Set();
const patterns = [
  [/\\"service\\":\\"([^\\\\]*)\\"/g, services],
  [/"service":"([^"\\\\]*)"/g, services],
  [/\\"hostname\\":\\"([^\\\\]*)\\"/g, hosts],
  [/"hostname":"([^"\\\\]*)"/g, hosts],
];
for (const [pattern, bucket] of patterns) {
  for (const match of text.matchAll(pattern)) {
    if (match[1]) bucket.add(match[1]);
  }
}
const safeService = /^(https?:\/\/[A-Za-z0-9.-]+(?::[0-9]{2,5})?|http_status:[0-9]{3})$/;
const safeHost = /^[A-Za-z0-9.-]+$/;
for (const service of services) {
  if (safeService.test(service)) console.log("service " + service);
}
for (const host of hosts) {
  if (safeHost.test(host) && host.includes(".")) console.log("hostname " + host);
}
if (/Updated to new configuration config=null\b/.test(text) || /Updated to new configuration config=<nil>/.test(text)) {
  console.log("config_null 1");
}
')"

points_at_next=0
other_service=""
config_null=0
saw_service=0
host=""
while read -r kind value; do
  [ -n "$kind" ] || continue
  case "$kind" in
    service)
      saw_service=1
      case "$value" in
        "http://nodejs:3005"|"https://nodejs:3005")
          points_at_next=1
          ;;
        http_status:*)
          ;;
        *)
          other_service="$value"
          ;;
      esac
      ;;
    hostname)
      if [ -z "$host" ]; then
        host="$value"
      fi
      ;;
    config_null)
      config_null=1
      ;;
  esac
done <<< "$tunnel_info"

if [ -n "$other_service" ]; then
  echo "Blocker: the tunnel remote configuration points at ${other_service}, not ${origin}."
  exit 1
elif [ "$config_null" -eq 1 ]; then
  echo "Blocker: the tunnel connected with an empty remote configuration, so it does not point at ${origin}."
  exit 1
elif [ "$saw_service" -eq 1 ] && [ "$points_at_next" -ne 1 ]; then
  echo "Blocker: the tunnel remote configuration does not point at ${origin}."
  exit 1
else
  echo "tunnel_service=${origin}"
fi

case "$host" in
  ""|*[!A-Za-z0-9.-]*) host="" ;;
esac
if [ -n "$host" ]; then
  echo "public_host=${host}"
  desired_base="https://${host}"
  # Keep APP_BASE_URL on the public host. Skip recreate when this boot already
  # started with that value, so later pushes do not bounce the app and race the
  # public readiness check.
  if [ "$seeded_base" = "$desired_base" ]; then
    echo "app_base_url=${desired_base}"
    echo "app_base_url_recreate=skipped"
  else
    umask 077
    printf 'APP_BASE_URL=%s\n' "$desired_base" > .public-url.env
    chmod 600 .public-url.env
    # Recreate only the app so receipt and payment links use the public host.
    # Auth URLs stay cleared in compose.yaml so login redirects keep using the request host.
    compose up -d --no-deps --force-recreate nodejs >/dev/null
    wait_for_nodejs_ready
    code="$(local_login_status)"
    echo "local_login_http=${code}"
    if [ "$code" != "200" ]; then
      echo "The app did not return 200 for /login after setting APP_BASE_URL."
      compose logs --no-color --tail 40 nodejs 2>/dev/null | sed -E \
        -e 's/(SECRET|TOKEN|PASSWORD|DATABASE_URL)=[^[:space:]]*/\1=***/g' \
        -e 's#postgres(ql)?://[^[:space:]]+#postgres://***#g' || true
      exit 1
    fi
    echo "app_base_url=${desired_base}"
    echo "app_base_url_recreate=applied"
  fi
else
  echo "public_host="
fi
