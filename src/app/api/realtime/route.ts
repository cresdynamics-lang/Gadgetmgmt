import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Authentication required", { status: 401 });

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const send = () => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "tick", at: Date.now() })}\n\n`));
      send();
      timer = setInterval(send, 8000);
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
