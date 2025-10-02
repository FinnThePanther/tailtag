import { config as loadEnv } from "dotenv";
import http from "node:http";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pRetry from "p-retry";
import * as achievementsProcessorModule from "#achievements-processor";
import type {
  AchievementEvent,
  ProcessResult,
  AwardResult,
  Achievement,
  Json,
} from "#achievements-processor";

const processorExports = (achievementsProcessorModule as unknown as {
  default?: Record<string, unknown>;
})?.default ?? achievementsProcessorModule;

const { createAchievementProcessor } =
  processorExports as typeof import("#achievements-processor");

type AwardHookPayload = {
  userId: string;
  achievement: Achievement;
  context: Json;
  event: AchievementEvent | null;
};

async function insertNotification({
  userId,
  achievement,
  context,
  event,
}: AwardHookPayload) {
  if (!userId) return;

  const notification = {
    user_id: userId,
    achievement_key: achievement.key,
    context,
    event_id: event?.id ?? null,
    event_type: event?.event_type ?? null,
  } as const;

  const { error } = await client.from("achievement_notifications").insert(notification);

  if (error) {
    if (error.code === "23505") {
      logger.debug(
        `Notification already exists for ${achievement.key} (${event?.id ?? "no-event"})`,
      );
      return;
    }
    logger.error("Failed inserting achievement notification", error);
  }
}

loadEnv();

const LOG_PREFIX = "[achievements-listener]";

const logger = {
  info: (...args: unknown[]) => console.info(LOG_PREFIX, ...args),
  warn: (...args: unknown[]) => console.warn(LOG_PREFIX, ...args),
  error: (...args: unknown[]) => console.error(LOG_PREFIX, ...args),
  debug: (...args: unknown[]) => console.debug(LOG_PREFIX, ...args),
};

function startHealthServer() {
  const port = Number.parseInt(process.env.PORT ?? "8080", 10);

  const server = http.createServer((req, res) => {
    if (!req.url || !req.method) {
      res.writeHead(400);
      res.end();
      return;
    }

    if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
      const body = JSON.stringify({ status: "ok" });
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body).toString(),
      });
      res.end(body);
      return;
    }

    if (req.method === "HEAD" && (req.url === "/" || req.url === "/health")) {
      res.writeHead(200);
      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(port, () => {
    logger.info(`Health server listening on port ${port}`);
  });

  server.on("error", (error) => {
    logger.error("Health server error", error);
  });

  return server;
}

const healthServer = startHealthServer();

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

const supabaseUrl = getEnv("SUPABASE_URL");
const serviceRoleKey =
  process.env.SERVICE_ROLE_KEY
  ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? getEnv("SERVICE_ROLE_KEY");

const client: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  realtime: {
    params: {
      eventsPerSecond: "1",
    },
  },
});

const processor = createAchievementProcessor({
  supabase: client,
  logger,
  onAwardGranted: insertNotification,
});

let queue = Promise.resolve();

function enqueue(event: AchievementEvent) {
  queue = queue
    .then(() => handleEvent(event))
    .catch((error) => {
      logger.error("Unhandled error while processing queued event", error);
    });
}

async function handleEvent(event: AchievementEvent) {
  if (event.processed_at) {
    logger.debug(`Skipping event ${event.id} - already processed`);
    return;
  }

  await pRetry(
    async () => {
      const result = await processor.processEvent(event);
      logResult(result);
    },
    {
      retries: 3,
      onFailedAttempt: (error) => {
        logger.warn(
          `Attempt ${error.attemptNumber} failed for event ${event.id}: ${(error as Error).message}`,
        );
      },
    },
  ).catch((error) => {
    logger.error(`Failed processing event ${event.id} after retries`, error);
  });
}

function logResult(result: ProcessResult) {
  if (result.skipped) {
    logger.info(`Event ${result.eventId} skipped (${result.eventType})`);
    return;
  }

  const awarded: AwardResult[] = result.awards.filter((award: AwardResult) => award.awarded);
  if (awarded.length === 0) {
    logger.info(`Event ${result.eventId} (${result.eventType}) processed – no awards`);
    return;
  }

  const summary = awarded
    .map((award) => `${award.key}→${award.userId}`)
    .join(", ");
  logger.info(`Event ${result.eventId} (${result.eventType}) awarded: ${summary}`);
}

async function runInitialSweep() {
  try {
    const { processed } = await processor.processPendingEvents({
      limitPerBatch: Number.parseInt(process.env.INITIAL_SWEEP_LIMIT ?? "50", 10),
      maxBatches: Number.parseInt(process.env.INITIAL_SWEEP_MAX_BATCHES ?? "10", 10),
    });
    if (processed > 0) {
      logger.info(`Initial sweep processed ${processed} pending events`);
    } else {
      logger.info("Initial sweep found no pending events");
    }
  } catch (error) {
    logger.error("Initial sweep failed", error);
  }
}

async function main() {
  await runInitialSweep();

  const channel = client.channel("achievements-events-listener", {
    config: {
      broadcast: { ack: true },
      presence: { key: `listener:${process.env.RENDER_SERVICE_ID ?? "local"}` },
    },
  });

  channel.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "achievement_events",
    },
    (payload) => {
      const event = payload.new as AchievementEvent;
      logger.debug(`Received event ${event.id} via realtime`);
      enqueue(event);
    },
  );

  const subscribeTimeoutMs = Number.parseInt(
    process.env.REALTIME_SUBSCRIBE_TIMEOUT_MS ?? "15000",
    10,
  );

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Realtime subscribe timed out after ${subscribeTimeoutMs}ms`));
    }, subscribeTimeoutMs);

    channel.subscribe((realtimeStatus, err) => {
      logger.info(`Realtime status changed: ${realtimeStatus}`);

      if (realtimeStatus === "SUBSCRIBED") {
        clearTimeout(timeoutId);
        resolve();
      } else if (realtimeStatus === "CHANNEL_ERROR") {
        clearTimeout(timeoutId);
        reject(err ?? new Error("Realtime channel error"));
      } else if (realtimeStatus === "CLOSED") {
        clearTimeout(timeoutId);
        reject(new Error("Realtime channel closed during subscribe"));
      } else if (realtimeStatus === "TIMED_OUT") {
        clearTimeout(timeoutId);
        reject(new Error("Realtime channel subscribe timed out"));
      }
    });
  });

  logger.info("Realtime subscription established – awaiting events");

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info(`Received ${signal}, shutting down listener`);
    await channel.unsubscribe();
    await client.removeChannel(channel);
    await new Promise<void>((resolve) => {
      healthServer.close(() => resolve());
    });
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  logger.error("Fatal error in achievements listener", error);
  process.exit(1);
});
