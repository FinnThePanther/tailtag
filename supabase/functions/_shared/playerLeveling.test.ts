import {
  PLAYER_XP_AMOUNTS,
  awardAchievementXp,
  getLogicalAchievementKey,
  insertLevelUpNotificationsForXpAwards,
  isDailyTaskAchievementKey,
  normalizeLogicalAchievementKey,
  type PlayerXpAwardResult,
} from './playerLeveling.ts';
import type { InsertableEventRow } from './types.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(
      message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

const event: InsertableEventRow = {
  event_id: '00000000-0000-0000-0000-000000000001',
  user_id: '00000000-0000-0000-0000-000000000002',
  type: 'catch_performed',
  convention_id: '00000000-0000-0000-0000-000000000003',
  payload: {},
  occurred_at: '2026-06-19T12:00:00.000Z',
};

Deno.test('normalizes logical achievement keys', () => {
  assertEquals(normalizeLogicalAchievementKey('  Alpha Beta!! 42  '), 'alpha_beta_42');
  assertEquals(normalizeLogicalAchievementKey('___Already-Key___'), 'already_key');
  assertEquals(normalizeLogicalAchievementKey('!!!'), null);
  assertEquals(normalizeLogicalAchievementKey(null), null);
});

Deno.test('prefers source achievement key for logical achievement XP', () => {
  assertEquals(
    getLogicalAchievementKey({
      achievement_key: 'GLOBAL_CONVENTION_CATCH_MASTER',
      user_id: event.user_id,
      awarded: true,
      context: { source_achievement_key: ' Catch Master ' },
    }),
    'catch_master',
  );

  assertEquals(
    getLogicalAchievementKey({
      achievement_key: 'GLOBAL_CONVENTION_CATCH_MASTER',
      user_id: event.user_id,
      awarded: true,
      context: {},
    }),
    'global_convention_catch_master',
  );
});

Deno.test('filters daily achievements out of logical achievement XP', async () => {
  const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const supabaseAdmin = {
    rpc: async (name: string, params: Record<string, unknown>) => {
      rpcCalls.push({ name, params });
      return {
        data: [
          {
            xp_event_id: '00000000-0000-0000-0000-000000000004',
            awarded: true,
            user_id: params.p_user_id,
            xp_amount: params.p_xp_amount,
            xp_before: 0,
            xp_after: params.p_xp_amount,
            level_before: 1,
            level_after: 2,
            leveled_up: true,
            levels_gained: 1,
          },
        ],
        error: null,
      };
    },
  };

  const results = await awardAchievementXp(
    supabaseAdmin as never,
    [
      {
        achievement_key: 'GLOBAL_CONVENTION_CATCH_MASTER',
        user_id: event.user_id,
        awarded: true,
        context: { source_achievement_key: 'Catch Master' },
      },
      {
        achievement_key: 'CONVENTION_CATCH_MASTER',
        user_id: event.user_id,
        awarded: true,
        context: { source_achievement_key: 'Catch Master' },
      },
      {
        achievement_key: 'DAILY_TASK_FIRST_CATCH',
        user_id: event.user_id,
        awarded: true,
        context: null,
      },
      {
        achievement_key: 'PROFILE_COMPLETE',
        user_id: event.user_id,
        awarded: false,
        context: null,
      },
    ],
    event,
  );

  assertEquals(results.length, 1);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].name, 'award_player_xp_once');
  assertEquals(rpcCalls[0].params.p_xp_amount, PLAYER_XP_AMOUNTS.logicalAchievement);
  assertEquals(rpcCalls[0].params.p_reason, 'logical_achievement_unlocked');
  assertEquals(rpcCalls[0].params.p_dedupe_key, 'achievement-unlocked:catch_master');
  assertEquals(isDailyTaskAchievementKey('DAILY_TASK_FIRST_CATCH'), true);
});

Deno.test('collapses level-up notifications to the highest level per user', async () => {
  const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const supabaseAdmin = {
    rpc: async (name: string, params: Record<string, unknown>) => {
      rpcCalls.push({ name, params });
      return { data: null, error: null };
    },
  };

  const results: PlayerXpAwardResult[] = [
    {
      xp_event_id: '00000000-0000-0000-0000-000000000004',
      awarded: true,
      user_id: event.user_id,
      xp_amount: 100,
      xp_before: 0,
      xp_after: 100,
      level_before: 1,
      level_after: 2,
      leveled_up: true,
      levels_gained: 1,
    },
    {
      xp_event_id: '00000000-0000-0000-0000-000000000005',
      awarded: true,
      user_id: event.user_id,
      xp_amount: 150,
      xp_before: 100,
      xp_after: 250,
      level_before: 2,
      level_after: 3,
      leveled_up: true,
      levels_gained: 1,
    },
    {
      xp_event_id: '00000000-0000-0000-0000-000000000006',
      awarded: false,
      user_id: event.user_id,
      xp_amount: 50,
      xp_before: 250,
      xp_after: 300,
      level_before: 3,
      level_after: 3,
      leveled_up: false,
      levels_gained: 0,
    },
  ];

  await insertLevelUpNotificationsForXpAwards(supabaseAdmin as never, results, event);

  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].name, 'insert_notification_once');
  assertEquals(rpcCalls[0].params.p_user_id, event.user_id);
  assertEquals(rpcCalls[0].params.p_type, 'level_up');
  assertEquals(rpcCalls[0].params.p_dedupe_key, 'level-up:3');

  const payload = rpcCalls[0].params.p_payload as Record<string, unknown>;
  assertEquals(payload.level_before, 1);
  assertEquals(payload.level_after, 3);
  assertEquals(payload.levels_gained, 2);
  assertEquals(payload.xp_after, 250);
  assertEquals(payload.xp_event_id, '00000000-0000-0000-0000-000000000005');
  assert(payload.source_event_id === event.event_id, 'Expected event id in notification payload');
});
