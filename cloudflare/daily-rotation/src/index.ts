/**
 * Cloudflare Worker: daily-rotation
 *
 * Cron-triggered worker that delegates daily task rotation to a Supabase edge
 * function. This keeps time-sensitive logic centralized while allowing Cloudflare
 * to orchestrate scheduling.
 */

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  DAILY_ROTATION_FUNCTION?: string;
}

const DEFAULT_ROTATION_FUNCTION = "rotate-dailys";

async function triggerRotation(env: Env): Promise<void> {
  const functionName = env.DAILY_ROTATION_FUNCTION ?? DEFAULT_ROTATION_FUNCTION;
  const endpoint = `${env.SUPABASE_URL}/functions/v1/${functionName}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      source: "cloudflare.cron",
      triggered_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(
      `Rotate daily tasks failed (${response.status} ${response.statusText}): ${text}`,
    );
  }
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      triggerRotation(env).catch((error) => {
        console.error("[daily-rotation] Rotation run failed", {
          scheduled_time: event.scheduledTime,
          error,
        });
      }),
    );
  },
};
