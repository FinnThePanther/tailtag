UPDATE public.daily_tasks
SET
  metadata = metadata || '{
    "rotation": {
      "eligible": true,
      "slot": "leaderboard",
      "difficulty": "easy",
      "family": "leaderboard_check"
    },
    "leveling": {
      "xp": 25
    }
  }'::jsonb,
  is_active = true
WHERE id = 'e9c1d39b-1cf4-4a93-80f5-d428dd286560';

UPDATE public.daily_tasks
SET
  metadata = metadata || '{
    "rotation": {
      "eligible": true,
      "slot": "catch",
      "difficulty": "easy",
      "family": "catch_volume"
    },
    "leveling": {
      "xp": 25
    }
  }'::jsonb,
  is_active = true
WHERE id = '918258d9-651d-4e24-9c61-b4703ce4852e';

UPDATE public.daily_tasks
SET
  metadata = metadata || '{
    "rotation": {
      "eligible": true,
      "slot": "catch",
      "difficulty": "medium",
      "family": "catch_volume"
    },
    "leveling": {
      "xp": 50
    }
  }'::jsonb,
  is_active = true
WHERE id = '26139b89-a341-454a-bba8-3ff38c2f51ac';

UPDATE public.daily_tasks
SET
  metadata = metadata || '{
    "rotation": {
      "eligible": false,
      "slot": "catch",
      "difficulty": "hard",
      "family": "catch_volume"
    },
    "leveling": {
      "xp": 75
    }
  }'::jsonb,
  is_active = true
WHERE id = '86765af1-77e8-4ca0-a3dc-51531dc9c6c2';

UPDATE public.daily_tasks
SET
  metadata = metadata || '{
    "rotation": {
      "eligible": true,
      "slot": "catch",
      "difficulty": "hard",
      "family": "catch_unique"
    },
    "leveling": {
      "xp": 75
    }
  }'::jsonb,
  is_active = true
WHERE id = '85a59e7b-6906-4b84-a133-95a25a1f2937';

UPDATE public.daily_tasks
SET
  metadata = metadata || '{
    "rotation": {
      "eligible": false,
      "slot": "leaderboard",
      "difficulty": "medium",
      "family": "leaderboard_check"
    },
    "leveling": {
      "xp": 25
    }
  }'::jsonb,
  is_active = true
WHERE id = 'c5914eb9-dbd2-41b0-8176-b98199e1eccf';

UPDATE public.daily_tasks
SET
  metadata = metadata || '{
    "rotation": {
      "eligible": false,
      "slot": "social",
      "difficulty": "medium",
      "family": "share_catch"
    },
    "leveling": {
      "xp": 50
    }
  }'::jsonb,
  is_active = false
WHERE id = '395a6cc9-57fd-4b8a-8293-12a02118516e';

UPDATE public.daily_tasks
SET
  metadata = metadata || '{
    "rotation": {
      "eligible": false,
      "slot": "social",
      "difficulty": "hard",
      "family": "share_catch"
    },
    "leveling": {
      "xp": 75
    }
  }'::jsonb,
  is_active = false
WHERE id = 'cb5b3440-baba-49ab-8ece-d210b71208b2';

UPDATE public.daily_tasks
SET
  metadata = metadata || '{
    "rotation": {
      "eligible": true,
      "slot": "explore",
      "difficulty": "easy",
      "family": "bio_views"
    },
    "leveling": {
      "xp": 35
    }
  }'::jsonb,
  is_active = true
WHERE id = '190aa081-2120-4a89-8b5a-0ee0cb576ce2';

UPDATE public.daily_tasks
SET
  metadata = metadata || '{
    "rotation": {
      "eligible": true,
      "slot": "explore",
      "difficulty": "medium",
      "family": "bio_views"
    },
    "leveling": {
      "xp": 60
    }
  }'::jsonb,
  is_active = true
WHERE id = '61334de8-f453-488f-9a8f-35ded68483e3';

UPDATE public.daily_tasks
SET
  metadata = metadata || '{
    "rotation": {
      "eligible": false,
      "slot": "special",
      "difficulty": "special",
      "family": "maker_metadata"
    },
    "leveling": {
      "xp": 100
    }
  }'::jsonb,
  is_active = true
WHERE id = '8b5f9a7a-8d7d-4e89-9a92-4fd4b45b8b71';

UPDATE public.daily_tasks
SET
  metadata = metadata || '{
    "rotation": {
      "eligible": false,
      "slot": "special",
      "difficulty": "special",
      "family": "maker_metadata"
    },
    "leveling": {
      "xp": 100
    }
  }'::jsonb,
  is_active = true
WHERE id = '3327bbbe-2c41-421d-ad0b-ed1c3fb22d60';

UPDATE public.daily_tasks
SET
  metadata = metadata || '{
    "rotation": {
      "eligible": false,
      "slot": "special",
      "difficulty": "special",
      "family": "maker_metadata"
    },
    "leveling": {
      "xp": 100
    }
  }'::jsonb,
  is_active = true
WHERE id = 'ee1c9130-0db4-48cf-bbb6-64f965a563c7';
