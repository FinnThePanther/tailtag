/**
 * Cloudflare Worker: dlq-inspector
 *
 * Consumes messages from the tailtag-events-dlq dead-letter queue
 * and logs them for inspection and debugging.
 *
 * This worker is useful for:
 * - Investigating why events failed to process
 * - Debugging event payload issues
 * - Understanding error patterns
 *
 * Usage:
 * - Deploy this worker when you need to inspect failed events
 * - Messages will be logged to Cloudflare's dashboard
 * - After inspection, you can manually retry events if needed
 */

type EventRecord = {
  event_id: string;
  user_id: string;
  type: string;
  convention_id: string | null;
  payload: Record<string, unknown>;
  occurred_at: string;
};

type QueueMessage = {
  event: EventRecord;
  received_at: string;
};

function describeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
    };
  }

  if (typeof error === "object" && error !== null) {
    try {
      return {
        message: JSON.stringify(error),
      };
    } catch {
      return {
        message: String(error),
      };
    }
  }

  return { message: String(error) };
}

export default {
  async queue(batch: MessageBatch<unknown>) {
    console.log(`[dlq-inspector] Processing batch of ${batch.messages.length} failed messages`);

    for (const message of batch.messages) {
      try {
        const body = message.body as QueueMessage;

        console.log("[dlq-inspector] Failed event details:", {
          message_id: message.id,
          timestamp: message.timestamp,
          attempts: message.attempts,
          event_id: body.event?.event_id,
          event_type: body.event?.type,
          user_id: body.event?.user_id,
          convention_id: body.event?.convention_id,
          received_at: body.received_at,
          occurred_at: body.event?.occurred_at,
          payload: body.event?.payload,
        });

        // Acknowledge the message to remove it from the DLQ
        // If you want to keep messages in the DLQ for manual inspection,
        // comment out the next line
        message.ack();

      } catch (error) {
        console.error("[dlq-inspector] Error processing DLQ message:", {
          message_id: message.id,
          error: describeError(error),
        });

        // Still acknowledge malformed messages to prevent infinite loops
        message.ack();
      }
    }

    console.log(`[dlq-inspector] Finished processing batch`);
  },
};
