# Messages & Alerts

All feature work belongs to `feature/email-alerts-and-inapp-notifications`.
The `/notifications` screen retains customer delivery history and adds a personal staff inbox, read state, scheduled composition, and device push controls. Every active staff role has a personal inbox. Only owners and branch managers can compose messages and view customer delivery/payment history. Managers can message active staff in their branch; owners can message across branches. Only the recipient can read or mark their inbox alerts. Senders can see their own sent/scheduled messages, read state and delivery results. Customer reminder consent and delivery are unchanged.

## Setup

1. Install dependencies and run `npm run db:generate`.
2. Apply the new migration through your existing database deployment process. On databases managed by Prisma Migrate, use `npx prisma migrate deploy`. Review migration status first: this repository contains incremental migrations rather than a complete initial database schema.
3. Add values from `docs/notifications.env.example` to `.env`. Set the shared `RESEND_API_KEY` on the server. The company owner configures the dedicated sender directly from the **Configure email** action in the inbox warning. Enter the sender email and display name and save; this persists the company identity in Postgres and applies to all staff and customer email delivery without restarting. Verify the domain in Resend using the link in that form. `EMAIL_FROM` is an optional fallback until settings are saved. The Resend account email does not select the sender. Compose requests cannot override the company identity. Generate VAPID keys with `npx web-push generate-vapid-keys`; keep the private key server-side and set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` before building. Keep this pair stable between deployments.
4. Start Redis with `docker compose up -d redis`. Redis uses AOF persistence and the required `noeviction` policy. Production Redis should be private and authenticated.
5. Run `npm run notifications:worker` as a separate supervised process alongside Next.js. It needs database, Redis, Resend and VAPID configuration. Restart it when deploying code. Multiple workers can share the queue. SIGINT/SIGTERM gracefully close queue connections.
6. Serve via HTTPS. Open `/notifications` and explicitly enable browser notifications. On iOS/iPadOS, install via Add to Home Screen first. Browser/OS policies determine actual push visibility.

## Send now

In Compose an alert, choose a recipient and select **Send now** (the default), enter the message, and click **Send now**. In-app availability starts immediately; recipients see it on their next inbox refresh. Optional email and push deliveries are enqueued immediately for the worker. They remain asynchronous and are not confirmed delivered by the save response. If Redis is unavailable, the sender sees a pending-delivery notice and the durable outbox is recovered by the worker. Select **Schedule for later** to choose a date and time instead.

## Scheduling and delivery

Postgres is the durable outbox: the POST handler commits the alert and requested delivery rows together without needing Redis. In-app alerts become visible at `scheduledAt`, including while the worker is offline. The staff inbox polls every 15 seconds. The BullMQ worker sweeps due rows every 15 seconds, adds jobs with stable delivery IDs, and retries failures five times with exponential backoff starting at 30 seconds. The queue stores delivery IDs rather than message text or addresses. The compose UI includes a request UUID; the API persists a sender-scoped unique key to prevent duplicate messages if a request is retried after a lost response. A single queue-wide rate limiter spaces job execution; permanent provider authorization/validation errors stop immediately while transient errors retry. Attempt limits persist in Postgres across Redis loss. Database status records SENT, FAILED or SKIPPED. Delivery is at least once; Resend receives a stable idempotency key (subject to its retention window), and push uses an alert tag to collapse repeats. A retry after partial device success may send the push again to successful devices. A push without subscribed devices is skipped, and expired subscriptions are deleted.

Push contains generic content to avoid exposing staff messages on lock screens. Clicking opens `/notifications`, where authentication applies. The service worker never caches authenticated content. Subscription endpoints are restricted to known browser push providers to prevent arbitrary server-side URL fetching. A device subscription is associated with the account that last enables it; shared-device users should disable browser notifications before switching accounts. No message content is sent in push payloads.

The existing `/api/cron/collections` remains the customer collections scheduler; staff BullMQ jobs do not invoke or replace its payment/stock housekeeping. Continue its existing daily deployment schedule.

## Verification

Run `npm run test:notifications`, `npx tsc --noEmit`, and `npm run build`. The browser suite `npm run test:notifications:e2e` additionally exercises the connected UI/API/database/worker path.
With configured services, create an immediate inbox alert, mark it read, and verify another user cannot see it. Schedule an alert, stop Redis/worker, then restart and verify it is delivered after its due time. Enable browser push and test with the app closed. Test a failing email provider and confirm five attempts lead to FAILED. Live providers and browser permission prompts require environment verification.


## Worker deployment

A dedicated `Dockerfile.notifications` and the Compose `notifications` profile run the worker as a non-root supervised service. After applying migrations and configuring the actual company sender, run `docker compose --profile notifications up -d --build notifications-worker`. For a database outside the bundled local Postgres, set `NOTIFICATIONS_DATABASE_URL` to its connection URL. Redis is private to the Compose network and bound only to loopback on the host. Keep `.env` out of images and Git; `.dockerignore` excludes it. Deployment can also use the existing `npm run notifications:worker` command under a process supervisor with the same environment.

The worker writes a heartbeat after each successful outbox scan. The compose panel reports worker freshness and email configuration, and prevents choosing unconfigured channels. SENT means the provider accepted the request; it does not prove inbox delivery. Bounce/delivery confirmation via provider webhooks is outside this implementation.

## End-to-end test

Install Chromium once with `npx playwright install chromium`, start Redis, then run `npm run test:notifications:e2e`. This creates a randomly named isolated Postgres schema and Redis queue, starts an isolated Next.js server on port 3117, logs in through the real browser form, and verifies sending, scheduling, mark-read persistence, sender deduplication, origin checks, cross-branch isolation and manager-only controls. It starts real BullMQ workers against a test-only captured email provider to verify acceptance, retries, permanent failures and restart recovery. The schema and queue are removed at the end. It requires a database account allowed to create/drop its isolated test schema; do not point it at a restricted production account.

An actual outbound test is opt-in: set `NOTIFICATION_LIVE_EMAIL` to an approved recipient when running the end-to-end command. That mode uses the configured company sender and real Resend key for one email after deterministic tests pass. Without that variable, no real email is sent. Verify the sender domain and production worker deployment before rollout. Browser push additionally requires VAPID configuration and a real HTTPS browser/device permission test.


## Verified in this branch

The isolated browser suite passed Send now from the real login/composition form, message persistence, duplicate request prevention, origin rejection, recipient read state, staff-only inbox access, cross-branch isolation, scheduled visibility, BullMQ email acceptance, retry after a transient failure, permanent provider rejection, and outbox recovery after restarting the worker. Email provider responses were captured fixtures, not external delivery. The production web build, TypeScript, targeted lint and six focused regression tests also passed. Company sender/domain verification, the actual production worker rollout, and real-device browser push remain environment checks. The Next.js upgrade is intentionally excluded from this branch.


## Resolve setup warnings in place

The owner can select **Configure email** directly in the email warning, enter the company's sender email/name, and save without leaving Messages & Alerts. **Edit email settings** remains available once configured. Non-owner managers see a clear instruction to ask the company owner. API keys stay in server configuration and are never returned to the browser. If the key is missing, the form explains that the server administrator must connect the email service, while still allowing the sender to be saved. The worker and customer-email helper read the saved identity for each delivery; environment changes or worker restarts are unnecessary when changing the sender.

The worker warning includes **Check delivery status**. Starting a server service remains an administrator/deployment action. Queued delivery is separate from in-app availability; in-app messages can be read while the worker is offline.
