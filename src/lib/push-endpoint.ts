import { z } from "zod";

export const pushEndpoint = z.url().max(2048).refine((value) => {
  const url = new URL(value);
  // Push endpoints are fetched by the worker. Restrict them to browser push services.
  return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") &&
    ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com", "wns.windows.com", "notify.windows.com"].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
});
