#!/bin/bash
# Start the copied Next.js app and the Cloudflare tunnel on the server.
# The tunnel token is already a mode-600 file at DEPLOY_PATH/.tunnel-token.
# This script never prints that file.
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

# A previous cloudflared can outlive its pid file. Stop only this deploy's copy
# before replacing the binary it is running.
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

port="3000"
origin="http://127.0.0.1:${port}"

# Listeners on this port, from /proc/net/tcp and /proc/net/tcp6. inode is field 10.
port_listen_inodes() {
  local hex
  hex="$(printf '%04X' "$1")"
  awk -v hex="$hex" 'NR > 1 && $4 == "0A" { split($2, addr, ":"); if (toupper(addr[2]) == hex) print $10 }' /proc/net/tcp /proc/net/tcp6 2>/dev/null | sort -u
}

stop_port_listeners() {
  local inodes inode fd target pid
  inodes="$(port_listen_inodes "$port")"
  [ -n "$inodes" ] || return 0
  local pids=""
  for inode in $inodes; do
    for fd in /proc/[0-9]*/fd/*; do
      target="$(readlink "$fd" 2>/dev/null || true)"
      if [ "$target" = "socket:[$inode]" ]; then
        pid="${fd#/proc/}"
        pid="${pid%%/*}"
        pids="$pids $pid"
      fi
    done
  done
  pids="$(printf '%s\n' $pids | awk 'NF { print }' | sort -u)"
  if [ -z "$pids" ]; then
    echo "Blocker: port ${port} is in use, and this user cannot see the process."
    exit 1
  fi
  for pid in $pids; do
    echo "Stopping stale process ${pid} on port ${port}."
    kill "$pid" 2>/dev/null || true
  done
  sleep 1
  for pid in $pids; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
  sleep 1
  if [ -n "$(port_listen_inodes "$port")" ]; then
    echo "Blocker: port ${port} is still in use after stopping the stale process."
    exit 1
  fi
  echo "Freed port ${port}."
}

stop_port_listeners

umask 077
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

code="$(node -e 'const port=process.argv[1]; const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),15000); fetch("http://127.0.0.1:"+port+"/login",{signal:controller.signal,redirect:"manual"}).then((response)=>{clearTimeout(timer); process.stdout.write(String(response.status)); process.exit(response.status===200?0:1);}).catch(()=>{process.stdout.write("000"); process.exit(1);});' "$port" || true)"
echo "local_login_http=${code}"
echo "local_origin=${origin}"
if [ "$code" != "200" ]; then
  echo "The app did not return 200 for /login on the server."
  exit 1
fi

# Start the tunnel only after Next is listening, and aim this client at that origin.
# A remotely managed tunnel can replace this with the dashboard ingress after it connects.
nohup ./bin/cloudflared tunnel --no-autoupdate --url "$origin" run --token-file "$deploy_path/.tunnel-token" > .cloudflared.log 2>&1 &
echo $! > .cloudflared.pid

connected=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
  if grep -q 'Registered tunnel connection' .cloudflared.log 2>/dev/null; then
    connected=1
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

# Give the edge a moment to push the ingress that actually receives public traffic.
tunnel_info=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
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
        http://127.0.0.1:3000|http://localhost:3000|https://127.0.0.1:3000|https://localhost:3000)
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
else
  echo "public_host="
fi
