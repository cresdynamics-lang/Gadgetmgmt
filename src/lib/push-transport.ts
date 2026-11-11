import { sendNotification } from "web-push";

// A shared object also lets isolated tests capture provider requests without calling push services.
export const pushTransport = { sendNotification };
