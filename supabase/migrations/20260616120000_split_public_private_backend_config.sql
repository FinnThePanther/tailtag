BEGIN;

CREATE SCHEMA IF NOT EXISTS app_private;

REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO service_role;

CREATE TABLE IF NOT EXISTS app_private.backend_runtime_config (
  config_name text PRIMARY KEY,
  description text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT backend_runtime_config_config_object_check
    CHECK (jsonb_typeof(config) = 'object')
);

ALTER TABLE app_private.backend_runtime_config ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE app_private.backend_runtime_config FROM PUBLIC;
REVOKE ALL ON TABLE app_private.backend_runtime_config FROM anon;
REVOKE ALL ON TABLE app_private.backend_runtime_config FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app_private.backend_runtime_config TO service_role;

DROP POLICY IF EXISTS "backend_runtime_config_service_role_select"
  ON app_private.backend_runtime_config;
CREATE POLICY "backend_runtime_config_service_role_select"
  ON app_private.backend_runtime_config FOR SELECT TO public
  USING ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS "backend_runtime_config_service_role_insert"
  ON app_private.backend_runtime_config;
CREATE POLICY "backend_runtime_config_service_role_insert"
  ON app_private.backend_runtime_config FOR INSERT TO public
  WITH CHECK ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS "backend_runtime_config_service_role_update"
  ON app_private.backend_runtime_config;
CREATE POLICY "backend_runtime_config_service_role_update"
  ON app_private.backend_runtime_config FOR UPDATE TO public
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS "backend_runtime_config_service_role_delete"
  ON app_private.backend_runtime_config;
CREATE POLICY "backend_runtime_config_service_role_delete"
  ON app_private.backend_runtime_config FOR DELETE TO public
  USING ((SELECT auth.role()) = 'service_role');

WITH private_defaults(config_name, description, fallback_value) AS (
  VALUES
    (
      'gameplay_queue_enabled',
      'Enable durable gameplay event queue ingestion',
      'true'::jsonb
    ),
    (
      'gameplay_queue_wakeup_enabled',
      'Allow gameplay event writers to wake the queue worker after enqueue',
      'true'::jsonb
    ),
    (
      'gameplay_inline_processing_enabled',
      'Enable inline gameplay reward processing during event ingestion',
      'false'::jsonb
    ),
    (
      'gameplay_queue_batch_size',
      'Maximum gameplay queue messages claimed per worker batch',
      '25'::jsonb
    ),
    (
      'gameplay_queue_visibility_timeout_seconds',
      'Gameplay queue message visibility timeout while a worker processes it',
      '30'::jsonb
    ),
    (
      'gameplay_queue_max_attempts',
      'Maximum gameplay queue read attempts before an event is dead-lettered',
      '8'::jsonb
    ),
    (
      'gameplay_queue_wakeup_max_messages',
      'Maximum gameplay queue messages processed by an opportunistic wakeup',
      '6'::jsonb
    ),
    (
      'gameplay_queue_wakeup_max_duration_ms',
      'Maximum runtime in milliseconds for an opportunistic gameplay queue wakeup',
      '2500'::jsonb
    ),
    (
      'legacy_event_processor_enabled',
      'Allow the legacy achievement processor rollback worker to claim unprocessed events',
      'false'::jsonb
    )
),
resolved_values AS (
  SELECT
    d.config_name,
    d.description,
    jsonb_build_object(
      'value',
      COALESCE(
        (
          SELECT CASE
            WHEN jsonb_typeof(c.config) = 'object' AND c.config ? 'value' THEN c.config->'value'
            ELSE c.config
          END
          FROM app_private.backend_runtime_config c
          WHERE c.config_name = d.config_name
          LIMIT 1
        ),
        (
          SELECT CASE
            WHEN jsonb_typeof(e.config) = 'object' AND e.config ? 'value' THEN e.config->'value'
            ELSE e.config
          END
          FROM public.edge_function_config e
          WHERE e.function_name = d.config_name
          LIMIT 1
        ),
        d.fallback_value
      )
    ) AS config
  FROM private_defaults d
)
INSERT INTO app_private.backend_runtime_config (
  config_name,
  description,
  config
)
SELECT
  config_name,
  description,
  config
FROM resolved_values
ON CONFLICT (config_name) DO UPDATE
SET
  description = excluded.description,
  config = excluded.config,
  updated_at = now();

CREATE OR REPLACE FUNCTION app_private.backend_runtime_config_value(
  p_config_name text,
  p_fallback jsonb DEFAULT null::jsonb
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'app_private', 'public', 'pg_temp'
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN jsonb_typeof(config) = 'object' AND config ? 'value' THEN config->'value'
        ELSE config
      END
      FROM app_private.backend_runtime_config
      WHERE config_name = p_config_name
      LIMIT 1
    ),
    (
      SELECT CASE
        WHEN jsonb_typeof(config) = 'object' AND config ? 'value' THEN config->'value'
        ELSE config
      END
      FROM public.edge_function_config
      WHERE function_name = p_config_name
      LIMIT 1
    ),
    p_fallback
  );
$$;

CREATE OR REPLACE FUNCTION app_private.edge_function_config_value(
  p_function_name text,
  p_fallback jsonb DEFAULT null::jsonb
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'app_private', 'public', 'pg_temp'
AS $$
  SELECT app_private.backend_runtime_config_value(p_function_name, p_fallback);
$$;

CREATE OR REPLACE FUNCTION public.read_backend_runtime_config(
  p_config_names text[]
)
RETURNS TABLE(config_name text, config jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'app_private', 'public', 'pg_temp'
AS $$
  SELECT
    c.config_name,
    c.config
  FROM app_private.backend_runtime_config c
  WHERE c.config_name = ANY(p_config_names)
    AND (SELECT auth.role()) = 'service_role'
  ORDER BY c.config_name;
$$;

REVOKE ALL ON FUNCTION public.read_backend_runtime_config(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.read_backend_runtime_config(text[]) FROM anon;
REVOKE ALL ON FUNCTION public.read_backend_runtime_config(text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.read_backend_runtime_config(text[]) TO service_role;

DELETE FROM public.edge_function_config
WHERE function_name IN (
  'gameplay_queue_enabled',
  'gameplay_queue_wakeup_enabled',
  'gameplay_inline_processing_enabled',
  'gameplay_queue_batch_size',
  'gameplay_queue_visibility_timeout_seconds',
  'gameplay_queue_max_attempts',
  'gameplay_queue_wakeup_max_messages',
  'gameplay_queue_wakeup_max_duration_ms',
  'legacy_event_processor_enabled'
);

DROP POLICY IF EXISTS "edge_function_config_public_read"
  ON public.edge_function_config;
DROP POLICY IF EXISTS "edge_function_config_service_role_select"
  ON public.edge_function_config;
CREATE POLICY "edge_function_config_service_role_select"
  ON public.edge_function_config FOR SELECT TO public
  USING ((SELECT auth.role()) = 'service_role');

REVOKE ALL ON TABLE public.edge_function_config FROM anon;
REVOKE ALL ON TABLE public.edge_function_config FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.edge_function_config TO service_role;

CREATE OR REPLACE FUNCTION app_private.ingest_gameplay_event(
  p_type text,
  p_user_id uuid,
  p_convention_id uuid,
  p_payload jsonb,
  p_occurred_at timestamp with time zone,
  p_idempotency_key text DEFAULT null::text
)
RETURNS TABLE(event_id uuid, duplicate boolean, enqueued boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pgmq', 'pg_temp'
AS $$
DECLARE
  v_event_id uuid;
  v_queue_enabled boolean := COALESCE(
    (app_private.backend_runtime_config_value('gameplay_queue_enabled', 'true'::jsonb))::text::boolean,
    true
  );
  v_queue_message_id bigint;
  v_already_enqueued boolean := false;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing user_id';
  END IF;

  IF p_type IS NULL OR char_length(btrim(p_type)) = 0 THEN
    RAISE EXCEPTION 'Missing event type';
  END IF;

  IF NOT public.is_valid_event_type(p_type) THEN
    RAISE EXCEPTION 'Unsupported event type: %', p_type;
  END IF;

  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    SELECT
      e.event_id,
      (e.queue_name IS NOT NULL AND e.queue_message_id IS NOT NULL)
    INTO
      v_event_id,
      v_already_enqueued
    FROM public.events e
    WHERE e.idempotency_key = p_idempotency_key
    LIMIT 1;

    IF found THEN
      RETURN QUERY
      SELECT v_event_id, true, v_already_enqueued;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.events (
    user_id,
    convention_id,
    type,
    payload,
    occurred_at,
    idempotency_key
  )
  VALUES (
    p_user_id,
    p_convention_id,
    p_type,
    COALESCE(p_payload, '{}'::jsonb),
    COALESCE(p_occurred_at, timezone('utc'::text, now())),
    nullif(btrim(p_idempotency_key), '')
  )
  RETURNING events.event_id
  INTO v_event_id;

  IF v_queue_enabled THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pgmq.list_queues()
      WHERE queue_name = 'gameplay_event_processing'
    ) THEN
      PERFORM pgmq.create('gameplay_event_processing');
    END IF;

    SELECT *
    INTO v_queue_message_id
    FROM pgmq.send(
      'gameplay_event_processing',
      jsonb_build_object('event_id', v_event_id)
    );

    UPDATE public.events
    SET
      queue_name = 'gameplay_event_processing',
      queue_message_id = v_queue_message_id,
      enqueued_at = timezone('utc'::text, now())
    WHERE events.event_id = v_event_id;

    RETURN QUERY
    SELECT v_event_id, false, true;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT v_event_id, false, false;
  RETURN;
EXCEPTION
  WHEN unique_violation THEN
    IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
      SELECT
        e.event_id,
        (e.queue_name IS NOT NULL AND e.queue_message_id IS NOT NULL)
      INTO
        v_event_id,
        v_already_enqueued
      FROM public.events e
      WHERE e.idempotency_key = p_idempotency_key
      LIMIT 1;

      IF found THEN
        RETURN QUERY
        SELECT v_event_id, true, v_already_enqueued;
        RETURN;
      END IF;
    END IF;

    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_unprocessed_events(
  p_batch_size integer DEFAULT 50,
  p_min_age_seconds integer DEFAULT 3
)
RETURNS SETOF public.events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_enabled boolean := COALESCE(
    (app_private.backend_runtime_config_value('legacy_event_processor_enabled', 'false'::jsonb))::text::boolean,
    false
  );
BEGIN
  IF NOT v_enabled THEN
    RAISE WARNING 'public.claim_unprocessed_events() is disabled because legacy_event_processor_enabled=false';
    RETURN;
  END IF;

  RETURN QUERY
  WITH claimable AS (
    SELECT e.event_id
    FROM public.events e
    WHERE e.processed_at IS NULL
      AND e.received_at < now() - make_interval(secs => greatest(coalesce(p_min_age_seconds, 0), 0))
    ORDER BY e.received_at ASC
    LIMIT greatest(coalesce(p_batch_size, 50), 1)
    FOR UPDATE SKIP LOCKED
  )
  SELECT e.*
  FROM public.events e
  INNER JOIN claimable c ON c.event_id = e.event_id
  ORDER BY e.received_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.fetch_unprocessed_events(
  batch_size integer DEFAULT 50,
  min_age_seconds integer DEFAULT 3
)
RETURNS TABLE(
  event_id uuid,
  user_id uuid,
  convention_id uuid,
  type text,
  payload jsonb,
  occurred_at timestamp with time zone,
  received_at timestamp with time zone,
  retry_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_enabled boolean := COALESCE(
    (app_private.backend_runtime_config_value('legacy_event_processor_enabled', 'false'::jsonb))::text::boolean,
    false
  );
BEGIN
  IF NOT v_enabled THEN
    RAISE WARNING 'public.fetch_unprocessed_events() is disabled because legacy_event_processor_enabled=false';
    RETURN;
  END IF;

  RETURN QUERY
  WITH claimed AS (
    SELECT e.event_id
    FROM public.events e
    WHERE e.processed_at IS NULL
      AND e.received_at < now() - make_interval(secs => greatest(coalesce(min_age_seconds, 0), 0))
      AND e.retry_count < 5
    ORDER BY e.received_at ASC
    LIMIT greatest(coalesce(batch_size, 50), 1)
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.events e
    SET retry_count = e.retry_count + 1
    FROM claimed c
    WHERE e.event_id = c.event_id
    RETURNING
      e.event_id,
      e.user_id,
      e.convention_id,
      e.type,
      e.payload,
      e.occurred_at,
      e.received_at,
      e.retry_count
  )
  SELECT
    u.event_id,
    u.user_id,
    u.convention_id,
    u.type,
    u.payload,
    u.occurred_at,
    u.received_at,
    u.retry_count
  FROM updated u;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_gameplay_queue_if_active()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
DECLARE
  has_backlog boolean;
  v_url text;
  v_key text;
  v_queue_enabled boolean;
BEGIN
  v_queue_enabled := COALESCE(
    (app_private.backend_runtime_config_value('gameplay_queue_enabled', 'true'::jsonb))::text::boolean,
    true
  );

  IF NOT v_queue_enabled THEN
    RETURN;
  END IF;

  SELECT public.has_visible_gameplay_event_queue_messages() INTO has_backlog;

  IF NOT has_backlog THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_URL'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'SERVICE_ROLE_KEY'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_key IS NULL THEN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'process_gameplay_queue_if_active: missing vault secrets SUPABASE_URL or SERVICE_ROLE_KEY';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/process-gameplay-queue',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
END;
$$;

COMMIT;
