CREATE OR REPLACE FUNCTION public.can_view_fursuit_owner(
  p_viewer_id uuid,
  p_fursuit_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.fursuits f
    WHERE f.id = p_fursuit_id
      AND (
        auth.role() = 'service_role'
        OR (
          p_viewer_id = auth.uid()
          AND (
            p_viewer_id = f.owner_id
            OR public.is_elevated_privacy_viewer(p_viewer_id)
            OR f.owner_attribution_visibility = 'public'
          )
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.can_view_fursuit_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_fursuit_owner(uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
