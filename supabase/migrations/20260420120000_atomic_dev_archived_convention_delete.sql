CREATE OR REPLACE FUNCTION public.delete_archived_convention_in_dev(
  p_convention_id uuid,
  p_actor_id uuid
)
RETURNS TABLE (
  deleted boolean,
  convention_name text,
  counts jsonb,
  cleanup_notes text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_convention_name text;
  v_status text;
  v_count integer;
  v_counts jsonb := '{}'::jsonb;
  v_cleanup_notes text[] := ARRAY[]::text[];
  v_achievement_ids uuid[] := ARRAY[]::uuid[];
  v_rule_ids uuid[] := ARRAY[]::uuid[];
  v_deletable_rule_ids uuid[] := ARRAY[]::uuid[];
  v_retained_rule_count integer := 0;
BEGIN
  SELECT c.name, c.status
    INTO v_convention_name, v_status
  FROM public.conventions c
  WHERE c.id = p_convention_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convention not found.';
  END IF;

  IF v_status <> 'archived' THEN
    RAISE EXCEPTION 'Only archived conventions can be deleted from dev.';
  END IF;

  SELECT
    COALESCE(array_agg(a.id), ARRAY[]::uuid[]),
    COALESCE(array_agg(a.rule_id) FILTER (WHERE a.rule_id IS NOT NULL), ARRAY[]::uuid[])
    INTO v_achievement_ids, v_rule_ids
  FROM public.achievements a
  WHERE a.convention_id = p_convention_id;

  DELETE FROM public.daily_assignments
  WHERE convention_id = p_convention_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('daily_assignments', v_count);

  DELETE FROM public.user_daily_progress
  WHERE convention_id = p_convention_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('user_daily_progress', v_count);

  DELETE FROM public.user_daily_streaks
  WHERE convention_id = p_convention_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('user_daily_streaks', v_count);

  DELETE FROM public.daily_tasks
  WHERE convention_id = p_convention_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('daily_tasks', v_count);

  IF array_length(v_achievement_ids, 1) IS NULL THEN
    v_count := 0;
  ELSE
    DELETE FROM public.user_achievements
    WHERE achievement_id = ANY(v_achievement_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;
  v_counts := v_counts || jsonb_build_object('user_achievements', v_count);

  DELETE FROM public.achievements
  WHERE convention_id = p_convention_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('achievements', v_count);

  IF array_length(v_rule_ids, 1) IS NULL THEN
    v_counts := v_counts || jsonb_build_object(
      'achievement_rules',
      0,
      'achievement_rules_retained',
      0
    );
  ELSE
    SELECT COUNT(DISTINCT a.rule_id)::integer
      INTO v_retained_rule_count
    FROM public.achievements a
    WHERE a.rule_id = ANY(v_rule_ids);

    SELECT COALESCE(array_agg(rule_id), ARRAY[]::uuid[])
      INTO v_deletable_rule_ids
    FROM (
      SELECT DISTINCT unnest(v_rule_ids) AS rule_id
      EXCEPT
      SELECT DISTINCT a.rule_id
      FROM public.achievements a
      WHERE a.rule_id = ANY(v_rule_ids)
    ) deletable;

    IF array_length(v_deletable_rule_ids, 1) IS NULL THEN
      v_count := 0;
    ELSE
      DELETE FROM public.achievement_rules
      WHERE rule_id = ANY(v_deletable_rule_ids);
      GET DIAGNOSTICS v_count = ROW_COUNT;
    END IF;

    v_counts := v_counts || jsonb_build_object(
      'achievement_rules',
      v_count,
      'achievement_rules_retained',
      v_retained_rule_count
    );
  END IF;

  IF to_regclass('public.suiting_sessions') IS NULL THEN
    v_cleanup_notes := array_append(
      v_cleanup_notes,
      'suiting_sessions was not available in the dev API schema; skipped.'
    );
    v_counts := v_counts || jsonb_build_object('suiting_sessions', 0);
  ELSE
    EXECUTE 'DELETE FROM public.suiting_sessions WHERE convention_id = $1'
    USING p_convention_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('suiting_sessions', v_count);
  END IF;

  IF to_regclass('public.tag_activity') IS NULL THEN
    v_cleanup_notes := array_append(
      v_cleanup_notes,
      'tag_activity was not available in the dev API schema; skipped.'
    );
    v_counts := v_counts || jsonb_build_object('tag_activity_unlinked', 0);
  ELSE
    EXECUTE 'UPDATE public.tag_activity SET convention_id = NULL WHERE convention_id = $1'
    USING p_convention_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('tag_activity_unlinked', v_count);
  END IF;

  DELETE FROM public.convention_participant_recaps
  WHERE convention_id = p_convention_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('convention_participant_recaps', v_count);

  DELETE FROM public.conventions
  WHERE id = p_convention_id
    AND status = 'archived';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Archived convention was not deleted.';
  END IF;

  INSERT INTO public.audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    context
  )
  VALUES (
    p_actor_id,
    'delete_archived_convention_dev',
    'convention',
    p_convention_id,
    jsonb_build_object(
      'convention_name',
      v_convention_name,
      'counts',
      v_counts,
      'cleanup_notes',
      v_cleanup_notes,
      'dev_only',
      true
    )
  );

  deleted := true;
  convention_name := v_convention_name;
  counts := v_counts;
  cleanup_notes := v_cleanup_notes;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_archived_convention_in_dev(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_archived_convention_in_dev(uuid, uuid) TO service_role;
