import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pRetry from "p-retry";
import {
  createAchievementProcessor,
  type AchievementEvent,
  type ProcessResult,
  type AwardResult,
} from "@tailtag/achievements-processor";

loadEnv();

const LOG_PREFIX = "[achievements-listener]";

const logger = {
  info: (...args: unknown[]) => console.info(LOG_PREFIX, ...args),
  warn: (...args: unknown[]) => console.warn(LOG_PREFIX, ...args),
  error: (...args: unknown[]) => console.error(LOG_PREFIX, ...args),
  debug: (...args: unknown[]) => console.debug(LOG_PREFIX, ...args),
};

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

  await channel.subscribe((realtimeStatus) => {
    logger.info(`Realtime status changed: ${realtimeStatus}`);
  });

  if (channel.state !== "joined") {
    throw new Error(`Failed to subscribe to realtime channel (state: ${channel.state})`);
  }

  logger.info("Realtime subscription established – awaiting events");

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info(`Received ${signal}, shutting down listener`);
    await channel.unsubscribe();
    await client.removeChannel(channel);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  logger.error("Fatal error in achievements listener", error);
  process.exit(1);
});
