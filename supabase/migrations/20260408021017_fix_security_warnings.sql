-- Move postgis from public schema to extensions schema
-- postgis doesn't support ALTER EXTENSION ... SET SCHEMA, so we drop and recreate
-- No geometry/geography columns exist in the database, so this is safe
-- This also moves spatial_ref_sys out of the public schema, eliminating the RLS warning
DROP EXTENSION IF EXISTS postgis CASCADE;
CREATE EXTENSION postgis SCHEMA extensions;
