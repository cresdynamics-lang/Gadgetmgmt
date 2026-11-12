#!/bin/bash
# Start the copied Next.js app and the Cloudflare tunnel on the server.
# The tunnel token is already a mode-600 file at DEPLOY_PATH/.tunnel-token.
# This script never prints that file.
set -euo pipefail

deploy_path="${1:?deploy path required}"
cd "$deploy_path"
chmod 600 .tunnel-token
chmod 755 bin/cloudflared
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
  echo "Blocker: no .env in the deploy directory, and none in the home directory. The app needs DATABASE_URL and NEXTAUTH_SECRET there. This workflow does not create that file."
  exit 1
fi

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

stop_pid .cloudflared.pid
stop_pid .next-start.pid
umask 077
nohup ./bin/cloudflared tunnel --no-autoupdate run --token-file "$deploy_path/.tunnel-token" > .cloudflared.log 2>&1 &
echo $! > .cloudflared.pid

origin=""
connected=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
  if grep -q 'Registered tunnel connection' .cloudflared.log 2>/dev/null; then
    connected=1
  fi
  origin="$(grep -oE 'https?://(127\.0\.0\.1|localhost):[0-9]{2,5}' .cloudflared.log | head -n 1 || true)"
  if [ "$connected" -eq 1 ] && [ -n "$origin" ]; then
    break
  fi
  if ! kill -0 "$(cat .cloudflared.pid)" 2>/dev/null; then
    break
  fi
  sleep 1
done

if [ "$connected" -ne 1 ]; then
  echo "cloudflared did not register a tunnel connection."
  sed -E 's/(token|TOKEN|eyJ[A-Za-z0-9_-]{8,})/***REDACTED***/g' .cloudflared.log | tail -n 40
  exit 1
fi

port="3000"
if [ -n "$origin" ]; then
  port="${origin##*:}"
else
  echo "The tunnel connected, and its ingress origin was not in the log. Starting the app on 127.0.0.1:3000. Point the tunnel at http://127.0.0.1:3000."
fi

nohup node --env-file=.env ./node_modules/next/dist/bin/next start -H 127.0.0.1 -p "$port" > .next-start.log 2>&1 &
echo $! > .next-start.pid
ready=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
  if grep -q 'Ready' .next-start.log 2>/dev/null; then
    ready=1
    break
  fi
  if ! kill -0 "$(cat .next-start.pid)" 2>/dev/null; then
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "next start did not become ready."
  sed -E 's/(SECRET|TOKEN|PASSWORD|DATABASE_URL)=[^[:space:]]*/\1=***/g' .next-start.log | tail -n 40
  exit 1
fi

code="$(node -e 'const port=process.argv[1]; fetch("http://127.0.0.1:"+port+"/login").then((response)=>{process.stdout.write(String(response.status)); process.exit(response.status===200?0:1);}).catch(()=>{process.stdout.write("000"); process.exit(1);});' "$port" || true)"
echo "local_login_http=${code}"
echo "local_origin=http://127.0.0.1:${port}"
if [ "$code" != "200" ]; then
  echo "The app did not return 200 for /login on the server."
  exit 1
fi

host="$(sed -n 's/.*"hostname":"\([^"]*\)".*/\1/p' .cloudflared.log | head -n 1 || true)"
if [ -z "$host" ]; then
  host="$(sed -n 's/.*hostname\\":\\"\([^\\]*\)\\".*/\1/p' .cloudflared.log | head -n 1 || true)"
fi
case "$host" in
  ""|*[!A-Za-z0-9.-]*) host="" ;;
esac
if [ -n "$host" ]; then
  echo "public_host=${host}"
else
  echo "public_host="
fi
