import { auth } from "@/auth";
import { liveDataVersion } from "@/lib/live-version";

const CHECK_MS = 8000;

/** Sends a "changed" event only when sales, payments, stock or other shop data actually change. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Authentication required", { status: 401 });

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let last = "";
  const stream = new ReadableStream({
    start(controller) {
      const check = async () => {
        try {
          const version = await liveDataVersion();
          if (version === last) return;
          last = version;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "version", version })}\n\n`));
        } catch {
          // Database busy or unreachable: try again on the next check.
        }
      };
      void check();
      timer = setInterval(() => void check(), CHECK_MS);
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
