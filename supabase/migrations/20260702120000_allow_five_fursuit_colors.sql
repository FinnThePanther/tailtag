-- Allow the app's five-color fursuit selection limit at the database layer.

ALTER TABLE public.fursuit_color_assignments
DROP CONSTRAINT IF EXISTS fursuit_color_assignments_position_check;

ALTER TABLE public.fursuit_color_assignments
ADD CONSTRAINT fursuit_color_assignments_position_check
CHECK (position >= 1 AND position <= 5);
