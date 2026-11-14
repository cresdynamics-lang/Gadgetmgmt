# Independent device reference catalog

The collector runs as a conventional Node.js service and writes directly to PostgreSQL. It contains no AI client, makes no LLM calls, and consumes zero model tokens for collection, scheduling, health checks or watchdog recovery. The web app is only a reader/controller; stopping Next.js does not stop the standalone collector.

## Sources and coverage

| Source | Data/licence | Collected information | Boundaries |
| --- | --- | --- | --- |
| [AppleDB](https://github.com/littlebyteorg/appledb) | MIT; notice retained in `docs/licenses/appledb-MIT.txt` | Apple/Beats hardware and accessories; model/platform/board codes, lifecycle dates, colors, processor/architecture and supplied technical information | Software, SDKs, virtual machines and financial cards excluded. Retail GTIN/MPN/storage completeness is not guaranteed. |
| [Wikidata](https://www.wikidata.org/wiki/Wikidata:Data_access/en) | CC0 structured facts | Dedicated Samsung Electronics manufacturer search (Q20718), model numbers (P13351), catalog codes (P528), GTIN (P3962), aliases, manufacturer, brand when supplied and technical statements | Community data, not manufacturer certification. Families and sparse references are labeled explicitly. Unresolved fields remain unknown; no variant combinations are fabricated. |

Wikidata uses its documented Action API with `maxlag=5`, newest-created-first discovery, 25-item pages and separate detail checkpoints. Details follow discovery after at least one minute; subsequent pages normally wait 15 minutes. Complete scans wait at least 24 hours. AppleDB refreshes at most daily and uses ETag/Last-Modified conditional requests. The SPARQL service was unreliable from this environment and is not used by the implemented adapter.

Manufacturer and brand are distinct. A Samsung-manufactured OEM component is not automatically Samsung-branded. Public model/part/product-barcode identities are distinct from individual physical serials and IMEIs, which remain in verified inventory receipts. These open datasets do not provide an exhaustive list of unique manufactured serials or every retail variant.

Apple website terms prohibit automated page scraping; Samsung robots rules also restrict Africa-region pages. This implementation uses permitted open-data APIs, not manufacturer page scraping, proxy/IP rotation, CAPTCHA bypass or hidden/private endpoints. [Apple terms](https://www.apple.com/legal/internet-services/terms/site.html), [Samsung robots](https://www.samsung.com/robots.txt). Open Icecat remains a possible licensed retail enrichment source, subject to source access and coverage review; it is not integrated or misrepresented as universally open-source data.

## Persistence and safety

Five dedicated catalog tables hold source state, shared host budgets, current references, identifier aliases and append-only observations. `Product.referenceDeviceId` is an optional future linking contract; the collector never creates/updates Products, stock units, sales, prices, costs or operational movements. No automatic link or physical-stock identification is inferred.

Unchanged records do not create duplicate revisions. Actual changes and reversions append snapshots; removed identifiers remain as inactive historical aliases. Missing remote records do not delete history or imply discontinuation. Different sources/ambiguous aliases are not silently merged.

Requests share a durable per-origin budget: minimum 60 seconds plus jitter between starts; maximum 60 requests per rolling 24-hour window. Database row locks coordinate multiple worker processes. `Retry-After` seconds and dates are honored even beyond the normal retry ceiling. Network/5xx/parse failures back off exponentially from five minutes to 24 hours; 401/403 disable the source for manual review. Restarting or scheduling through the UI cannot erase host budgets or source cooldowns. Source leases expire after five minutes; interrupted imports are safe to resume.

Only fixed, reviewed HTTPS API origins are supported. Transport uses verified TLS, explicit bot identification, bounded 20-second requests and an 8 MiB response cap. It does not follow redirects. API load errors do not advance checkpoints. Sparse/invalid records are counted, and existing catalog data survives failures. Unknown/partial units are preserved as source quantities, not guessed conversions.

## Running independently

For the existing **local** `localhost/gadgethub` app database:

```sh
npm run db:generate
npm run catalog:start:local
```

The start command first makes a private database backup, applies the additive catalog migration if absent, creates a credential file with mode 0600 and builds/starts the separate `gadgethub-catalog` Compose project. The first run enables the two reviewed open-data sources. Existing pauses/403 blocks are never overridden on restart. Runtime/build files live in ignored `.catalog-state` and `.catalog-context` directories. The image contains the bundled worker, Zod, Prisma runtime and notices; it has no web server or AI runtime. It uses at most half a CPU and 384 MiB RAM.

```sh
docker compose -f compose.catalog.yaml ps
docker compose -f compose.catalog.yaml logs --tail 50 worker
docker compose -f compose.catalog.yaml restart worker
docker compose -f compose.catalog.yaml stop worker
```

Docker restarts unexpected exits. A watchdog exits on stale loop progress (five minutes) or failed heartbeats (90 seconds). Container health checks read the database heartbeat every 30 seconds. Paused workers still heartbeat and report their paused state. Provider failures back off without forcing restart, so health recovery cannot bypass rate limits. Records remain in PostgreSQL after container restart, app restart, branch changes or image rebuild. Collection requires the host and Docker/PostgreSQL to remain running.

For a foreground/operator run: `npm run catalog:worker` (`-- --once` for one eligible pass). Optional `CATALOG_DATABASE_URL` supports a dedicated database role restricted to catalog tables plus the heartbeat row/table; no JWT, email, payment or AI credentials are needed by the standalone image. A custom `CATALOG_USER_AGENT` may specify a public organizational contact URL. `CATALOG_DISCOVERY_ENABLED=false` pauses network work while retaining health reporting.

The normal production bundle also builds the independent worker/health executable; `compose.yaml` provides a separate service and production startup verifies its heartbeat after the additive migration. This branch has not been deployed to production. The local start command deliberately refuses remote/production database targets. Production source activation remains controlled by an Owner after deployment.

## Application use

- Inventory: **Reference catalog lookup**, supporting name, model, platform, historical alias or product barcode search, manufacturer filtering and bounded pagination. Lookup reads the local database; it does not call external services or an AI model.
- Owner Settings: **Device reference catalog** shows source licences, stored counts, source errors, cooldowns and worker heartbeat. Password-confirmed preferences enable/pause sources or request a future eligible check. Staff cannot manage sources.
- Authorized sales/inventory users may read references; ungranted users cannot. Reference payloads contain no buying costs, financial aggregates or physical serial/IMEI records. Successful scheduling is not reported as successful collection.

## Verification

`npm run test:device-catalog` tests normalization, public/private identifier separation, cache transport, GTIN checks, source checkpoints and retry calculations. `npm run test:device-catalog:e2e` uses only the isolated local review database and verifies leases, shared quotas, restart-safe cooldowns, observations/reversions, identifier retention and absence of stock/product/sale writes. It restores source metadata and removes only its own fixtures. After a build, `npm run test:device-catalog:browser` verifies actual Inventory/Settings controls, role boundaries, cooldown scheduling, six viewport widths and light/dark accessibility.

Live local collection has been demonstrated for both AppleDB and Samsung through the separate Docker service. Source coverage remains incomplete and community references require operational verification before use as retail variants. Adding another provider requires a reviewed licence/access policy, an explicit allowlisted API adapter, normalization tests and the shared scheduler; arbitrary URL scraping is not exposed to users.
