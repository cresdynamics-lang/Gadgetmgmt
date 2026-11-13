// One-time, explicit maintenance operation. Never changes existing database passwords.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const env = Object.fromEntries(readFileSync(".runtime.env.candidate", "utf8").trimEnd().split("\n").map(line => {
  const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)];
}));
const url = new URL(env.DATABASE_URL);
const database = decodeURIComponent(url.pathname.slice(1));
const username = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const identifier = value => '"' + value.replaceAll('"', '""') + '"';
function sql(database, query) {
  return execFileSync("sudo", ["-n", "-u", "postgres", "psql", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-d", database],
    { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
let stage = "validate target";
try {
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || database !== "gadgethub_ops" || username !== "gadgethub_ops_runtime" || password.length < 32) {
    throw new Error("Unexpected target");
  }
  stage = "verify database ownership";
  const info = JSON.parse(sql("postgres", `SELECT json_build_object('owner',r.rolname,'privileged',r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls) FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname=${literal(database)};`));
  if (info.owner !== "gadgethub_ops_app" || info.privileged) throw new Error("Unexpected database owner");
  stage = "verify owner account";
  console.log("App User table exists: " + sql(database, "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='User';"));
  console.log("Owner account count: " + sql(database, "SELECT count(*) FROM \"User\" WHERE role='OWNER';"));
  const owners = sql(database, `SELECT count(*) FROM "User" WHERE role='OWNER' AND lower(email)=${literal(env.INITIAL_OWNER_EMAIL.toLowerCase())};`);
  console.log("Configured owner email matches: " + owners);
  if (owners !== "1") throw new Error("Unexpected owner account");
  stage = "verify login does not exist";
  if (sql("postgres", `SELECT count(*) FROM pg_roles WHERE rolname=${literal(username)};`) !== "0") {
    throw new Error("Runtime role already exists; refusing to change credentials");
  }
  stage = "create database login";
  sql("postgres", `BEGIN; CREATE ROLE ${identifier(username)} LOGIN PASSWORD ${literal(password)}; GRANT ${identifier(info.owner)} TO ${identifier(username)}; COMMIT;`);
  console.log("Created dedicated production database login after verifying database ownership and the app owner account.");
} catch {
  console.error(`Failed stage: ${stage}`);
  console.error("Production database login provisioning failed; no existing passwords were changed.");
  process.exitCode = 1;
}
