-- =============================================================================
-- Performance fixes: redundant indexes + overlapping RLS policies
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. INDEXES
-- -----------------------------------------------------------------------------

-- Drop redundant indexes on user_daily_progress
-- Both are leading-column prefixes of the PK (user_id, convention_id, day, task_id)
DROP INDEX IF EXISTS idx_user_daily_progress_lookup;          -- (user_id, convention_id, day)
DROP INDEX IF EXISTS idx_user_daily_progress_user_convention;  -- (user_id, convention_id)

-- Drop unused reverse-lookup index on fursuit_color_assignments
-- The app assigns colors to fursuits, never queries fursuits by color
DROP INDEX IF EXISTS fursuit_color_assignments_color_idx;      -- (color_id)

-- Add missing index for foreign key on verification_attempts
CREATE INDEX IF NOT EXISTS idx_verification_attempts_convention_id
  ON public.verification_attempts (convention_id);

-- -----------------------------------------------------------------------------
-- 2. DROP REDUNDANT SELECT POLICIES
-- -----------------------------------------------------------------------------

-- conventions: "Anyone can read conventions" is USING (true), making the admin
-- policy redundant (its condition is "(admin check) OR true" = always true)
DROP POLICY IF EXISTS "Admins can read all conventions" ON public.conventions;

-- fursuits: "Anyone can view fursuits" is USING (true), so both of these are redundant
DROP POLICY IF EXISTS "Admins can view all fursuits" ON public.fursuits;
DROP POLICY IF EXISTS "Users can view their own fursuits" ON public.fursuits;

-- -----------------------------------------------------------------------------
-- 3. SPLIT ALL POLICIES INTO SPECIFIC OPERATIONS
--    Eliminates overlap between ALL (covers SELECT) and dedicated SELECT policies
-- -----------------------------------------------------------------------------

-- edge_function_config: replace ALL with INSERT/UPDATE/DELETE for service_role
DROP POLICY IF EXISTS "edge_function_config_service_role" ON public.edge_function_config;
CREATE POLICY "edge_function_config_service_role_insert"
  ON public.edge_function_config FOR INSERT TO public
  WITH CHECK ((SELECT auth.role()) = 'service_role');
CREATE POLICY "edge_function_config_service_role_update"
  ON public.edge_function_config FOR UPDATE TO public
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');
CREATE POLICY "edge_function_config_service_role_delete"
  ON public.edge_function_config FOR DELETE TO public
  USING ((SELECT auth.role()) = 'service_role');

-- allowed_event_types: replace ALL with INSERT/UPDATE/DELETE for service_role
DROP POLICY IF EXISTS "allowed_event_types_service_role" ON public.allowed_event_types;
CREATE POLICY "allowed_event_types_service_role_insert"
  ON public.allowed_event_types FOR INSERT TO public
  WITH CHECK ((SELECT auth.role()) = 'service_role');
CREATE POLICY "allowed_event_types_service_role_update"
  ON public.allowed_event_types FOR UPDATE TO public
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');
CREATE POLICY "allowed_event_types_service_role_delete"
  ON public.allowed_event_types FOR DELETE TO public
  USING ((SELECT auth.role()) = 'service_role');

-- fursuit_colors: replace ALL with INSERT/UPDATE/DELETE for service_role
DROP POLICY IF EXISTS "fursuit_colors_manage" ON public.fursuit_colors;
CREATE POLICY "fursuit_colors_service_role_insert"
  ON public.fursuit_colors FOR INSERT TO public
  WITH CHECK ((SELECT auth.role()) = 'service_role');
CREATE POLICY "fursuit_colors_service_role_update"
  ON public.fursuit_colors FOR UPDATE TO public
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');
CREATE POLICY "fursuit_colors_service_role_delete"
  ON public.fursuit_colors FOR DELETE TO public
  USING ((SELECT auth.role()) = 'service_role');

-- events: replace ALL with UPDATE/DELETE for service_role
-- (INSERT and SELECT already have dedicated policies that include service_role)
DROP POLICY IF EXISTS "events_manage" ON public.events;
CREATE POLICY "events_service_role_update"
  ON public.events FOR UPDATE TO public
  USING ((SELECT auth.role()) = 'service_role');
CREATE POLICY "events_service_role_delete"
  ON public.events FOR DELETE TO public
  USING ((SELECT auth.role()) = 'service_role');

-- -----------------------------------------------------------------------------
-- 4. CONSOLIDATE OVERLAPPING SELECT POLICIES
-- -----------------------------------------------------------------------------

-- event_staff: merge admin + own-assignment into single policy
DROP POLICY IF EXISTS "Admins can read staff assignments" ON public.event_staff;
DROP POLICY IF EXISTS "Staff can read own assignments" ON public.event_staff;
CREATE POLICY "event_staff_select"
  ON public.event_staff FOR SELECT TO public
  USING (
    profile_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role IN ('owner', 'organizer')
    )
  );

-- admin_error_log: merge organizer-convention + owner/moderator into single policy
DROP POLICY IF EXISTS "error_log_organizer_select" ON public.admin_error_log;
DROP POLICY IF EXISTS "error_log_owner_moderator_select" ON public.admin_error_log;
CREATE POLICY "error_log_select"
  ON public.admin_error_log FOR SELECT TO public
  USING (
    get_user_role((SELECT auth.uid())) IN ('owner', 'moderator')
    OR (
      get_user_role((SELECT auth.uid())) = 'organizer'
      AND convention_id IN (
        SELECT es.convention_id FROM event_staff es
        WHERE es.profile_id = (SELECT auth.uid())
      )
    )
  );

-- user_blocks: merge admin + own-blocks into single policy
DROP POLICY IF EXISTS "Admins can view all blocks" ON public.user_blocks;
DROP POLICY IF EXISTS "Users can view own blocks" ON public.user_blocks;
CREATE POLICY "user_blocks_select"
  ON public.user_blocks FOR SELECT TO public
  USING (
    blocker_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('owner', 'organizer', 'moderator')
    )
  );

-- tags: merge staff-convention + own-tags into single policy
DROP POLICY IF EXISTS "Staff can view tags for assigned conventions" ON public.tags;
DROP POLICY IF EXISTS "Users can view own tags" ON public.tags;
CREATE POLICY "tags_select"
  ON public.tags FOR SELECT TO public
  USING (
    registered_by_user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM fursuits
      WHERE fursuits.id = tags.fursuit_id
        AND fursuits.owner_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM fursuit_conventions fc
      JOIN event_staff es ON es.convention_id = fc.convention_id
      WHERE fc.fursuit_id = tags.fursuit_id
        AND es.profile_id = (SELECT auth.uid())
        AND es.status = 'active'
    )
  );

-- user_reports SELECT: merge moderator + organizer-convention + own-reports
DROP POLICY IF EXISTS "Moderators can view all reports" ON public.user_reports;
DROP POLICY IF EXISTS "Organizers can view event reports" ON public.user_reports;
DROP POLICY IF EXISTS "Users can view their own reports" ON public.user_reports;
CREATE POLICY "user_reports_select"
  ON public.user_reports FOR SELECT TO authenticated
  USING (
    reporter_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('owner', 'moderator')
    )
    OR convention_id IN (
      SELECT es.convention_id FROM event_staff es
      WHERE es.profile_id = (SELECT auth.uid())
        AND es.role = 'organizer'
        AND es.status = 'active'
    )
  );

-- user_reports UPDATE: merge two redundant moderator-check policies
-- "Staff can update reports" uses is_moderator_or_higher (owner/moderator/organizer)
-- which is broader than the inline check (owner/moderator only), so we keep the broader one
DROP POLICY IF EXISTS "Moderators can update reports" ON public.user_reports;
DROP POLICY IF EXISTS "Staff can update reports" ON public.user_reports;
CREATE POLICY "user_reports_update"
  ON public.user_reports FOR UPDATE TO authenticated
  USING (is_moderator_or_higher((SELECT auth.uid())))
  WITH CHECK (is_moderator_or_higher((SELECT auth.uid())));
