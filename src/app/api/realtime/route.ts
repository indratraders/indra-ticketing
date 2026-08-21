import { getRealtimeListeners } from "@/lib/db/demo-store";
import { tokenRepository } from "@/lib/repositories";
import { nowISO } from "@/lib/utils/date";

/**
 * Server-Sent Events endpoint for real-time queue sync.
 * Isolated so it can later be replaced with WebSockets/Socket.IO.
 */
export async function GET() {
  const encoder = new TextEncoder();
  const listeners = getRealtimeListeners();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let listener: ((event: unknown) => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (listener) listeners.delete(listener);
        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      listener = send;
      listeners.add(send);

      send({
        type: "HEARTBEAT",
        payload: { version: tokenRepository.getStoreVersion() },
        timestamp: nowISO(),
      });

      heartbeat = setInterval(() => {
        send({
          type: "HEARTBEAT",
          payload: { version: tokenRepository.getStoreVersion() },
          timestamp: nowISO(),
        });
      }, 15000);
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (listener) listeners.delete(listener);
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
