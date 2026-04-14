create extension if not exists "pg_net" with schema "public";

create extension if not exists "postgis" with schema "public";

create type "public"."achievement_category" as enum ('catching', 'variety', 'dedication', 'fursuiter', 'fun', 'meta');

create type "public"."achievement_recipient_role" as enum ('catcher', 'fursuit_owner', 'any');

create type "public"."achievement_trigger_event" as enum ('catch.created', 'profile.updated', 'convention.checkin', 'leaderboard.refreshed', 'catch_performed', 'convention_joined');

create type "public"."catch_mode" as enum ('AUTO_ACCEPT', 'MANUAL_APPROVAL');

create type "public"."catch_status" as enum ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED');

create type "public"."user_role" as enum ('player', 'staff', 'moderator', 'organizer', 'owner');


  create table "public"."achievement_rules" (
    "rule_id" uuid not null default gen_random_uuid(),
    "kind" text not null,
    "slug" text not null,
    "name" text not null,
    "description" text,
    "is_active" boolean not null default true,
    "version" integer not null default 1,
    "rule" jsonb not null,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."achievement_rules" enable row level security;


  create table "public"."achievements" (
    "id" uuid not null default gen_random_uuid(),
    "key" text not null,
    "name" text not null,
    "description" text not null,
    "category" public.achievement_category not null,
    "recipient_role" public.achievement_recipient_role not null,
    "trigger_event" public.achievement_trigger_event not null,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "rule_id" uuid,
    "reset_mode" text not null default 'none'::text,
    "reset_timezone" text not null default 'UTC'::text,
    "reset_grace_minutes" integer not null default 0,
    "convention_id" uuid
      );


alter table "public"."achievements" enable row level security;


  create table "public"."admin_error_log" (
    "id" uuid not null default gen_random_uuid(),
    "convention_id" uuid,
    "error_type" text not null,
    "error_message" text not null,
    "context" jsonb,
    "severity" text not null,
    "occurred_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."admin_error_log" enable row level security;


  create table "public"."allowed_event_types" (
    "event_type" text not null,
    "description" text not null,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "deprecated_at" timestamp with time zone
      );


alter table "public"."allowed_event_types" enable row level security;


  create table "public"."audit_log" (
    "id" uuid not null default gen_random_uuid(),
    "actor_id" uuid not null,
    "action" text not null,
    "entity_type" text not null,
    "entity_id" uuid,
    "diff" jsonb,
    "context" jsonb,
    "ip_address" inet,
    "user_agent" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."audit_log" enable row level security;


  create table "public"."catches" (
    "id" uuid not null default gen_random_uuid(),
    "catcher_id" uuid not null,
    "fursuit_id" uuid not null,
    "caught_at" timestamp with time zone default now(),
    "is_tutorial" boolean not null default false,
    "catch_number" integer,
    "convention_id" uuid,
    "status" text not null default 'ACCEPTED'::text,
    "decided_at" timestamp with time zone,
    "decided_by_user_id" uuid,
    "rejection_reason" text,
    "expires_at" timestamp with time zone,
    "catch_photo_url" text
      );


alter table "public"."catches" enable row level security;


  create table "public"."conventions" (
    "id" uuid not null default gen_random_uuid(),
    "slug" text not null,
    "name" text not null,
    "location" text,
    "start_date" date,
    "end_date" date,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "timezone" text not null default 'UTC'::text,
    "config" jsonb not null default '{}'::jsonb,
    "latitude" numeric(10,8),
    "longitude" numeric(11,8),
    "geofence_radius_meters" integer default 500,
    "geofence_enabled" boolean default false,
    "location_verification_required" boolean default false
      );


alter table "public"."conventions" enable row level security;


  create table "public"."daily_assignments" (
    "id" uuid not null default gen_random_uuid(),
    "day" date not null,
    "task_id" uuid not null,
    "position" integer not null,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "convention_id" uuid not null
      );


alter table "public"."daily_assignments" enable row level security;


  create table "public"."daily_tasks" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "description" text not null,
    "kind" text not null,
    "requirement" integer not null,
    "metadata" jsonb not null default '{}'::jsonb,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "rule_id" uuid,
    "convention_id" uuid
      );


alter table "public"."daily_tasks" enable row level security;


  create table "public"."edge_function_config" (
    "function_name" text not null,
    "description" text not null,
    "rate_limit_enabled" boolean not null default false,
    "rate_limit_requests_per_minute" integer,
    "rate_limit_requests_per_hour" integer,
    "max_payload_size_bytes" integer default 10240,
    "validate_event_types" boolean default true,
    "require_jwt" boolean not null default true,
    "allowed_roles" text[] default ARRAY['authenticated'::text],
    "is_deprecated" boolean not null default false,
    "deprecation_date" timestamp with time zone,
    "replacement_function" text,
    "updated_at" timestamp with time zone not null default now(),
    "config" jsonb not null default '{}'::jsonb
      );


alter table "public"."edge_function_config" enable row level security;


  create table "public"."event_staff" (
    "id" uuid not null default gen_random_uuid(),
    "profile_id" uuid not null,
    "convention_id" uuid not null,
    "role" public.user_role not null,
    "status" text not null default 'active'::text,
    "assigned_at" timestamp with time zone not null default now(),
    "assigned_by_user_id" uuid,
    "notes" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."event_staff" enable row level security;


  create table "public"."events" (
    "event_id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "convention_id" uuid,
    "type" text not null,
    "payload" jsonb not null default '{}'::jsonb,
    "occurred_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "received_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "processed_at" timestamp with time zone,
    "retry_count" integer not null default 0,
    "last_error" text,
    "idempotency_key" text,
    "queue_name" text,
    "queue_message_id" bigint,
    "enqueued_at" timestamp with time zone,
    "last_attempted_at" timestamp with time zone,
    "dead_lettered_at" timestamp with time zone,
    "dead_letter_reason" text
      );


alter table "public"."events" enable row level security;


  create table "public"."fursuit_bios" (
    "id" uuid not null default gen_random_uuid(),
    "fursuit_id" uuid not null,
    "version" integer not null,
    "owner_name" text not null,
    "pronouns" text not null,
    "likes_and_interests" text not null,
    "ask_me_about" text not null,
    "social_links" jsonb not null default '[]'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."fursuit_bios" enable row level security;


  create table "public"."fursuit_color_assignments" (
    "id" uuid not null default gen_random_uuid(),
    "fursuit_id" uuid not null,
    "color_id" uuid not null,
    "position" smallint not null,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."fursuit_color_assignments" enable row level security;


  create table "public"."fursuit_colors" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "normalized_name" text generated always as (lower(regexp_replace(TRIM(BOTH FROM name), '\s+'::text, ' '::text, 'g'::text))) stored,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."fursuit_colors" enable row level security;


  create table "public"."fursuit_conventions" (
    "fursuit_id" uuid not null,
    "convention_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."fursuit_conventions" enable row level security;


  create table "public"."fursuit_species" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "normalized_name" text generated always as (lower(regexp_replace(btrim(name), '\s+'::text, ' '::text, 'g'::text))) stored,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."fursuit_species" enable row level security;


  create table "public"."fursuits" (
    "id" uuid not null default gen_random_uuid(),
    "owner_id" uuid not null,
    "name" text not null,
    "avatar_url" text,
    "created_at" timestamp with time zone default now(),
    "unique_code" text not null,
    "species_id" uuid,
    "description" text,
    "is_tutorial" boolean not null default false,
    "catch_count" integer not null default 0,
    "catch_mode" text not null default 'AUTO_ACCEPT'::text,
    "is_flagged" boolean not null default false,
    "flagged_at" timestamp with time zone,
    "flagged_reason" text
      );


alter table "public"."fursuits" enable row level security;


  create table "public"."notifications" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "type" text not null,
    "payload" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."notifications" enable row level security;


  create table "public"."profile_conventions" (
    "profile_id" uuid not null,
    "convention_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "verified_location" jsonb,
    "verification_method" text default 'none'::text,
    "verified_at" timestamp with time zone,
    "override_actor_id" uuid,
    "override_reason" text,
    "override_at" timestamp with time zone
      );


alter table "public"."profile_conventions" enable row level security;


  create table "public"."profiles" (
    "id" uuid not null,
    "username" text,
    "bio" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "onboarding_completed" boolean not null default false,
    "is_new" boolean not null default true,
    "default_catch_mode" text not null default 'AUTO_ACCEPT'::text,
    "role" public.user_role not null default 'player'::public.user_role,
    "is_suspended" boolean not null default false,
    "suspended_until" timestamp with time zone,
    "suspension_reason" text,
    "location_permission_status" text default 'not_requested'::text,
    "location_permission_requested_at" timestamp with time zone,
    "location_permission_granted_at" timestamp with time zone,
    "expo_push_token" text,
    "push_notifications_enabled" boolean not null default false,
    "push_notifications_prompted" boolean default false,
    "avatar_url" text,
    "social_links" jsonb default '[]'::jsonb
      );


alter table "public"."profiles" enable row level security;


  create table "public"."push_notification_retry_queue" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "notification_id" uuid not null,
    "user_id" uuid not null,
    "notification_type" text not null,
    "payload" jsonb,
    "request_body" jsonb,
    "response_status" integer,
    "response_body" jsonb,
    "last_error" text,
    "attempts" integer not null default 0,
    "processed_at" timestamp with time zone
      );


alter table "public"."push_notification_retry_queue" enable row level security;


  create table "public"."tag_scans" (
    "id" uuid not null default gen_random_uuid(),
    "tag_id" uuid,
    "scanned_identifier" text not null,
    "scanner_user_id" uuid,
    "scan_method" text not null,
    "result" text not null,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."tag_scans" enable row level security;


  create table "public"."tags" (
    "nfc_uid" text,
    "fursuit_id" uuid,
    "registered_by_user_id" uuid,
    "status" text not null default 'pending_link'::text,
    "registered_at" timestamp with time zone not null default now(),
    "linked_at" timestamp with time zone,
    "updated_at" timestamp with time zone not null default now(),
    "id" uuid not null default gen_random_uuid(),
    "qr_token" text,
    "qr_token_created_at" timestamp with time zone,
    "qr_asset_path" text
      );


alter table "public"."tags" enable row level security;


  create table "public"."user_achievements" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "achievement_id" uuid not null,
    "unlocked_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "context" jsonb not null default '{}'::jsonb
      );


alter table "public"."user_achievements" enable row level security;


  create table "public"."user_blocks" (
    "id" uuid not null default gen_random_uuid(),
    "blocker_id" uuid not null default auth.uid(),
    "blocked_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."user_blocks" enable row level security;


  create table "public"."user_daily_progress" (
    "user_id" uuid not null,
    "day" date not null,
    "task_id" uuid not null,
    "current_count" integer not null default 0,
    "is_completed" boolean not null default false,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "convention_id" uuid not null
      );


alter table "public"."user_daily_progress" enable row level security;


  create table "public"."user_daily_streaks" (
    "user_id" uuid not null,
    "current_streak" integer not null default 0,
    "best_streak" integer not null default 0,
    "last_completed_day" date,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "convention_id" uuid not null
      );


alter table "public"."user_daily_streaks" enable row level security;


  create table "public"."user_moderation_actions" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "action_type" text not null,
    "scope" text not null default 'global'::text,
    "convention_id" uuid,
    "reason" text not null,
    "internal_notes" text,
    "duration_hours" integer,
    "expires_at" timestamp with time zone,
    "is_active" boolean not null default true,
    "applied_by_user_id" uuid not null,
    "revoked_by_user_id" uuid,
    "revoked_at" timestamp with time zone,
    "revoke_reason" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."user_moderation_actions" enable row level security;


  create table "public"."user_reports" (
    "id" uuid not null default gen_random_uuid(),
    "reporter_id" uuid not null,
    "reported_user_id" uuid,
    "reported_fursuit_id" uuid,
    "report_type" text not null,
    "severity" text not null default 'medium'::text,
    "description" text not null,
    "status" text not null default 'pending'::text,
    "convention_id" uuid,
    "resolved_by_user_id" uuid,
    "resolved_at" timestamp with time zone,
    "resolution_notes" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."user_reports" enable row level security;


  create table "public"."verification_attempts" (
    "id" uuid not null default gen_random_uuid(),
    "profile_id" uuid,
    "convention_id" uuid,
    "verified" boolean not null,
    "distance_meters" numeric,
    "gps_accuracy" numeric,
    "error_code" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."verification_attempts" enable row level security;

CREATE UNIQUE INDEX achievement_rules_name_key ON public.achievement_rules USING btree (lower(name));

CREATE UNIQUE INDEX achievement_rules_pkey ON public.achievement_rules USING btree (rule_id);

CREATE UNIQUE INDEX achievement_rules_slug_key ON public.achievement_rules USING btree (slug);

CREATE INDEX achievements_convention_id_idx ON public.achievements USING btree (convention_id);

CREATE UNIQUE INDEX achievements_key_key ON public.achievements USING btree (key);

CREATE UNIQUE INDEX achievements_pkey ON public.achievements USING btree (id);

CREATE UNIQUE INDEX achievements_rule_id_key ON public.achievements USING btree (rule_id) WHERE (rule_id IS NOT NULL);

CREATE UNIQUE INDEX admin_error_log_pkey ON public.admin_error_log USING btree (id);

CREATE UNIQUE INDEX allowed_event_types_pkey ON public.allowed_event_types USING btree (event_type);

CREATE UNIQUE INDEX audit_log_pkey ON public.audit_log USING btree (id);

CREATE UNIQUE INDEX catches_pkey ON public.catches USING btree (id);

CREATE UNIQUE INDEX conventions_pkey ON public.conventions USING btree (id);

CREATE UNIQUE INDEX conventions_slug_key ON public.conventions USING btree (slug);

CREATE INDEX daily_assignments_convention_day_idx ON public.daily_assignments USING btree (convention_id, day);

CREATE UNIQUE INDEX daily_assignments_convention_day_position_key ON public.daily_assignments USING btree (convention_id, day, "position");

CREATE UNIQUE INDEX daily_assignments_convention_day_task_key ON public.daily_assignments USING btree (convention_id, day, task_id);

CREATE UNIQUE INDEX daily_assignments_pkey ON public.daily_assignments USING btree (id);

CREATE INDEX daily_tasks_convention_id_idx ON public.daily_tasks USING btree (convention_id);

CREATE UNIQUE INDEX daily_tasks_name_key ON public.daily_tasks USING btree (name);

CREATE UNIQUE INDEX daily_tasks_pkey ON public.daily_tasks USING btree (id);

CREATE UNIQUE INDEX daily_tasks_rule_id_key ON public.daily_tasks USING btree (rule_id) WHERE (rule_id IS NOT NULL);

CREATE UNIQUE INDEX edge_function_config_pkey ON public.edge_function_config USING btree (function_name);

CREATE UNIQUE INDEX event_staff_pkey ON public.event_staff USING btree (id);

CREATE UNIQUE INDEX event_staff_profile_id_convention_id_key ON public.event_staff USING btree (profile_id, convention_id);

CREATE INDEX events_convention_occurred_idx ON public.events USING btree (convention_id, occurred_at DESC);

CREATE UNIQUE INDEX events_idempotency_key_uidx ON public.events USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);

CREATE UNIQUE INDEX events_pkey ON public.events USING btree (event_id);

CREATE INDEX events_processed_received_idx ON public.events USING btree (processed_at, received_at);

CREATE INDEX events_user_type_occurred_idx ON public.events USING btree (user_id, type, occurred_at DESC);

CREATE INDEX fursuit_bios_fursuit_id_idx ON public.fursuit_bios USING btree (fursuit_id);

CREATE UNIQUE INDEX fursuit_bios_pkey ON public.fursuit_bios USING btree (id);

CREATE UNIQUE INDEX fursuit_bios_unique_fursuit_version ON public.fursuit_bios USING btree (fursuit_id, version);

CREATE INDEX fursuit_color_assignments_color_idx ON public.fursuit_color_assignments USING btree (color_id);

CREATE UNIQUE INDEX fursuit_color_assignments_pkey ON public.fursuit_color_assignments USING btree (id);

CREATE UNIQUE INDEX fursuit_color_assignments_unique_color ON public.fursuit_color_assignments USING btree (fursuit_id, color_id);

CREATE UNIQUE INDEX fursuit_color_assignments_unique_position ON public.fursuit_color_assignments USING btree (fursuit_id, "position");

CREATE UNIQUE INDEX fursuit_colors_normalized_name_idx ON public.fursuit_colors USING btree (normalized_name);

CREATE UNIQUE INDEX fursuit_colors_pkey ON public.fursuit_colors USING btree (id);

CREATE INDEX fursuit_conventions_convention_idx ON public.fursuit_conventions USING btree (convention_id);

CREATE UNIQUE INDEX fursuit_conventions_pkey ON public.fursuit_conventions USING btree (fursuit_id, convention_id);

CREATE UNIQUE INDEX fursuit_species_normalized_name_unique ON public.fursuit_species USING btree (normalized_name);

CREATE UNIQUE INDEX fursuit_species_pkey ON public.fursuit_species USING btree (id);

CREATE UNIQUE INDEX fursuits_pkey ON public.fursuits USING btree (id);

CREATE UNIQUE INDEX fursuits_unique_code_non_tutorial_idx ON public.fursuits USING btree (unique_code) WHERE (is_tutorial = false);

CREATE INDEX idx_audit_log_action ON public.audit_log USING btree (action);

CREATE INDEX idx_audit_log_actor_created ON public.audit_log USING btree (actor_id, created_at DESC);

CREATE INDEX idx_audit_log_created_at ON public.audit_log USING btree (created_at DESC);

CREATE INDEX idx_audit_log_entity_type_id ON public.audit_log USING btree (entity_type, entity_id);

CREATE INDEX idx_catches_catcher_id_caught_at ON public.catches USING btree (catcher_id, caught_at DESC);

CREATE INDEX idx_catches_convention_caught_at ON public.catches USING btree (convention_id, caught_at DESC);

CREATE INDEX idx_catches_decided_by_user_id ON public.catches USING btree (decided_by_user_id) WHERE (decided_by_user_id IS NOT NULL);

CREATE INDEX idx_catches_expiration ON public.catches USING btree (status, expires_at) WHERE (status = 'PENDING'::text);

CREATE INDEX idx_catches_expires ON public.catches USING btree (expires_at) WHERE (status = 'PENDING'::text);

CREATE INDEX idx_catches_fursuit_id_caught_at ON public.catches USING btree (fursuit_id, caught_at DESC);

CREATE INDEX idx_catches_fursuit_status ON public.catches USING btree (fursuit_id, status, caught_at DESC);

CREATE INDEX idx_catches_leaderboard ON public.catches USING btree (catcher_id, convention_id, status) WHERE (status = 'ACCEPTED'::text);

CREATE INDEX idx_catches_pending_fursuit ON public.catches USING btree (fursuit_id, status) WHERE (status = 'PENDING'::text);

CREATE UNIQUE INDEX idx_catches_pending_unique_con ON public.catches USING btree (catcher_id, fursuit_id, convention_id) WHERE ((status = 'PENDING'::text) AND (convention_id IS NOT NULL));

CREATE UNIQUE INDEX idx_catches_pending_unique_no_con ON public.catches USING btree (catcher_id, fursuit_id) WHERE ((status = 'PENDING'::text) AND (convention_id IS NULL));

CREATE INDEX idx_daily_assignments_task_id ON public.daily_assignments USING btree (task_id);

CREATE INDEX idx_error_log_convention ON public.admin_error_log USING btree (convention_id);

CREATE INDEX idx_error_log_occurred ON public.admin_error_log USING btree (occurred_at DESC);

CREATE INDEX idx_event_staff_assigned_by_user_id ON public.event_staff USING btree (assigned_by_user_id);

CREATE INDEX idx_event_staff_convention_id ON public.event_staff USING btree (convention_id);

CREATE INDEX idx_event_staff_profile_id ON public.event_staff USING btree (profile_id);

CREATE INDEX idx_events_unprocessed ON public.events USING btree (received_at) WHERE (processed_at IS NULL);

CREATE INDEX idx_events_user_convention_occurred ON public.events USING btree (user_id, convention_id, occurred_at DESC);

CREATE INDEX idx_events_user_type ON public.events USING btree (user_id, type, occurred_at);

CREATE INDEX idx_fursuits_catch_count ON public.fursuits USING btree (catch_count DESC) WHERE (NOT is_tutorial);

CREATE INDEX idx_fursuits_owner_id ON public.fursuits USING btree (owner_id);

CREATE INDEX idx_fursuits_owner_tutorial ON public.fursuits USING btree (owner_id, is_tutorial);

CREATE INDEX idx_fursuits_species_id ON public.fursuits USING btree (species_id);

CREATE INDEX idx_moderation_actions_convention ON public.user_moderation_actions USING btree (convention_id);

CREATE INDEX idx_moderation_actions_type ON public.user_moderation_actions USING btree (action_type);

CREATE INDEX idx_moderation_actions_user ON public.user_moderation_actions USING btree (user_id);

CREATE INDEX idx_nfc_tags_fursuit_id ON public.tags USING btree (fursuit_id) WHERE (fursuit_id IS NOT NULL);

CREATE UNIQUE INDEX idx_nfc_tags_one_active_per_fursuit ON public.tags USING btree (fursuit_id) WHERE (status = 'active'::text);

CREATE INDEX idx_notifications_user_created ON public.notifications USING btree (user_id, created_at DESC);

CREATE INDEX idx_profile_conventions_override_actor_id ON public.profile_conventions USING btree (override_actor_id);

CREATE INDEX idx_profiles_push_enabled_token ON public.profiles USING btree (id) WHERE ((expo_push_token IS NOT NULL) AND (push_notifications_enabled = true));

CREATE INDEX idx_profiles_suspended ON public.profiles USING btree (is_suspended) WHERE (is_suspended = true);

CREATE INDEX idx_push_notification_retry_queue_user_id ON public.push_notification_retry_queue USING btree (user_id);

CREATE INDEX idx_tags_registered_by_user_id ON public.tags USING btree (registered_by_user_id);

CREATE INDEX idx_user_achievements_achievement_id ON public.user_achievements USING btree (achievement_id);

CREATE INDEX idx_user_blocks_blocked ON public.user_blocks USING btree (blocked_id);

CREATE INDEX idx_user_blocks_blocker ON public.user_blocks USING btree (blocker_id);

CREATE INDEX idx_user_daily_progress_lookup ON public.user_daily_progress USING btree (user_id, convention_id, day);

CREATE INDEX idx_user_daily_progress_task_id ON public.user_daily_progress USING btree (task_id);

CREATE INDEX idx_user_daily_progress_user_convention ON public.user_daily_progress USING btree (user_id, convention_id);

CREATE INDEX idx_user_daily_streaks_convention_id ON public.user_daily_streaks USING btree (convention_id);

CREATE INDEX idx_user_mod_actions_active ON public.user_moderation_actions USING btree (user_id, is_active) WHERE (is_active = true);

CREATE INDEX idx_user_moderation_actions_applied_by_user_id ON public.user_moderation_actions USING btree (applied_by_user_id);

CREATE INDEX idx_user_moderation_actions_revoked_by_user_id ON public.user_moderation_actions USING btree (revoked_by_user_id);

CREATE INDEX idx_user_reports_convention ON public.user_reports USING btree (convention_id);

CREATE INDEX idx_user_reports_created_at ON public.user_reports USING btree (created_at DESC);

CREATE INDEX idx_user_reports_reported_fursuit_id ON public.user_reports USING btree (reported_fursuit_id);

CREATE INDEX idx_user_reports_reported_user ON public.user_reports USING btree (reported_user_id);

CREATE INDEX idx_user_reports_reporter_id ON public.user_reports USING btree (reporter_id);

CREATE INDEX idx_user_reports_resolved_by_user_id ON public.user_reports USING btree (resolved_by_user_id);

CREATE INDEX idx_user_reports_status ON public.user_reports USING btree (status);

CREATE INDEX idx_verification_attempts_recent ON public.verification_attempts USING btree (profile_id, created_at DESC);

CREATE UNIQUE INDEX nfc_tags_pkey ON public.tags USING btree (id);

CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id);

CREATE INDEX profile_conventions_convention_idx ON public.profile_conventions USING btree (convention_id);

CREATE UNIQUE INDEX profile_conventions_pkey ON public.profile_conventions USING btree (profile_id, convention_id);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX profiles_username_key ON public.profiles USING btree (username);

CREATE INDEX push_notification_retry_queue_notification_id_idx ON public.push_notification_retry_queue USING btree (notification_id);

CREATE UNIQUE INDEX push_notification_retry_queue_pkey ON public.push_notification_retry_queue USING btree (id);

CREATE UNIQUE INDEX tag_scans_pkey ON public.tag_scans USING btree (id);

CREATE INDEX tag_scans_scanner_user_id_idx ON public.tag_scans USING btree (scanner_user_id);

CREATE INDEX tag_scans_tag_id_idx ON public.tag_scans USING btree (tag_id);

CREATE UNIQUE INDEX tags_nfc_uid_key ON public.tags USING btree (nfc_uid);

CREATE UNIQUE INDEX tags_qr_token_key ON public.tags USING btree (qr_token);

CREATE UNIQUE INDEX user_achievements_pkey ON public.user_achievements USING btree (id);

CREATE UNIQUE INDEX user_achievements_user_id_achievement_id_key ON public.user_achievements USING btree (user_id, achievement_id);

CREATE UNIQUE INDEX user_blocks_pkey ON public.user_blocks USING btree (id);

CREATE UNIQUE INDEX user_blocks_unique_pair ON public.user_blocks USING btree (blocker_id, blocked_id);

CREATE INDEX user_daily_progress_convention_day_task_idx ON public.user_daily_progress USING btree (convention_id, day, task_id);

CREATE UNIQUE INDEX user_daily_progress_pkey ON public.user_daily_progress USING btree (user_id, convention_id, day, task_id);

CREATE INDEX user_daily_progress_user_idx ON public.user_daily_progress USING btree (user_id);

CREATE UNIQUE INDEX user_daily_streaks_pkey ON public.user_daily_streaks USING btree (user_id, convention_id);

CREATE UNIQUE INDEX user_moderation_actions_pkey ON public.user_moderation_actions USING btree (id);

CREATE UNIQUE INDEX user_reports_pkey ON public.user_reports USING btree (id);

CREATE UNIQUE INDEX verification_attempts_pkey ON public.verification_attempts USING btree (id);

alter table "public"."achievement_rules" add constraint "achievement_rules_pkey" PRIMARY KEY using index "achievement_rules_pkey";

alter table "public"."achievements" add constraint "achievements_pkey" PRIMARY KEY using index "achievements_pkey";

alter table "public"."admin_error_log" add constraint "admin_error_log_pkey" PRIMARY KEY using index "admin_error_log_pkey";

alter table "public"."allowed_event_types" add constraint "allowed_event_types_pkey" PRIMARY KEY using index "allowed_event_types_pkey";

alter table "public"."audit_log" add constraint "audit_log_pkey" PRIMARY KEY using index "audit_log_pkey";

alter table "public"."catches" add constraint "catches_pkey" PRIMARY KEY using index "catches_pkey";

alter table "public"."conventions" add constraint "conventions_pkey" PRIMARY KEY using index "conventions_pkey";

alter table "public"."daily_assignments" add constraint "daily_assignments_pkey" PRIMARY KEY using index "daily_assignments_pkey";

alter table "public"."daily_tasks" add constraint "daily_tasks_pkey" PRIMARY KEY using index "daily_tasks_pkey";

alter table "public"."edge_function_config" add constraint "edge_function_config_pkey" PRIMARY KEY using index "edge_function_config_pkey";

alter table "public"."event_staff" add constraint "event_staff_pkey" PRIMARY KEY using index "event_staff_pkey";

alter table "public"."events" add constraint "events_pkey" PRIMARY KEY using index "events_pkey";

alter table "public"."fursuit_bios" add constraint "fursuit_bios_pkey" PRIMARY KEY using index "fursuit_bios_pkey";

alter table "public"."fursuit_color_assignments" add constraint "fursuit_color_assignments_pkey" PRIMARY KEY using index "fursuit_color_assignments_pkey";

alter table "public"."fursuit_colors" add constraint "fursuit_colors_pkey" PRIMARY KEY using index "fursuit_colors_pkey";

alter table "public"."fursuit_conventions" add constraint "fursuit_conventions_pkey" PRIMARY KEY using index "fursuit_conventions_pkey";

alter table "public"."fursuit_species" add constraint "fursuit_species_pkey" PRIMARY KEY using index "fursuit_species_pkey";

alter table "public"."fursuits" add constraint "fursuits_pkey" PRIMARY KEY using index "fursuits_pkey";

alter table "public"."notifications" add constraint "notifications_pkey" PRIMARY KEY using index "notifications_pkey";

alter table "public"."profile_conventions" add constraint "profile_conventions_pkey" PRIMARY KEY using index "profile_conventions_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."push_notification_retry_queue" add constraint "push_notification_retry_queue_pkey" PRIMARY KEY using index "push_notification_retry_queue_pkey";

alter table "public"."tag_scans" add constraint "tag_scans_pkey" PRIMARY KEY using index "tag_scans_pkey";

alter table "public"."tags" add constraint "nfc_tags_pkey" PRIMARY KEY using index "nfc_tags_pkey";

alter table "public"."user_achievements" add constraint "user_achievements_pkey" PRIMARY KEY using index "user_achievements_pkey";

alter table "public"."user_blocks" add constraint "user_blocks_pkey" PRIMARY KEY using index "user_blocks_pkey";

alter table "public"."user_daily_progress" add constraint "user_daily_progress_pkey" PRIMARY KEY using index "user_daily_progress_pkey";

alter table "public"."user_daily_streaks" add constraint "user_daily_streaks_pkey" PRIMARY KEY using index "user_daily_streaks_pkey";

alter table "public"."user_moderation_actions" add constraint "user_moderation_actions_pkey" PRIMARY KEY using index "user_moderation_actions_pkey";

alter table "public"."user_reports" add constraint "user_reports_pkey" PRIMARY KEY using index "user_reports_pkey";

alter table "public"."verification_attempts" add constraint "verification_attempts_pkey" PRIMARY KEY using index "verification_attempts_pkey";

alter table "public"."achievement_rules" add constraint "achievement_rules_kind_check" CHECK ((kind = ANY (ARRAY['permanent'::text, 'daily'::text, 'fursuit_caught_count_at_convention'::text, 'convention_joined'::text]))) not valid;

alter table "public"."achievement_rules" validate constraint "achievement_rules_kind_check";

alter table "public"."achievement_rules" add constraint "achievement_rules_slug_key" UNIQUE using index "achievement_rules_slug_key";

alter table "public"."achievement_rules" add constraint "achievement_rules_version_check" CHECK ((version >= 1)) not valid;

alter table "public"."achievement_rules" validate constraint "achievement_rules_version_check";

alter table "public"."achievements" add constraint "achievements_convention_id_fkey" FOREIGN KEY (convention_id) REFERENCES public.conventions(id) not valid;

alter table "public"."achievements" validate constraint "achievements_convention_id_fkey";

alter table "public"."achievements" add constraint "achievements_key_key" UNIQUE using index "achievements_key_key";

alter table "public"."achievements" add constraint "achievements_reset_grace_minutes_check" CHECK (((reset_grace_minutes >= 0) AND (reset_grace_minutes <= 1440))) not valid;

alter table "public"."achievements" validate constraint "achievements_reset_grace_minutes_check";

alter table "public"."achievements" add constraint "achievements_reset_mode_check" CHECK ((reset_mode = ANY (ARRAY['none'::text, 'daily'::text, 'rolling'::text, 'windowed'::text]))) not valid;

alter table "public"."achievements" validate constraint "achievements_reset_mode_check";

alter table "public"."achievements" add constraint "achievements_rule_id_fkey" FOREIGN KEY (rule_id) REFERENCES public.achievement_rules(rule_id) ON DELETE SET NULL not valid;

alter table "public"."achievements" validate constraint "achievements_rule_id_fkey";

alter table "public"."admin_error_log" add constraint "admin_error_log_convention_id_fkey" FOREIGN KEY (convention_id) REFERENCES public.conventions(id) ON DELETE SET NULL not valid;

alter table "public"."admin_error_log" validate constraint "admin_error_log_convention_id_fkey";

alter table "public"."admin_error_log" add constraint "admin_error_log_severity_check" CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'error'::text, 'critical'::text]))) not valid;

alter table "public"."admin_error_log" validate constraint "admin_error_log_severity_check";

alter table "public"."audit_log" add constraint "audit_log_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."audit_log" validate constraint "audit_log_actor_id_fkey";

alter table "public"."catches" add constraint "catches_catcher_id_fkey" FOREIGN KEY (catcher_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."catches" validate constraint "catches_catcher_id_fkey";

alter table "public"."catches" add constraint "catches_convention_id_fkey" FOREIGN KEY (convention_id) REFERENCES public.conventions(id) ON DELETE SET NULL not valid;

alter table "public"."catches" validate constraint "catches_convention_id_fkey";

alter table "public"."catches" add constraint "catches_decided_by_user_id_fkey" FOREIGN KEY (decided_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."catches" validate constraint "catches_decided_by_user_id_fkey";

alter table "public"."catches" add constraint "catches_fursuit_id_fkey" FOREIGN KEY (fursuit_id) REFERENCES public.fursuits(id) ON DELETE CASCADE not valid;

alter table "public"."catches" validate constraint "catches_fursuit_id_fkey";

alter table "public"."catches" add constraint "catches_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACCEPTED'::text, 'REJECTED'::text, 'EXPIRED'::text]))) not valid;

alter table "public"."catches" validate constraint "catches_status_check";

alter table "public"."conventions" add constraint "conventions_slug_key" UNIQUE using index "conventions_slug_key";

alter table "public"."conventions" add constraint "geofence_requires_coordinates" CHECK (((geofence_enabled = false) OR ((latitude IS NOT NULL) AND (longitude IS NOT NULL)))) not valid;

alter table "public"."conventions" validate constraint "geofence_requires_coordinates";

alter table "public"."conventions" add constraint "location_verification_requires_enabled_geofence" CHECK (((location_verification_required = false) OR (geofence_enabled = true))) not valid;

alter table "public"."conventions" validate constraint "location_verification_requires_enabled_geofence";

alter table "public"."conventions" add constraint "valid_config_json" CHECK ((jsonb_typeof(config) = 'object'::text)) not valid;

alter table "public"."conventions" validate constraint "valid_config_json";

alter table "public"."conventions" add constraint "valid_geofence_radius" CHECK (((geofence_radius_meters >= 100) AND (geofence_radius_meters <= 10000))) not valid;

alter table "public"."conventions" validate constraint "valid_geofence_radius";

alter table "public"."conventions" add constraint "valid_latitude" CHECK (((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))) not valid;

alter table "public"."conventions" validate constraint "valid_latitude";

alter table "public"."conventions" add constraint "valid_longitude" CHECK (((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))) not valid;

alter table "public"."conventions" validate constraint "valid_longitude";

alter table "public"."daily_assignments" add constraint "daily_assignments_convention_day_position_key" UNIQUE using index "daily_assignments_convention_day_position_key";

alter table "public"."daily_assignments" add constraint "daily_assignments_convention_day_task_key" UNIQUE using index "daily_assignments_convention_day_task_key";

alter table "public"."daily_assignments" add constraint "daily_assignments_convention_id_fkey" FOREIGN KEY (convention_id) REFERENCES public.conventions(id) ON DELETE CASCADE not valid;

alter table "public"."daily_assignments" validate constraint "daily_assignments_convention_id_fkey";

alter table "public"."daily_assignments" add constraint "daily_assignments_position_check" CHECK (("position" > 0)) not valid;

alter table "public"."daily_assignments" validate constraint "daily_assignments_position_check";

alter table "public"."daily_assignments" add constraint "daily_assignments_task_id_fkey" FOREIGN KEY (task_id) REFERENCES public.daily_tasks(id) ON DELETE CASCADE not valid;

alter table "public"."daily_assignments" validate constraint "daily_assignments_task_id_fkey";

alter table "public"."daily_tasks" add constraint "daily_tasks_convention_id_fkey" FOREIGN KEY (convention_id) REFERENCES public.conventions(id) not valid;

alter table "public"."daily_tasks" validate constraint "daily_tasks_convention_id_fkey";

alter table "public"."daily_tasks" add constraint "daily_tasks_kind_check" CHECK ((kind = ANY (ARRAY['catch'::text, 'view_bio'::text, 'share'::text, 'leaderboard'::text, 'meta'::text]))) not valid;

alter table "public"."daily_tasks" validate constraint "daily_tasks_kind_check";

alter table "public"."daily_tasks" add constraint "daily_tasks_name_key" UNIQUE using index "daily_tasks_name_key";

alter table "public"."daily_tasks" add constraint "daily_tasks_requirement_check" CHECK ((requirement > 0)) not valid;

alter table "public"."daily_tasks" validate constraint "daily_tasks_requirement_check";

alter table "public"."daily_tasks" add constraint "daily_tasks_rule_id_fkey" FOREIGN KEY (rule_id) REFERENCES public.achievement_rules(rule_id) ON DELETE SET NULL not valid;

alter table "public"."daily_tasks" validate constraint "daily_tasks_rule_id_fkey";

alter table "public"."event_staff" add constraint "event_staff_assigned_by_user_id_fkey" FOREIGN KEY (assigned_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."event_staff" validate constraint "event_staff_assigned_by_user_id_fkey";

alter table "public"."event_staff" add constraint "event_staff_convention_id_fkey" FOREIGN KEY (convention_id) REFERENCES public.conventions(id) ON DELETE CASCADE not valid;

alter table "public"."event_staff" validate constraint "event_staff_convention_id_fkey";

alter table "public"."event_staff" add constraint "event_staff_profile_id_convention_id_key" UNIQUE using index "event_staff_profile_id_convention_id_key";

alter table "public"."event_staff" add constraint "event_staff_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."event_staff" validate constraint "event_staff_profile_id_fkey";

alter table "public"."event_staff" add constraint "event_staff_role_check" CHECK ((role = ANY (ARRAY['staff'::public.user_role, 'organizer'::public.user_role]))) not valid;

alter table "public"."event_staff" validate constraint "event_staff_role_check";

alter table "public"."event_staff" add constraint "event_staff_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text]))) not valid;

alter table "public"."event_staff" validate constraint "event_staff_status_check";

alter table "public"."events" add constraint "events_convention_id_fkey" FOREIGN KEY (convention_id) REFERENCES public.conventions(id) ON DELETE SET NULL not valid;

alter table "public"."events" validate constraint "events_convention_id_fkey";

alter table "public"."events" add constraint "events_type_check" CHECK ((char_length(btrim(type)) > 0)) not valid;

alter table "public"."events" validate constraint "events_type_check";

alter table "public"."events" add constraint "events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."events" validate constraint "events_user_id_fkey";

alter table "public"."fursuit_bios" add constraint "fursuit_bios_fursuit_id_fkey" FOREIGN KEY (fursuit_id) REFERENCES public.fursuits(id) ON DELETE CASCADE not valid;

alter table "public"."fursuit_bios" validate constraint "fursuit_bios_fursuit_id_fkey";

alter table "public"."fursuit_bios" add constraint "fursuit_bios_social_links_array_check" CHECK ((jsonb_typeof(social_links) = 'array'::text)) not valid;

alter table "public"."fursuit_bios" validate constraint "fursuit_bios_social_links_array_check";

alter table "public"."fursuit_bios" add constraint "fursuit_bios_version_check" CHECK ((version > 0)) not valid;

alter table "public"."fursuit_bios" validate constraint "fursuit_bios_version_check";

alter table "public"."fursuit_color_assignments" add constraint "fursuit_color_assignments_color_id_fkey" FOREIGN KEY (color_id) REFERENCES public.fursuit_colors(id) not valid;

alter table "public"."fursuit_color_assignments" validate constraint "fursuit_color_assignments_color_id_fkey";

alter table "public"."fursuit_color_assignments" add constraint "fursuit_color_assignments_fursuit_id_fkey" FOREIGN KEY (fursuit_id) REFERENCES public.fursuits(id) ON DELETE CASCADE not valid;

alter table "public"."fursuit_color_assignments" validate constraint "fursuit_color_assignments_fursuit_id_fkey";

alter table "public"."fursuit_color_assignments" add constraint "fursuit_color_assignments_position_check" CHECK ((("position" >= 1) AND ("position" <= 3))) not valid;

alter table "public"."fursuit_color_assignments" validate constraint "fursuit_color_assignments_position_check";

alter table "public"."fursuit_color_assignments" add constraint "fursuit_color_assignments_unique_color" UNIQUE using index "fursuit_color_assignments_unique_color";

alter table "public"."fursuit_color_assignments" add constraint "fursuit_color_assignments_unique_position" UNIQUE using index "fursuit_color_assignments_unique_position";

alter table "public"."fursuit_conventions" add constraint "fursuit_conventions_convention_id_fkey" FOREIGN KEY (convention_id) REFERENCES public.conventions(id) ON DELETE CASCADE not valid;

alter table "public"."fursuit_conventions" validate constraint "fursuit_conventions_convention_id_fkey";

alter table "public"."fursuit_conventions" add constraint "fursuit_conventions_fursuit_id_fkey" FOREIGN KEY (fursuit_id) REFERENCES public.fursuits(id) ON DELETE CASCADE not valid;

alter table "public"."fursuit_conventions" validate constraint "fursuit_conventions_fursuit_id_fkey";

alter table "public"."fursuit_species" add constraint "fursuit_species_name_length_check" CHECK (((char_length(btrim(name)) >= 2) AND (char_length(btrim(name)) <= 120))) not valid;

alter table "public"."fursuit_species" validate constraint "fursuit_species_name_length_check";

alter table "public"."fursuits" add constraint "fursuits_catch_mode_check" CHECK ((catch_mode = ANY (ARRAY['AUTO_ACCEPT'::text, 'MANUAL_APPROVAL'::text]))) not valid;

alter table "public"."fursuits" validate constraint "fursuits_catch_mode_check";

alter table "public"."fursuits" add constraint "fursuits_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."fursuits" validate constraint "fursuits_owner_id_fkey";

alter table "public"."fursuits" add constraint "fursuits_species_id_fkey" FOREIGN KEY (species_id) REFERENCES public.fursuit_species(id) ON DELETE RESTRICT not valid;

alter table "public"."fursuits" validate constraint "fursuits_species_id_fkey";

alter table "public"."fursuits" add constraint "fursuits_unique_code_check" CHECK ((length(unique_code) < 9)) not valid;

alter table "public"."fursuits" validate constraint "fursuits_unique_code_check";

alter table "public"."notifications" add constraint "notifications_type_check" CHECK ((char_length(btrim(type)) > 0)) not valid;

alter table "public"."notifications" validate constraint "notifications_type_check";

alter table "public"."notifications" add constraint "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."notifications" validate constraint "notifications_user_id_fkey";

alter table "public"."profile_conventions" add constraint "profile_conventions_convention_id_fkey" FOREIGN KEY (convention_id) REFERENCES public.conventions(id) ON DELETE CASCADE not valid;

alter table "public"."profile_conventions" validate constraint "profile_conventions_convention_id_fkey";

alter table "public"."profile_conventions" add constraint "profile_conventions_override_actor_id_fkey" FOREIGN KEY (override_actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."profile_conventions" validate constraint "profile_conventions_override_actor_id_fkey";

alter table "public"."profile_conventions" add constraint "profile_conventions_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."profile_conventions" validate constraint "profile_conventions_profile_id_fkey";

alter table "public"."profile_conventions" add constraint "valid_verification_method" CHECK ((verification_method = ANY (ARRAY['none'::text, 'gps'::text, 'manual_override'::text, 'grandfathered'::text]))) not valid;

alter table "public"."profile_conventions" validate constraint "valid_verification_method";

alter table "public"."profiles" add constraint "profiles_default_catch_mode_check" CHECK ((default_catch_mode = ANY (ARRAY['AUTO_ACCEPT'::text, 'MANUAL_ACCEPT'::text]))) not valid;

alter table "public"."profiles" validate constraint "profiles_default_catch_mode_check";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

alter table "public"."profiles" add constraint "profiles_username_key" UNIQUE using index "profiles_username_key";

alter table "public"."profiles" add constraint "valid_location_permission" CHECK ((location_permission_status = ANY (ARRAY['not_requested'::text, 'granted'::text, 'denied'::text, 'restricted'::text]))) not valid;

alter table "public"."profiles" validate constraint "valid_location_permission";

alter table "public"."push_notification_retry_queue" add constraint "push_notification_retry_queue_notification_id_fkey" FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE CASCADE not valid;

alter table "public"."push_notification_retry_queue" validate constraint "push_notification_retry_queue_notification_id_fkey";

alter table "public"."push_notification_retry_queue" add constraint "push_notification_retry_queue_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."push_notification_retry_queue" validate constraint "push_notification_retry_queue_user_id_fkey";

alter table "public"."tag_scans" add constraint "tag_scans_result_check" CHECK ((result = ANY (ARRAY['success'::text, 'cooldown'::text, 'invalid'::text, 'not_found'::text, 'lost'::text, 'revoked'::text]))) not valid;

alter table "public"."tag_scans" validate constraint "tag_scans_result_check";

alter table "public"."tag_scans" add constraint "tag_scans_scan_method_check" CHECK ((scan_method = ANY (ARRAY['nfc'::text, 'qr'::text]))) not valid;

alter table "public"."tag_scans" validate constraint "tag_scans_scan_method_check";

alter table "public"."tag_scans" add constraint "tag_scans_scanner_user_id_fkey" FOREIGN KEY (scanner_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."tag_scans" validate constraint "tag_scans_scanner_user_id_fkey";

alter table "public"."tag_scans" add constraint "tag_scans_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE not valid;

alter table "public"."tag_scans" validate constraint "tag_scans_tag_id_fkey";

alter table "public"."tags" add constraint "nfc_tags_fursuit_id_fkey" FOREIGN KEY (fursuit_id) REFERENCES public.fursuits(id) ON DELETE CASCADE not valid;

alter table "public"."tags" validate constraint "nfc_tags_fursuit_id_fkey";

-- nfc_tags_status_check removed: conflicted with tags_status_check (legacy constraint from earlier iteration)

alter table "public"."tags" add constraint "tags_identifier_present" CHECK (((nfc_uid IS NOT NULL) OR (qr_token IS NOT NULL))) not valid;

alter table "public"."tags" validate constraint "tags_identifier_present";

alter table "public"."tags" add constraint "tags_nfc_uid_key" UNIQUE using index "tags_nfc_uid_key";

alter table "public"."tags" add constraint "tags_qr_token_key" UNIQUE using index "tags_qr_token_key";

alter table "public"."tags" add constraint "tags_registered_by_user_id_fkey" FOREIGN KEY (registered_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."tags" validate constraint "tags_registered_by_user_id_fkey";

alter table "public"."tags" add constraint "tags_status_check" CHECK ((status = ANY (ARRAY['registered'::text, 'linked'::text, 'unlinked'::text, 'disabled'::text]))) not valid;

alter table "public"."tags" validate constraint "tags_status_check";

alter table "public"."user_achievements" add constraint "user_achievements_achievement_id_fkey" FOREIGN KEY (achievement_id) REFERENCES public.achievements(id) ON DELETE CASCADE not valid;

alter table "public"."user_achievements" validate constraint "user_achievements_achievement_id_fkey";

alter table "public"."user_achievements" add constraint "user_achievements_user_id_achievement_id_key" UNIQUE using index "user_achievements_user_id_achievement_id_key";

alter table "public"."user_achievements" add constraint "user_achievements_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_achievements" validate constraint "user_achievements_user_id_fkey";

alter table "public"."user_blocks" add constraint "user_blocks_blocked_id_fkey" FOREIGN KEY (blocked_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."user_blocks" validate constraint "user_blocks_blocked_id_fkey";

alter table "public"."user_blocks" add constraint "user_blocks_blocker_id_fkey" FOREIGN KEY (blocker_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."user_blocks" validate constraint "user_blocks_blocker_id_fkey";

alter table "public"."user_blocks" add constraint "user_blocks_no_self_block" CHECK ((blocker_id <> blocked_id)) not valid;

alter table "public"."user_blocks" validate constraint "user_blocks_no_self_block";

alter table "public"."user_blocks" add constraint "user_blocks_unique_pair" UNIQUE using index "user_blocks_unique_pair";

alter table "public"."user_daily_progress" add constraint "user_daily_progress_completion_chk" CHECK ((((is_completed = false) AND (completed_at IS NULL)) OR ((is_completed = true) AND (completed_at IS NOT NULL)))) not valid;

alter table "public"."user_daily_progress" validate constraint "user_daily_progress_completion_chk";

alter table "public"."user_daily_progress" add constraint "user_daily_progress_convention_id_fkey" FOREIGN KEY (convention_id) REFERENCES public.conventions(id) ON DELETE CASCADE not valid;

alter table "public"."user_daily_progress" validate constraint "user_daily_progress_convention_id_fkey";

alter table "public"."user_daily_progress" add constraint "user_daily_progress_current_count_check" CHECK ((current_count >= 0)) not valid;

alter table "public"."user_daily_progress" validate constraint "user_daily_progress_current_count_check";

alter table "public"."user_daily_progress" add constraint "user_daily_progress_task_id_fkey" FOREIGN KEY (task_id) REFERENCES public.daily_tasks(id) ON DELETE CASCADE not valid;

alter table "public"."user_daily_progress" validate constraint "user_daily_progress_task_id_fkey";

alter table "public"."user_daily_progress" add constraint "user_daily_progress_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_daily_progress" validate constraint "user_daily_progress_user_id_fkey";

alter table "public"."user_daily_streaks" add constraint "user_daily_streaks_best_streak_check" CHECK ((best_streak >= 0)) not valid;

alter table "public"."user_daily_streaks" validate constraint "user_daily_streaks_best_streak_check";

alter table "public"."user_daily_streaks" add constraint "user_daily_streaks_check" CHECK ((best_streak >= current_streak)) not valid;

alter table "public"."user_daily_streaks" validate constraint "user_daily_streaks_check";

alter table "public"."user_daily_streaks" add constraint "user_daily_streaks_convention_id_fkey" FOREIGN KEY (convention_id) REFERENCES public.conventions(id) ON DELETE CASCADE not valid;

alter table "public"."user_daily_streaks" validate constraint "user_daily_streaks_convention_id_fkey";

alter table "public"."user_daily_streaks" add constraint "user_daily_streaks_current_streak_check" CHECK ((current_streak >= 0)) not valid;

alter table "public"."user_daily_streaks" validate constraint "user_daily_streaks_current_streak_check";

alter table "public"."user_daily_streaks" add constraint "user_daily_streaks_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_daily_streaks" validate constraint "user_daily_streaks_user_id_fkey";

alter table "public"."user_moderation_actions" add constraint "user_moderation_actions_action_type_check" CHECK ((action_type = ANY (ARRAY['warning'::text, 'mute'::text, 'ban'::text, 'suspension'::text]))) not valid;

alter table "public"."user_moderation_actions" validate constraint "user_moderation_actions_action_type_check";

alter table "public"."user_moderation_actions" add constraint "user_moderation_actions_applied_by_user_id_fkey" FOREIGN KEY (applied_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."user_moderation_actions" validate constraint "user_moderation_actions_applied_by_user_id_fkey";

alter table "public"."user_moderation_actions" add constraint "user_moderation_actions_check" CHECK ((((scope = 'event'::text) AND (convention_id IS NOT NULL)) OR (scope = 'global'::text))) not valid;

alter table "public"."user_moderation_actions" validate constraint "user_moderation_actions_check";

alter table "public"."user_moderation_actions" add constraint "user_moderation_actions_check1" CHECK ((((duration_hours IS NOT NULL) AND (expires_at IS NOT NULL)) OR ((duration_hours IS NULL) AND (expires_at IS NULL)))) not valid;

alter table "public"."user_moderation_actions" validate constraint "user_moderation_actions_check1";

alter table "public"."user_moderation_actions" add constraint "user_moderation_actions_convention_id_fkey" FOREIGN KEY (convention_id) REFERENCES public.conventions(id) ON DELETE CASCADE not valid;

alter table "public"."user_moderation_actions" validate constraint "user_moderation_actions_convention_id_fkey";

alter table "public"."user_moderation_actions" add constraint "user_moderation_actions_revoked_by_user_id_fkey" FOREIGN KEY (revoked_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."user_moderation_actions" validate constraint "user_moderation_actions_revoked_by_user_id_fkey";

alter table "public"."user_moderation_actions" add constraint "user_moderation_actions_scope_check" CHECK ((scope = ANY (ARRAY['global'::text, 'event'::text]))) not valid;

alter table "public"."user_moderation_actions" validate constraint "user_moderation_actions_scope_check";

alter table "public"."user_moderation_actions" add constraint "user_moderation_actions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."user_moderation_actions" validate constraint "user_moderation_actions_user_id_fkey";

alter table "public"."user_reports" add constraint "user_reports_check" CHECK (((reported_user_id IS NOT NULL) OR (reported_fursuit_id IS NOT NULL))) not valid;

alter table "public"."user_reports" validate constraint "user_reports_check";

alter table "public"."user_reports" add constraint "user_reports_convention_id_fkey" FOREIGN KEY (convention_id) REFERENCES public.conventions(id) ON DELETE SET NULL not valid;

alter table "public"."user_reports" validate constraint "user_reports_convention_id_fkey";

alter table "public"."user_reports" add constraint "user_reports_report_type_check" CHECK ((report_type = ANY (ARRAY['inappropriate_content'::text, 'harassment'::text, 'cheating'::text, 'spam'::text, 'other'::text]))) not valid;

alter table "public"."user_reports" validate constraint "user_reports_report_type_check";

alter table "public"."user_reports" add constraint "user_reports_reported_fursuit_id_fkey" FOREIGN KEY (reported_fursuit_id) REFERENCES public.fursuits(id) ON DELETE CASCADE not valid;

alter table "public"."user_reports" validate constraint "user_reports_reported_fursuit_id_fkey";

alter table "public"."user_reports" add constraint "user_reports_reported_user_id_fkey" FOREIGN KEY (reported_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."user_reports" validate constraint "user_reports_reported_user_id_fkey";

alter table "public"."user_reports" add constraint "user_reports_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."user_reports" validate constraint "user_reports_reporter_id_fkey";

alter table "public"."user_reports" add constraint "user_reports_resolved_by_user_id_fkey" FOREIGN KEY (resolved_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."user_reports" validate constraint "user_reports_resolved_by_user_id_fkey";

alter table "public"."user_reports" add constraint "user_reports_severity_check" CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))) not valid;

alter table "public"."user_reports" validate constraint "user_reports_severity_check";

alter table "public"."user_reports" add constraint "user_reports_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'investigating'::text, 'resolved'::text, 'dismissed'::text]))) not valid;

alter table "public"."user_reports" validate constraint "user_reports_status_check";

alter table "public"."verification_attempts" add constraint "verification_attempts_convention_id_fkey" FOREIGN KEY (convention_id) REFERENCES public.conventions(id) ON DELETE CASCADE not valid;

alter table "public"."verification_attempts" validate constraint "verification_attempts_convention_id_fkey";

alter table "public"."verification_attempts" add constraint "verification_attempts_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."verification_attempts" validate constraint "verification_attempts_profile_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.archive_gameplay_event_queue_message(p_message_id bigint)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$
  select coalesce((
    select *
    from pgmq.archive('gameplay_event_processing', p_message_id)
  ), false);
$function$
;

CREATE OR REPLACE FUNCTION public.archive_old_events()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Create archived_events table if not exists
  CREATE TABLE IF NOT EXISTS public.archived_events AS
  SELECT * FROM public.events
  WHERE occurred_at < NOW() - INTERVAL '365 days'
  AND NOT EXISTS (
    SELECT 1 FROM public.archived_events ae
    WHERE ae.event_id = events.event_id
  );
  
  -- Delete from main table after archival
  DELETE FROM public.events
  WHERE occurred_at < NOW() - INTERVAL '730 days'; -- 2 years
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_log_hash_ip_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.ip_address IS NOT NULL THEN
    NEW.ip_address := hash_ip_address(NEW.ip_address)::inet;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_catch_expiration()
 RETURNS timestamp with time zone
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Returns timestamp 48 hours from now for catches without convention context
  SELECT now() + interval '48 hours';
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_catch_expiration(convention_id_param uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  conv_timezone TEXT;
  conv_end_date DATE;
  expiration_time TIMESTAMPTZ;
BEGIN
  -- Get convention timezone and end date
  SELECT timezone, end_date INTO conv_timezone, conv_end_date
  FROM conventions
  WHERE id = convention_id_param;

  -- If no convention found or missing data, default to 48 hours from now
  IF conv_end_date IS NULL OR conv_timezone IS NULL THEN
    RETURN NOW() + INTERVAL '48 hours';
  END IF;

  -- Calculate end of convention's last day (23:59:59 in convention timezone)
  -- conv_end_date is the last day of the convention
  -- We want 23:59:59 on that day in the convention's timezone
  expiration_time := (
    (conv_end_date + INTERVAL '1 day' - INTERVAL '1 second')
    AT TIME ZONE conv_timezone
  );

  -- FIX: If the convention has already ended, use 48 hours from now instead
  -- This prevents catches from being created with an expiration date in the past
  IF expiration_time < NOW() THEN
    RETURN NOW() + INTERVAL '48 hours';
  END IF;

  RETURN expiration_time;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_catch_block()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_id uuid;
BEGIN
  -- Look up the fursuit owner
  SELECT owner_id INTO v_owner_id
  FROM public.fursuits
  WHERE id = NEW.fursuit_id;

  -- If owner found and there's a block between catcher and owner, reject
  IF v_owner_id IS NOT NULL AND public.is_blocked(NEW.catcher_id, v_owner_id) THEN
    RAISE EXCEPTION 'Catch not allowed';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_unprocessed_events(p_batch_size integer DEFAULT 50, p_min_age_seconds integer DEFAULT 3)
 RETURNS SETOF public.events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_enabled boolean := coalesce(
    (app_private.edge_function_config_value('legacy_event_processor_enabled', 'false'::jsonb))::text::boolean,
    false
  );
begin
  if not v_enabled then
    raise warning 'public.claim_unprocessed_events() is disabled because legacy_event_processor_enabled=false';
    return;
  end if;

  return query
  with claimable as (
    select e.event_id
    from public.events e
    where e.processed_at is null
      and e.received_at < now() - make_interval(secs => greatest(coalesce(p_min_age_seconds, 0), 0))
    order by e.received_at asc
    limit greatest(coalesce(p_batch_size, 50), 1)
    for update skip locked
  )
  select e.*
  from public.events e
  inner join claimable c on c.event_id = e.event_id
  order by e.received_at asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Create archived_audit_log table if not exists
  CREATE TABLE IF NOT EXISTS public.archived_audit_log AS
  SELECT * FROM public.audit_log
  WHERE created_at < NOW() - INTERVAL '2 years'
  AND NOT EXISTS (
    SELECT 1 FROM public.archived_audit_log aal
    WHERE aal.id = audit_log.id
  );
  
  -- Delete from main table after 7 years
  DELETE FROM public.audit_log
  WHERE created_at < NOW() - INTERVAL '7 years';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  DELETE FROM public.notifications
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_catch(p_catch_id uuid, p_decision text, p_user_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_catch record;
  v_new_status text;
  v_result json;
  v_decided_at timestamptz := now();
begin
  if p_decision not in ('accept', 'reject') then
    raise exception 'Invalid decision. Must be accept or reject';
  end if;

  select
    c.*,
    f.owner_id,
    f.name as fursuit_name,
    f.is_tutorial as fursuit_is_tutorial,
    fs.name as species_name,
    coalesce((
      select jsonb_agg(fc.name order by fca.position)
      from public.fursuit_color_assignments fca
      join public.fursuit_colors fc on fc.id = fca.color_id
      where fca.fursuit_id = c.fursuit_id
    ), '[]'::jsonb) as color_names,
    p.username as catcher_username
  into v_catch
  from public.catches c
  join public.fursuits f on c.fursuit_id = f.id
  join public.profiles p on c.catcher_id = p.id
  left join public.fursuit_species fs on fs.id = f.species_id
  where c.id = p_catch_id
    and c.status = 'PENDING'
    and c.expires_at > now()
  for update of c;

  if not found then
    raise exception 'Catch not found or already decided';
  end if;

  if v_catch.owner_id != p_user_id then
    raise exception 'You do not own this fursuit';
  end if;

  v_new_status := case
    when p_decision = 'accept' then 'ACCEPTED'
    else 'REJECTED'
  end;

  update public.catches
  set
    status = v_new_status,
    decided_at = v_decided_at,
    decided_by_user_id = p_user_id,
    rejection_reason = case when p_decision = 'reject' then p_reason else null end
  where id = p_catch_id;

  perform public.notify_catch_decision(
    p_catch_id,
    v_catch.catcher_id,
    v_catch.fursuit_id,
    v_catch.fursuit_name,
    p_decision,
    p_reason
  );

  if p_decision = 'accept' then
    perform app_private.ingest_gameplay_event(
      'catch_confirmed',
      v_catch.catcher_id,
      v_catch.convention_id,
      jsonb_build_object(
        'catch_id', p_catch_id,
        'decision', p_decision
      ),
      v_decided_at,
      format('catch:%s:confirmed', p_catch_id)
    );

    perform app_private.ingest_gameplay_event(
      'catch_performed',
      v_catch.catcher_id,
      v_catch.convention_id,
      jsonb_build_object(
        'catch_id', p_catch_id,
        'fursuit_id', v_catch.fursuit_id,
        'fursuit_owner_id', v_catch.owner_id,
        'convention_id', v_catch.convention_id,
        'is_tutorial', coalesce(v_catch.is_tutorial, false) or coalesce(v_catch.fursuit_is_tutorial, false),
        'status', v_new_status,
        'source', 'catch_confirmed',
        'species', v_catch.species_name,
        'colors', v_catch.color_names
      ),
      v_decided_at,
      format('catch:%s:performed', p_catch_id)
    );
  end if;

  select json_build_object(
    'success', true,
    'catch_id', p_catch_id,
    'decision', p_decision,
    'status', v_new_status,
    'fursuit_name', v_catch.fursuit_name,
    'catcher_id', v_catch.catcher_id,
    'fursuit_id', v_catch.fursuit_id,
    'convention_id', v_catch.convention_id
  ) into v_result;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.count_accepted_catches_by_catcher_on_date(p_catcher_id uuid, p_convention_id uuid, p_timezone text, p_date date)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)
  FROM catches
  WHERE catcher_id = p_catcher_id
    AND convention_id = p_convention_id
    AND status = 'ACCEPTED'
    AND is_tutorial = false
    AND caught_at IS NOT NULL
    AND (caught_at AT TIME ZONE p_timezone)::date = p_date;
$function$
;

CREATE OR REPLACE FUNCTION public.count_distinct_conventions(user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COUNT(DISTINCT convention_id)::integer
  FROM catches
  WHERE catcher_id = user_id
    AND is_tutorial = false
    AND status = 'ACCEPTED'
    AND convention_id IS NOT NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.count_distinct_conventions_for_fursuit(p_fursuit_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(DISTINCT convention_id)
  FROM catches
  WHERE fursuit_id = p_fursuit_id
    AND convention_id IS NOT NULL
    AND status = 'ACCEPTED'
    AND is_tutorial = false;
$function$
;

CREATE OR REPLACE FUNCTION public.count_distinct_local_days_for_fursuit_at_convention(p_fursuit_id uuid, p_convention_id uuid, p_timezone text)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(DISTINCT (caught_at AT TIME ZONE p_timezone)::date)
  FROM catches
  WHERE fursuit_id = p_fursuit_id
    AND convention_id = p_convention_id
    AND status = 'ACCEPTED'
    AND is_tutorial = false
    AND caught_at IS NOT NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.count_distinct_species_caught(user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COUNT(DISTINCT f.species_id)::integer
  FROM catches c
  JOIN fursuits f ON f.id = c.fursuit_id
  WHERE c.catcher_id = user_id
    AND c.is_tutorial = false
    AND c.status = 'ACCEPTED'
    AND f.species_id IS NOT NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.count_real_achievements_for_user(p_user_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)
  FROM user_achievements ua
  JOIN achievements a ON ua.achievement_id = a.id
  WHERE ua.user_id = p_user_id
    AND a.key NOT LIKE 'DAILY_TASK_%';
$function$
;

CREATE OR REPLACE FUNCTION public.count_unique_catchers_for_fursuit_lifetime(p_fursuit_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(DISTINCT catcher_id)
  FROM catches
  WHERE fursuit_id = p_fursuit_id
    AND status = 'ACCEPTED'
    AND is_tutorial = false;
$function$
;

CREATE OR REPLACE FUNCTION public.count_user_fursuits(p_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select count(*)::integer
  from public.fursuits
  where owner_id = p_user_id
    and is_tutorial = false;
$function$
;

CREATE OR REPLACE FUNCTION public.create_catch_with_approval(p_fursuit_id uuid, p_catcher_id uuid, p_convention_id uuid DEFAULT NULL::uuid, p_is_tutorial boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fursuit_mode text;
  v_fursuit_owner_id uuid;
  v_catch_status text;
  v_expires_at timestamptz;
  v_catch_id uuid;
  v_catch_number integer;
  v_result json;
BEGIN
  -- Get the fursuit's catch mode and owner
  SELECT catch_mode, owner_id
  INTO v_fursuit_mode, v_fursuit_owner_id
  FROM fursuits
  WHERE id = p_fursuit_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fursuit not found';
  END IF;
  
  -- Check if catcher is trying to catch their own fursuit
  IF v_fursuit_owner_id = p_catcher_id THEN
    RAISE EXCEPTION 'Cannot catch your own fursuit';
  END IF;
  
  -- Check for duplicate catches (scoped to convention)
  IF p_convention_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM catches
      WHERE fursuit_id = p_fursuit_id
      AND catcher_id = p_catcher_id
      AND convention_id = p_convention_id
      AND status IN ('ACCEPTED', 'PENDING')
    ) THEN
      RAISE EXCEPTION 'Fursuit already caught at this convention';
    END IF;
  ELSE
    -- Tutorial/no-convention: keep global duplicate check
    IF EXISTS (
      SELECT 1 FROM catches
      WHERE fursuit_id = p_fursuit_id
      AND catcher_id = p_catcher_id
      AND convention_id IS NULL
      AND status IN ('ACCEPTED', 'PENDING')
    ) THEN
      RAISE EXCEPTION 'Fursuit already caught or pending';
    END IF;
  END IF;
  
  -- Determine status based on catch mode
  IF v_fursuit_mode = 'MANUAL_APPROVAL' AND NOT p_is_tutorial THEN
    v_catch_status := 'PENDING';
    -- Use the existing calculate_catch_expiration function
    IF p_convention_id IS NOT NULL THEN
      v_expires_at := calculate_catch_expiration(p_convention_id);
    ELSE
      v_expires_at := calculate_catch_expiration();
    END IF;
  ELSE
    v_catch_status := 'ACCEPTED';
    v_expires_at := NULL;
  END IF;
  
  -- Insert the catch
  INSERT INTO catches (
    fursuit_id,
    catcher_id,
    convention_id,
    is_tutorial,
    status,
    expires_at,
    caught_at
  )
  VALUES (
    p_fursuit_id,
    p_catcher_id,
    p_convention_id,
    p_is_tutorial,
    v_catch_status,
    v_expires_at,
    now()
  )
  RETURNING id, catch_number INTO v_catch_id, v_catch_number;
  
  -- Return the result
  SELECT json_build_object(
    'catch_id', v_catch_id,
    'status', v_catch_status,
    'expires_at', v_expires_at,
    'catch_number', v_catch_number,
    'requires_approval', v_catch_status = 'PENDING',
    'fursuit_owner_id', v_fursuit_owner_id
  ) INTO v_result;
  
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_catch_with_approval(p_fursuit_id uuid, p_catcher_id uuid, p_convention_id uuid DEFAULT NULL::uuid, p_is_tutorial boolean DEFAULT false, p_force_pending boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fursuit_mode text;
  v_fursuit_owner_id uuid;
  v_catch_status text;
  v_expires_at timestamptz;
  v_catch_id uuid;
  v_catch_number integer;
  v_result json;
BEGIN
  -- Get the fursuit's catch mode and owner
  SELECT catch_mode, owner_id
  INTO v_fursuit_mode, v_fursuit_owner_id
  FROM fursuits
  WHERE id = p_fursuit_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fursuit not found';
  END IF;

  -- Check if catcher is trying to catch their own fursuit
  IF v_fursuit_owner_id = p_catcher_id THEN
    RAISE EXCEPTION 'Cannot catch your own fursuit';
  END IF;

  -- Check for duplicate catches (scoped to convention)
  IF p_convention_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM catches
      WHERE fursuit_id = p_fursuit_id
        AND catcher_id = p_catcher_id
        AND convention_id = p_convention_id
        AND status IN ('ACCEPTED', 'PENDING')
    ) THEN
      RAISE EXCEPTION 'Fursuit already caught at this convention';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM catches
      WHERE fursuit_id = p_fursuit_id
        AND catcher_id = p_catcher_id
        AND convention_id IS NULL
        AND status IN ('ACCEPTED', 'PENDING')
    ) THEN
      RAISE EXCEPTION 'Fursuit already caught or pending';
    END IF;
  END IF;

  -- Determine status: PENDING if manual approval mode OR force_pending flag set
  IF (v_fursuit_mode = 'MANUAL_APPROVAL' OR p_force_pending) AND NOT p_is_tutorial THEN
    v_catch_status := 'PENDING';
    IF p_convention_id IS NOT NULL THEN
      v_expires_at := calculate_catch_expiration(p_convention_id);
    ELSE
      v_expires_at := calculate_catch_expiration();
    END IF;
  ELSE
    v_catch_status := 'ACCEPTED';
    v_expires_at := NULL;
  END IF;

  -- Insert the catch (photo URL attached separately after upload succeeds)
  INSERT INTO catches (
    fursuit_id,
    catcher_id,
    convention_id,
    is_tutorial,
    status,
    expires_at,
    caught_at
  )
  VALUES (
    p_fursuit_id,
    p_catcher_id,
    p_convention_id,
    p_is_tutorial,
    v_catch_status,
    v_expires_at,
    now()
  )
  RETURNING id, catch_number INTO v_catch_id, v_catch_number;

  SELECT json_build_object(
    'catch_id', v_catch_id,
    'status', v_catch_status,
    'expires_at', v_expires_at,
    'catch_number', v_catch_number,
    'requires_approval', v_catch_status = 'PENDING',
    'fursuit_owner_id', v_fursuit_owner_id
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_profile_for_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_gameplay_event_queue_message(p_message_id bigint)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$
  select coalesce((
    select *
    from pgmq.delete('gameplay_event_processing', p_message_id)
  ), false);
$function$
;

CREATE OR REPLACE FUNCTION public.detect_duplicate_tag_users(p_tag_uid text, p_hours_ago integer DEFAULT 24)
 RETURNS TABLE(catcher_id uuid, scan_count bigint, last_seen timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ta.catcher_id,
    COUNT(*)::bigint as scan_count,
    MAX(ta.seen_at) as last_seen
  FROM tag_activity ta
  WHERE ta.tag_uid = p_tag_uid
    AND ta.seen_at >= now() - (p_hours_ago || ' hours')::interval
    AND ta.catcher_id IS NOT NULL
  GROUP BY ta.catcher_id
  HAVING COUNT(*) > 0
  ORDER BY scan_count DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_qr_asset_cleanup()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.qr_asset_path IS NOT NULL) THEN
    INSERT INTO public.qr_asset_cleanup_queue (tag_id, qr_asset_path)
    VALUES (OLD.id, OLD.qr_asset_path);
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.execute_data_retention_cleanup()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result jsonb;
  notifications_deleted int;
  events_archived int;
  audit_logs_archived int;
BEGIN
  -- Clean up old notifications
  DELETE FROM public.notifications
  WHERE created_at < NOW() - INTERVAL '90 days';
  notifications_deleted := FOUND::int;
  
  -- Archive old events
  INSERT INTO public.archived_events (
    event_id, user_id, convention_id, type, payload, occurred_at, received_at
  )
  SELECT event_id, user_id, convention_id, type, payload, occurred_at, received_at
  FROM public.events
  WHERE occurred_at < NOW() - INTERVAL '365 days'
  ON CONFLICT DO NOTHING;
  
  events_archived := (
    SELECT COUNT(*) FROM public.events
    WHERE occurred_at < NOW() - INTERVAL '365 days'
  );
  
  -- Delete very old events (2+ years)
  DELETE FROM public.events
  WHERE occurred_at < NOW() - INTERVAL '730 days';
  
  -- Archive old audit logs
  INSERT INTO public.archived_audit_log (
    id, actor_id, action, entity_type, entity_id, diff, context, ip_address, user_agent, created_at
  )
  SELECT id, actor_id, action, entity_type, entity_id, diff, context, ip_address, user_agent, created_at
  FROM public.audit_log
  WHERE created_at < NOW() - INTERVAL '2 years'
  ON CONFLICT DO NOTHING;
  
  audit_logs_archived := (
    SELECT COUNT(*) FROM public.audit_log
    WHERE created_at < NOW() - INTERVAL '2 years'
  );
  
  -- Delete very old audit logs (7+ years)
  DELETE FROM public.audit_log
  WHERE created_at < NOW() - INTERVAL '7 years';
  
  result := jsonb_build_object(
    'notifications_deleted', notifications_deleted,
    'events_archived', events_archived,
    'audit_logs_archived', audit_logs_archived,
    'executed_at', NOW()
  );
  
  RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.expire_bans()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  expired_ids uuid[];
BEGIN
  -- Find and clear expired profiles atomically
  WITH expired AS (
    UPDATE profiles
    SET is_suspended = false,
        suspended_until = NULL,
        suspension_reason = NULL
    WHERE is_suspended = true
      AND suspended_until IS NOT NULL
      AND suspended_until < now()
    RETURNING id
  )
  SELECT array_agg(id) INTO expired_ids FROM expired;

  -- Nothing to do
  IF expired_ids IS NULL THEN
    RETURN jsonb_build_object('success', true, 'expired_count', 0);
  END IF;

  -- Deactivate matching moderation action rows
  UPDATE user_moderation_actions
  SET is_active = false
  WHERE user_id = ANY(expired_ids)
    AND action_type = 'ban'
    AND is_active = true
    AND expires_at IS NOT NULL
    AND expires_at < now();

  -- Audit log entries (system actor = NULL)
  INSERT INTO audit_log (actor_id, action, entity_type, entity_id, context)
  SELECT NULL, 'ban_expired', 'profile', uid,
         jsonb_build_object('source', 'expire_bans_cron')
  FROM unnest(expired_ids) AS uid;

  RETURN jsonb_build_object(
    'success', true,
    'expired_count', array_length(expired_ids, 1)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.expire_moderation_actions()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE user_moderation_actions
  SET is_active = false
  WHERE is_active = true
    AND expires_at IS NOT NULL
    AND expires_at < now();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.expire_pending_catches()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_expired_catches json;
BEGIN
  -- Update all expired pending catches and collect their details for notifications
  WITH expired AS (
    UPDATE catches c
    SET status = 'EXPIRED'
    WHERE c.status = 'PENDING'
      AND c.expires_at <= now()
    RETURNING
      c.id,
      c.catcher_id,
      c.fursuit_id,
      (SELECT f.name FROM fursuits f WHERE f.id = c.fursuit_id) as fursuit_name,
      (SELECT f.owner_id FROM fursuits f WHERE f.id = c.fursuit_id) as owner_id,
      (SELECT p.username FROM profiles p WHERE p.id = c.catcher_id) as catcher_username
  )
  SELECT json_agg(expired) INTO v_expired_catches FROM expired;

  RETURN json_build_object(
    'success', true,
    'expired_count', COALESCE(json_array_length(v_expired_catches), 0),
    'expired_catches', COALESCE(v_expired_catches, '[]'::json),
    'timestamp', now()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fetch_unprocessed_events(batch_size integer DEFAULT 50, min_age_seconds integer DEFAULT 3)
 RETURNS TABLE(event_id uuid, user_id uuid, convention_id uuid, type text, payload jsonb, occurred_at timestamp with time zone, received_at timestamp with time zone, retry_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_enabled boolean := coalesce(
    (app_private.edge_function_config_value('legacy_event_processor_enabled', 'false'::jsonb))::text::boolean,
    false
  );
begin
  if not v_enabled then
    raise warning 'public.fetch_unprocessed_events() is disabled because legacy_event_processor_enabled=false';
    return;
  end if;

  return query
  with claimed as (
    select e.event_id
    from public.events e
    where e.processed_at is null
      and e.received_at < now() - make_interval(secs => greatest(coalesce(min_age_seconds, 0), 0))
      and e.retry_count < 5
    order by e.received_at asc
    limit greatest(coalesce(batch_size, 50), 1)
    for update skip locked
  ),
  updated as (
    update public.events e
    set retry_count = e.retry_count + 1
    from claimed c
    where e.event_id = c.event_id
    returning
      e.event_id,
      e.user_id,
      e.convention_id,
      e.type,
      e.payload,
      e.occurred_at,
      e.received_at,
      e.retry_count
  )
  select
    u.event_id,
    u.user_id,
    u.convention_id,
    u.type,
    u.payload,
    u.occurred_at,
    u.received_at,
    u.retry_count
  from updated u;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finish_onboarding(target_user_id uuid DEFAULT auth.uid())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  effective_user uuid := coalesce(target_user_id, auth.uid());
  profile_changed boolean := false;
  achievement_row_id uuid;
  achievement_created boolean := false;
begin
  if effective_user is null then
    raise exception using message = 'Missing authenticated user.';
  end if;

  if auth.uid() is distinct from effective_user then
    raise exception using message = 'You can only finish onboarding for yourself.';
  end if;

  update profiles
  set onboarding_completed = true,
      is_new = false,
      updated_at = now()
  where id = effective_user;

  profile_changed := found;
  if not profile_changed then
    raise exception using message = format('Profile %s not found.', effective_user);
  end if;

  -- Inline the getting_started achievement grant
  select id into achievement_row_id
  from achievements
  where key = 'GETTING_STARTED'
  limit 1;

  if achievement_row_id is not null then
    insert into user_achievements (user_id, achievement_id, unlocked_at)
    values (effective_user, achievement_row_id, now())
    on conflict (user_id, achievement_id) do nothing;
    
    achievement_created := found;
  end if;

  return jsonb_build_object(
    'profile_updated', profile_changed,
    'achievement_unlocked', achievement_created
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_profile_avatar_url(app_meta jsonb, user_meta jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  provider text := coalesce(app_meta->>'provider', 'email');
  candidate text;
begin
  candidate := nullif(
    trim(
      both from coalesce(
        user_meta->>'avatar_url',
        user_meta->>'picture',
        user_meta->>'avatar',
        user_meta->>'image',
        user_meta->>'photo'
      )
    ),
    ''
  );

  if candidate is null and provider = 'discord' then
    -- Discord can return avatar hash + provider_id without avatar_url; construct manually
    if coalesce(user_meta->>'provider_id', '') <> '' and coalesce(user_meta->>'avatar', '') <> '' then
      candidate := format(
        'https://cdn.discordapp.com/avatars/%s/%s.png',
        user_meta->>'provider_id',
        user_meta->>'avatar'
      );
    end if;
  end if;

  if candidate is null then
    return null;
  end if;

  -- Only allow http(s) URLs to avoid storing invalid data URLs or scripts
  if candidate ~* '^https?://' then
    return candidate;
  end if;

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_profile_username(app_meta jsonb, user_meta jsonb, user_email text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  provider text := coalesce(app_meta->>'provider', 'email');
  base_username text;
  sanitized_username text;
  final_username text;
begin
  if provider = 'discord' then
    base_username := nullif(
      trim(
        both from coalesce(
          user_meta->>'username',
          user_meta->>'user_name',
          user_meta->>'preferred_username',
          user_meta->>'full_name',
          user_meta->>'name'
        )
      ),
      ''
    );
  else
    base_username := nullif(trim(both from user_meta->>'username'), '');
  end if;

  if base_username is null then
    base_username := split_part(coalesce(user_email, ''), '@', 1);
  end if;

  if base_username is null or base_username = '' then
    base_username := 'pilot';
  end if;

  sanitized_username := lower(regexp_replace(base_username, '[^a-z0-9]+', '-', 'g'));
  sanitized_username := regexp_replace(sanitized_username, '(^-+|-+$)', '', 'g');

  if sanitized_username = '' then
    sanitized_username := 'pilot';
  end if;

  final_username := sanitized_username;

  loop
    exit when not exists (
      select 1 from public.profiles where username = final_username
    );

    final_username := sanitized_username || '-' || substring(md5(gen_random_uuid()::text) for 4);
  end loop;

  return final_username;
end;
$function$
;

-- geometry_dump type removed: managed by PostGIS extension

CREATE OR REPLACE FUNCTION public.get_blocked_users(p_user_id uuid)
 RETURNS TABLE(id uuid, blocker_id uuid, blocked_id uuid, blocked_username text, blocked_avatar_url text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    ub.id,
    ub.blocker_id,
    ub.blocked_id,
    p.username::text,
    p.avatar_url::text,
    ub.created_at
  FROM public.user_blocks ub
  JOIN public.profiles p ON p.id = ub.blocked_id
  WHERE ub.blocker_id = p_user_id
  ORDER BY ub.created_at DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_convention_leaderboard(p_convention_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(catcher_id uuid, convention_id uuid, username text, catch_count bigint, unique_fursuits bigint, unique_species bigint, last_catch_at timestamp with time zone, first_catch_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    catcher_id,
    convention_id,
    username,
    catch_count,
    unique_fursuits,
    unique_species,
    last_catch_at,
    first_catch_at
  FROM public.mv_convention_leaderboard
  WHERE (p_convention_id IS NULL OR convention_id = p_convention_id)
  ORDER BY catch_count DESC, unique_fursuits DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_event_dashboard_summary(p_convention_id uuid)
 RETURNS TABLE(total_catches bigint, active_players bigint, active_fursuits bigint, pending_approval bigint, avg_catches_per_hour numeric, peak_hour timestamp with time zone, total_achievements bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    -- Total catches (excluding tutorials and simulated)
    (
      SELECT COUNT(*)
      FROM catches
      WHERE convention_id = p_convention_id
        AND is_tutorial = false
        AND status = 'ACCEPTED'
        AND NOT EXISTS (
          SELECT 1 FROM audit_log
          WHERE audit_log.entity_type = 'catch'
            AND audit_log.entity_id = catches.id
            AND audit_log.action = 'simulate_catch'
        )
    )::BIGINT,

    -- Active players (distinct catchers)
    (
      SELECT COUNT(DISTINCT catcher_id)
      FROM catches
      WHERE convention_id = p_convention_id
    )::BIGINT,

    -- Active fursuits (distinct fursuits caught)
    (
      SELECT COUNT(DISTINCT fursuit_id)
      FROM catches
      WHERE convention_id = p_convention_id
    )::BIGINT,

    -- Pending approval count
    (
      SELECT COUNT(*)
      FROM catches
      WHERE convention_id = p_convention_id
        AND status = 'PENDING'
    )::BIGINT,

    -- Average catches per hour
    (
      SELECT COALESCE(AVG(catch_count), 0)::NUMERIC
      FROM mv_catches_hourly
      WHERE convention_id = p_convention_id
    ),

    -- Peak hour (hour with most catches)
    (
      SELECT hour_bucket
      FROM mv_catches_hourly
      WHERE convention_id = p_convention_id
      ORDER BY catch_count DESC
      LIMIT 1
    ),

    -- Total achievements unlocked by participants
    (
      SELECT COUNT(*)
      FROM user_achievements
      WHERE user_id IN (
        SELECT DISTINCT catcher_id
        FROM catches
        WHERE convention_id = p_convention_id
      )
    )::BIGINT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_fursuit_convention_stats(p_fursuit_id uuid, p_convention_id uuid)
 RETURNS TABLE(total_catches bigint, unique_catchers bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT 
    COUNT(*)::bigint AS total_catches,
    COUNT(DISTINCT catcher_id)::bigint AS unique_catchers
  FROM catches
  WHERE fursuit_id = p_fursuit_id
    AND convention_id = p_convention_id
    AND is_tutorial = false
    AND status = 'ACCEPTED';
$function$
;

CREATE OR REPLACE FUNCTION public.get_global_dashboard_summary()
 RETURNS TABLE(total_catches bigint, active_players bigint, active_fursuits bigint, pending_approval bigint, avg_catches_per_hour numeric, peak_hour timestamp with time zone, total_achievements bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    -- Total catches (excluding tutorials and simulated)
    (
      SELECT COUNT(*)
      FROM catches
      WHERE is_tutorial = false
        AND status = 'ACCEPTED'
        AND NOT EXISTS (
          SELECT 1 FROM audit_log
          WHERE audit_log.entity_type = 'catch'
            AND audit_log.entity_id = catches.id
            AND audit_log.action = 'simulate_catch'
        )
    )::BIGINT,

    -- Active players (distinct catchers)
    (
      SELECT COUNT(DISTINCT catcher_id)
      FROM catches
    )::BIGINT,

    -- Active fursuits (distinct fursuits caught)
    (
      SELECT COUNT(DISTINCT fursuit_id)
      FROM catches
    )::BIGINT,

    -- Pending approval count
    (
      SELECT COUNT(*)
      FROM catches
      WHERE status = 'PENDING'
    )::BIGINT,

    -- Average catches per hour across all conventions
    (
      SELECT COALESCE(AVG(catch_count), 0)::NUMERIC
      FROM mv_catches_hourly
    ),

    -- Peak hour globally
    (
      SELECT hour_bucket
      FROM mv_catches_hourly
      ORDER BY catch_count DESC
      LIMIT 1
    ),

    -- Total achievements unlocked
    (
      SELECT COUNT(*)
      FROM user_achievements
    )::BIGINT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_pending_catch_count(p_user_id uuid)
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)
  FROM catches c
  JOIN fursuits f ON c.fursuit_id = f.id
  WHERE f.owner_id = p_user_id
    AND c.status = 'PENDING'
    AND c.expires_at > now();
$function$
;

CREATE OR REPLACE FUNCTION public.get_pending_catches(p_user_id uuid)
 RETURNS TABLE(catch_id uuid, catcher_id uuid, catcher_username text, catcher_avatar_url text, fursuit_id uuid, fursuit_name text, fursuit_avatar_url text, caught_at timestamp with time zone, expires_at timestamp with time zone, convention_id uuid, convention_name text, time_remaining interval, catch_photo_url text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    c.id AS catch_id,
    c.catcher_id,
    p.username AS catcher_username,
    p.avatar_url AS catcher_avatar_url,
    c.fursuit_id,
    f.name AS fursuit_name,
    f.avatar_url AS fursuit_avatar_url,
    c.caught_at,
    c.expires_at,
    c.convention_id,
    conv.name AS convention_name,
    (c.expires_at - now()) AS time_remaining,
    c.catch_photo_url
  FROM catches c
  JOIN fursuits f ON c.fursuit_id = f.id
  JOIN profiles p ON c.catcher_id = p.id
  LEFT JOIN conventions conv ON c.convention_id = conv.id
  WHERE f.owner_id = p_user_id
    AND c.status = 'PENDING'
    AND c.expires_at > now()
  ORDER BY c.caught_at DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_moderation_summary(p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result json;
BEGIN
  SELECT json_build_object(
    'active_bans', (
      SELECT COUNT(*) FROM public.user_moderation_actions
      WHERE user_id = p_user_id AND action_type = 'ban' AND is_active = true
    ),
    'report_count', (
      SELECT COUNT(*) FROM public.user_reports
      WHERE reported_user_id = p_user_id
    ),
    'pending_reports', (
      SELECT COUNT(*) FROM public.user_reports
      WHERE reported_user_id = p_user_id AND status = 'pending'
    ),
    'users_blocked', (
      SELECT COUNT(DISTINCT blocked_id) FROM public.user_blocks
      WHERE blocked_id = p_user_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
 RETURNS public.user_role
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT role FROM profiles WHERE id = user_id;
$function$
;

CREATE OR REPLACE FUNCTION public.grant_achievements_batch(awards jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  award jsonb;
  achievement_record record;
  existing_count integer;
  result jsonb := '[]'::jsonb;
  user_achievement_id uuid;
  awarded_at timestamptz;
begin
  for award in select * from jsonb_array_elements(awards)
  loop
    select id, key, rule_id
    into achievement_record
    from achievements
    where key = award->>'achievement_key'
      and is_active = true
    limit 1;

    if not found then
      result := result || jsonb_build_object(
        'achievement_key', award->>'achievement_key',
        'user_id', award->>'user_id',
        'awarded', false,
        'reason', 'achievement_not_found'
      );
      continue;
    end if;

    select count(*) into existing_count
    from user_achievements
    where user_id = (award->>'user_id')::uuid
      and achievement_id = achievement_record.id;

    if existing_count > 0 then
      result := result || jsonb_build_object(
        'achievement_key', award->>'achievement_key',
        'user_id', award->>'user_id',
        'awarded', false,
        'reason', 'already_awarded'
      );
      continue;
    end if;

    awarded_at := coalesce(
      nullif(award->>'occurred_at', '')::timestamptz,
      now()
    );

    insert into user_achievements (user_id, achievement_id, unlocked_at, context)
    values (
      (award->>'user_id')::uuid,
      achievement_record.id,
      awarded_at,
      coalesce(award->'context', '{}'::jsonb)
    )
    on conflict (user_id, achievement_id) do nothing
    returning id into user_achievement_id;

    if user_achievement_id is null then
      result := result || jsonb_build_object(
        'achievement_key', award->>'achievement_key',
        'user_id', award->>'user_id',
        'awarded', false,
        'reason', 'race_condition'
      );
      continue;
    end if;

    result := result || jsonb_build_object(
      'achievement_key', achievement_record.key,
      'achievement_id', achievement_record.id,
      'user_id', award->>'user_id',
      'awarded', true,
      'context', coalesce(award->'context', '{}'::jsonb),
      'awarded_at', to_jsonb(awarded_at),
      'source_event_id', award->>'source_event_id'
    );
  end loop;

  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  generated_username text;
begin
  generated_username := public.generate_profile_username(
    new.raw_app_meta_data,
    new.raw_user_meta_data,
    new.email
  );

  insert into public.profiles (id, username)
  values (new.id, generated_username)
  on conflict (id)
  do update set
    username = excluded.username;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.has_visible_gameplay_event_queue_messages()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$
  select exists (
    select 1
    from pgmq.q_gameplay_event_processing
    where vt <= now()
    limit 1
  );
$function$
;

CREATE OR REPLACE FUNCTION public.hash_ip_address(ip_addr inet)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Hash IP address using SHA256 with secret salt
  -- This makes IP addresses irreversible while still allowing lookups
  RETURN encode(
    digest(
      ip_addr::text || ':' || current_setting('app.audit_salt', true),
      'sha256'
    ),
    'hex'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ingest_gameplay_event(p_type text, p_user_id uuid, p_convention_id uuid, p_payload jsonb, p_occurred_at timestamp with time zone, p_idempotency_key text DEFAULT NULL::text)
 RETURNS TABLE(event_id uuid, duplicate boolean, enqueued boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select *
  from app_private.ingest_gameplay_event(
    p_type,
    p_user_id,
    p_convention_id,
    p_payload,
    p_occurred_at,
    p_idempotency_key
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id
    AND role IN ('owner', 'moderator', 'organizer', 'staff')
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin_user(check_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = check_user_id
        AND role = 'owner'
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_blocked(p_user_a uuid, p_user_b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = p_user_a AND blocked_id = p_user_b)
       OR (blocker_id = p_user_b AND blocked_id = p_user_a)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_event_staff(user_id uuid, convention_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM event_staff
    WHERE profile_id = user_id
    AND event_staff.convention_id = is_event_staff.convention_id
    AND status = 'active'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_moderator_or_higher(check_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = check_user_id
        AND role IN ('moderator', 'organizer', 'owner')
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_valid_event_type(p_event_type text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM allowed_event_types 
    WHERE event_type = p_event_type AND is_active = true
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.keep_fursuit_catch_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only increment count for accepted catches
    IF NEW.status = 'ACCEPTED' THEN
      UPDATE fursuits 
      SET catch_count = catch_count + 1 
      WHERE id = NEW.fursuit_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle status changes
    IF OLD.status != 'ACCEPTED' AND NEW.status = 'ACCEPTED' THEN
      -- Catch was just accepted
      UPDATE fursuits 
      SET catch_count = catch_count + 1 
      WHERE id = NEW.fursuit_id;
    ELSIF OLD.status = 'ACCEPTED' AND NEW.status != 'ACCEPTED' THEN
      -- Catch was un-accepted (shouldn't normally happen)
      UPDATE fursuits 
      SET catch_count = GREATEST(catch_count - 1, 0)
      WHERE id = NEW.fursuit_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Only decrement count if it was an accepted catch
    IF OLD.status = 'ACCEPTED' THEN
      UPDATE fursuits 
      SET catch_count = GREATEST(catch_count - 1, 0)
      WHERE id = OLD.fursuit_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_admin_action(p_actor_id uuid, p_action text, p_entity_type text, p_entity_id uuid DEFAULT NULL::uuid, p_diff jsonb DEFAULT NULL::jsonb, p_context jsonb DEFAULT NULL::jsonb, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    diff,
    context,
    ip_address,
    user_agent
  ) VALUES (
    p_actor_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_diff,
    p_context,
    p_ip_address,
    p_user_agent
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$function$
;

create materialized view "public"."mv_achievement_unlocks_daily" as  SELECT date_trunc('day'::text, unlocked_at) AS day_bucket,
    achievement_id,
    count(*) AS unlock_count
   FROM public.user_achievements
  WHERE (((context ->> 'granted_manually'::text) IS NULL) OR ((context ->> 'granted_manually'::text) = 'false'::text))
  GROUP BY (date_trunc('day'::text, unlocked_at)), achievement_id;


create materialized view "public"."mv_catches_hourly" as  SELECT convention_id,
    date_trunc('hour'::text, caught_at) AS hour_bucket,
    count(*) AS catch_count,
    count(DISTINCT catcher_id) AS unique_catchers,
    count(DISTINCT fursuit_id) AS unique_fursuits,
    avg(EXTRACT(epoch FROM (decided_at - caught_at))) AS avg_approval_seconds
   FROM public.catches
  WHERE ((status = 'ACCEPTED'::text) AND (is_tutorial = false) AND (NOT (EXISTS ( SELECT 1
           FROM public.audit_log
          WHERE ((audit_log.entity_type = 'catch'::text) AND (audit_log.entity_id = catches.id) AND (audit_log.action = 'simulate_catch'::text))))))
  GROUP BY convention_id, (date_trunc('hour'::text, caught_at));


create materialized view "public"."mv_convention_daily_stats" as  SELECT convention_id,
    date_trunc('day'::text, caught_at) AS day_bucket,
    count(*) AS total_catches,
    count(DISTINCT catcher_id) AS active_players,
    count(DISTINCT fursuit_id) AS active_fursuits,
    count(*) FILTER (WHERE (status = 'PENDING'::text)) AS pending_count,
    count(*) FILTER (WHERE (status = 'REJECTED'::text)) AS rejected_count
   FROM public.catches
  WHERE (is_tutorial = false)
  GROUP BY convention_id, (date_trunc('day'::text, caught_at));


create or replace view "public"."mv_convention_leaderboard" as  SELECT c.catcher_id,
    c.convention_id,
    p.username,
    count(*) AS catch_count,
    count(DISTINCT c.fursuit_id) AS unique_fursuits,
    count(DISTINCT f.species_id) AS unique_species,
    max(c.caught_at) AS last_catch_at,
    min(c.caught_at) AS first_catch_at
   FROM ((public.catches c
     JOIN public.profiles p ON ((p.id = c.catcher_id)))
     LEFT JOIN public.fursuits f ON ((f.id = c.fursuit_id)))
  WHERE ((c.status = 'ACCEPTED'::text) AND (c.is_tutorial = false))
  GROUP BY c.catcher_id, c.convention_id, p.username;


create or replace view "public"."mv_fursuit_popularity" as  SELECT c.fursuit_id,
    c.convention_id,
    f.name AS fursuit_name,
    f.avatar_url AS fursuit_avatar_url,
    f.owner_id,
    count(*) AS catch_count,
    count(DISTINCT c.catcher_id) AS unique_catchers,
    max(c.caught_at) AS last_caught_at,
    min(c.caught_at) AS first_caught_at
   FROM (public.catches c
     JOIN public.fursuits f ON ((f.id = c.fursuit_id)))
  WHERE ((c.status = 'ACCEPTED'::text) AND (c.is_tutorial = false))
  GROUP BY c.fursuit_id, c.convention_id, f.name, f.avatar_url, f.owner_id;


CREATE OR REPLACE FUNCTION public.notify_catch_decision(p_catch_id uuid, p_catcher_id uuid, p_fursuit_id uuid, p_fursuit_name text, p_decision text, p_rejection_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_notification_type text;
BEGIN
  -- Determine notification type based on decision
  IF p_decision = 'accept' THEN
    v_notification_type := 'catch_confirmed';
  ELSE
    v_notification_type := 'catch_rejected';
  END IF;
  
  -- Insert notification for catcher
  INSERT INTO notifications (
    user_id,
    type,
    payload,
    created_at
  )
  VALUES (
    p_catcher_id,
    v_notification_type,
    jsonb_build_object(
      'catch_id', p_catch_id,
      'fursuit_id', p_fursuit_id,
      'fursuit_name', p_fursuit_name,
      'decision', p_decision,
      'rejection_reason', p_rejection_reason
    ),
    now()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_catch_pending(p_catch_id uuid, p_fursuit_owner_id uuid, p_catcher_id uuid, p_fursuit_name text, p_catcher_username text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Insert notification for fursuit owner
  INSERT INTO notifications (
    user_id,
    type,
    payload,
    created_at
  )
  VALUES (
    p_fursuit_owner_id,
    'catch_pending',
    jsonb_build_object(
      'catch_id', p_catch_id,
      'catcher_id', p_catcher_id,
      'fursuit_name', p_fursuit_name,
      'catcher_username', p_catcher_username
    ),
    now()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.opt_in_to_convention(p_profile_id uuid, p_convention_id uuid, p_verified_location jsonb DEFAULT NULL::jsonb, p_verification_method text DEFAULT 'none'::text, p_override_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_convention RECORD;
  v_verification JSONB;
  v_method TEXT := COALESCE(p_verification_method, 'none');
BEGIN
  SELECT *
  INTO v_convention
  FROM public.conventions
  WHERE id = p_convention_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convention not found';
  END IF;

  -- Enforce verification server-side; never trust client-only gating
  IF v_convention.location_verification_required THEN
    IF NOT v_convention.geofence_enabled OR v_convention.latitude IS NULL OR v_convention.longitude IS NULL THEN
      RAISE EXCEPTION 'Convention geofence not configured';
    END IF;

    IF v_method = 'manual_override' THEN
      IF p_override_reason IS NULL THEN
        RAISE EXCEPTION 'Override reason required';
      END IF;
      -- RLS restricts overrides to admins; audit columns set below
    ELSE
      IF p_verified_location IS NULL THEN
        RAISE EXCEPTION 'Location verification required';
      END IF;

      v_verification := public.verify_convention_location(
        p_profile_id,
        p_convention_id,
        (p_verified_location->>'lat')::DOUBLE PRECISION,
        (p_verified_location->>'lng')::DOUBLE PRECISION,
        COALESCE((p_verified_location->>'accuracy')::INTEGER, 0)
      );

      IF (v_verification->>'verified')::BOOLEAN IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Location verification failed: %', COALESCE(v_verification->>'error', 'unknown');
      END IF;

      v_method := 'gps';
    END IF;
  ELSE
    IF p_verified_location IS NOT NULL THEN
      v_method := 'gps';
    END IF;
  END IF;

  INSERT INTO public.profile_conventions (
    profile_id,
    convention_id,
    verified_location,
    verification_method,
    verified_at,
    override_actor_id,
    override_reason,
    override_at,
    created_at
  )
  VALUES (
    p_profile_id,
    p_convention_id,
    p_verified_location,
    v_method,
    CASE WHEN v_method = 'gps' THEN NOW() ELSE NULL END,
    CASE WHEN v_method = 'manual_override' THEN auth.uid() ELSE NULL END,
    CASE WHEN v_method = 'manual_override' THEN p_override_reason ELSE NULL END,
    CASE WHEN v_method = 'manual_override' THEN NOW() ELSE NULL END,
    NOW()
  )
  ON CONFLICT (profile_id, convention_id) DO UPDATE
  SET
    verified_location = EXCLUDED.verified_location,
    verification_method = EXCLUDED.verification_method,
    verified_at = EXCLUDED.verified_at,
    override_actor_id = EXCLUDED.override_actor_id,
    override_reason = EXCLUDED.override_reason,
    override_at = EXCLUDED.override_at;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_achievement_queue_if_active()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  raise warning 'public.process_achievement_queue_if_active() is disabled. Use public.process_gameplay_queue_if_active() for the active worker or explicitly restore the legacy processor during rollback.';
  return;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_gameplay_queue_if_active()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
declare
  has_active boolean;
  has_backlog boolean;
  v_url text;
  v_key text;
  v_queue_enabled boolean;
begin
  v_queue_enabled := coalesce(
    (app_private.edge_function_config_value('gameplay_queue_enabled', 'true'::jsonb))::text::boolean,
    true
  );

  if not v_queue_enabled then
    return;
  end if;

  select exists (
    select 1
    from public.conventions
    where start_date is not null
      and end_date is not null
      and (start_date::date - interval '1 hour') <= now()
      and (end_date::date + interval '1 day' + interval '1 hour') >= now()
  ) into has_active;

  if not has_active then
    return;
  end if;

  select public.has_visible_gameplay_event_queue_messages() into has_backlog;

  if not has_backlog then
    return;
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'SUPABASE_URL'
  limit 1;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'SERVICE_ROLE_KEY'
  limit 1;

  if v_url is null or v_key is null then
    raise warning 'process_gameplay_queue_if_active: missing vault secrets SUPABASE_URL or SERVICE_ROLE_KEY';
    return;
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/process-gameplay-queue',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.invoke_edge_function(p_function_name text, p_body jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'SUPABASE_URL'
  limit 1;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'SERVICE_ROLE_KEY'
  limit 1;

  if v_url is null or v_key is null then
    raise warning 'invoke_edge_function: missing vault secrets SUPABASE_URL or SERVICE_ROLE_KEY for %', p_function_name;
    return;
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/' || p_function_name,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    ),
    body := coalesce(p_body, '{}'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.invoke_process_achievements_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.invoke_edge_function('process-achievements');
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.invoke_send_push_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.invoke_edge_function(
    'send-push',
    jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(new)
    )
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.purge_geo_verification_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  attempts_deleted INTEGER := 0;
  locations_cleared INTEGER := 0;
BEGIN
  WITH deleted AS (
    DELETE FROM verification_attempts va
    USING conventions c
    WHERE va.convention_id = c.id
      AND c.end_date IS NOT NULL
      AND (c.end_date::timestamptz + INTERVAL '1 day') < NOW()
    RETURNING 1
  )
  SELECT COUNT(*) INTO attempts_deleted FROM deleted;

  WITH cleared AS (
    UPDATE profile_conventions pc
    SET verified_location = NULL
    FROM conventions c
    WHERE pc.convention_id = c.id
      AND c.end_date IS NOT NULL
      AND (c.end_date::timestamptz + INTERVAL '1 day') < NOW()
      AND pc.verified_location IS NOT NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO locations_cleared FROM cleared;

  RETURN jsonb_build_object('attempts_deleted', attempts_deleted, 'locations_cleared', locations_cleared);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.read_gameplay_event_queue(p_visibility_timeout_seconds integer DEFAULT 30, p_batch_size integer DEFAULT 25)
 RETURNS TABLE(msg_id bigint, read_ct integer, enqueued_at timestamp with time zone, vt timestamp with time zone, message jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$
  select
    r.msg_id,
    r.read_ct,
    r.enqueued_at,
    r.vt,
    r.message
  from pgmq.read(
    'gameplay_event_processing',
    greatest(coalesce(p_visibility_timeout_seconds, 30), 1),
    greatest(coalesce(p_batch_size, 25), 1)
  ) as r;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_analytics_views()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Refresh all analytics materialized views concurrently
  -- CONCURRENTLY allows queries to continue while refreshing
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_catches_hourly;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_convention_daily_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_achievement_unlocks_daily;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_fursuit_popularity(convention_uuid uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Refresh the entire materialized view concurrently
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_fursuit_popularity;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_players(search_term text DEFAULT NULL::text, role_filter public.user_role DEFAULT NULL::public.user_role, convention_filter uuid DEFAULT NULL::uuid, is_suspended_filter boolean DEFAULT NULL::boolean, limit_count integer DEFAULT 50, offset_count integer DEFAULT 0)
 RETURNS TABLE(id uuid, username text, email text, role public.user_role, is_suspended boolean, suspended_until timestamp with time zone, avatar_url text, fursuit_count bigint, catch_count bigint, report_count bigint, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.username,
    au.email::text,
    p.role,
    p.is_suspended,
    p.suspended_until,
    p.avatar_url,
    COUNT(DISTINCT f.id) as fursuit_count,
    COUNT(DISTINCT c.id) as catch_count,
    COUNT(DISTINCT r.id) as report_count,
    p.created_at
  FROM profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  LEFT JOIN fursuits f ON f.owner_id = p.id
  LEFT JOIN catches c ON c.catcher_id = p.id
  LEFT JOIN user_reports r ON r.reported_user_id = p.id
  WHERE
    (search_term IS NULL OR
     p.username ILIKE '%' || search_term || '%' OR
     au.email ILIKE '%' || search_term || '%')
    AND (role_filter IS NULL OR p.role = role_filter)
    AND (is_suspended_filter IS NULL OR p.is_suspended = is_suspended_filter)
    AND (convention_filter IS NULL OR EXISTS (
      SELECT 1 FROM profile_conventions pc
      WHERE pc.profile_id = p.id AND pc.convention_id = convention_filter
    ))
  GROUP BY p.id, au.email
  ORDER BY p.created_at DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_catcher_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Only set catcher_id from auth.uid() if not already provided
  -- This allows RPC functions running as service role to explicitly set the catcher_id
  IF NEW.catcher_id IS NULL THEN
    NEW.catcher_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_fursuit_bios_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_fursuit_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$BEGIN
  NEW.owner_id := auth.uid();
  RETURN NEW;
END;$function$
;

CREATE OR REPLACE FUNCTION public.set_fursuit_species_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_user_report(p_reported_user_id uuid DEFAULT NULL::uuid, p_reported_fursuit_id uuid DEFAULT NULL::uuid, p_report_type text DEFAULT 'other'::text, p_description text DEFAULT ''::text, p_severity text DEFAULT 'medium'::text, p_convention_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reporter_id uuid := auth.uid();
  v_recent_count integer;
  v_report_id uuid;
BEGIN
  IF v_reporter_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_reported_user_id IS NULL AND p_reported_fursuit_id IS NULL THEN
    RAISE EXCEPTION 'Must specify a reported user or fursuit';
  END IF;

  IF p_reported_user_id = v_reporter_id THEN
    RAISE EXCEPTION 'Cannot report yourself';
  END IF;

  IF p_report_type NOT IN ('inappropriate_conduct', 'harassment', 'inappropriate_content', 'cheating', 'impersonation', 'other') THEN
    RAISE EXCEPTION 'Invalid report type';
  END IF;

  SELECT COUNT(*) INTO v_recent_count
  FROM public.user_reports
  WHERE reporter_id = v_reporter_id
    AND created_at > now() - interval '24 hours';

  IF v_recent_count >= 5 THEN
    RAISE EXCEPTION 'Report limit reached. You can submit more reports in 24 hours.';
  END IF;

  INSERT INTO public.user_reports (
    reporter_id,
    reported_user_id,
    reported_fursuit_id,
    report_type,
    description,
    severity,
    convention_id,
    status
  ) VALUES (
    v_reporter_id,
    p_reported_user_id,
    p_reported_fursuit_id,
    p_report_type,
    p_description,
    'medium',
    p_convention_id,
    'pending'
  )
  RETURNING id INTO v_report_id;

  RETURN v_report_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_fursuit_bio_owner_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.username IS DISTINCT FROM NEW.username AND NEW.username IS NOT NULL THEN
    UPDATE fursuit_bios
    SET owner_name = NEW.username
    WHERE fursuit_id IN (
      SELECT id FROM fursuits WHERE owner_id = NEW.id
    );
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_conventions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$begin
  new.updated_at = now();
  return new;
end;$function$
;

CREATE OR REPLACE FUNCTION public.touch_updated_at_utc()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_profiles_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;$function$
;

-- valid_detail type removed: managed by PostGIS extension

CREATE OR REPLACE FUNCTION public.verify_convention_location(p_profile_id uuid, p_convention_id uuid, p_user_lat double precision, p_user_lng double precision, p_accuracy integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_convention RECORD;
  v_distance_meters DECIMAL;
  v_effective_radius INTEGER := NULL;
  v_verified BOOLEAN := false;
  v_error TEXT := NULL;
  v_profile_role public.user_role := 'player';
BEGIN
  -- Fetch profile role (default to player when not found)
  SELECT role
  INTO v_profile_role
  FROM profiles
  WHERE id = p_profile_id;

  -- Fetch convention with geo data
  SELECT
    id,
    name,
    latitude,
    longitude,
    geofence_radius_meters,
    geofence_enabled,
    location_verification_required
  INTO v_convention
  FROM conventions
  WHERE id = p_convention_id;

  -- Convention not found
  IF NOT FOUND THEN
    v_error := 'Convention not found';
    RETURN jsonb_build_object('verified', false, 'error', v_error);
  END IF;

  -- Simple rate limit: 10 attempts/hour/profile (players only)
  IF v_profile_role = 'player' AND (
    SELECT COUNT(*)
    FROM verification_attempts
    WHERE profile_id = p_profile_id
      AND created_at > NOW() - INTERVAL '1 hour'
  ) >= 10 THEN
    v_error := 'Rate limit exceeded';
    RETURN jsonb_build_object('verified', false, 'error', v_error);
  END IF;

  -- Geo-verification disabled for this convention
  IF NOT v_convention.geofence_enabled OR NOT v_convention.location_verification_required THEN
    v_verified := true;
    v_effective_radius := v_convention.geofence_radius_meters;
  ELSE
    -- Convention requires verification; geofence must be configured
    IF v_convention.latitude IS NULL OR v_convention.longitude IS NULL THEN
      v_error := 'Convention geofence not configured';
      v_verified := false;
    ELSE
      -- City-wide tolerance: radius + accuracy allowance capped to 5km to prevent extreme spoofing
      v_effective_radius := v_convention.geofence_radius_meters + LEAST(GREATEST(p_accuracy, 0), 5000);

      v_distance_meters := ST_DistanceSphere(
        ST_MakePoint(p_user_lng, p_user_lat),
        ST_MakePoint(v_convention.longitude, v_convention.latitude)
      );

      v_verified := v_distance_meters <= v_effective_radius;
      IF NOT v_verified THEN
        v_error := 'Outside geofence';
      END IF;
    END IF;
  END IF;

  INSERT INTO verification_attempts (
    profile_id,
    convention_id,
    verified,
    distance_meters,
    gps_accuracy,
    error_code
  ) VALUES (
    p_profile_id,
    p_convention_id,
    v_verified,
    v_distance_meters,
    p_accuracy,
    v_error
  );

  RETURN jsonb_build_object(
    'verified', v_verified,
    'distance_meters', COALESCE(ROUND(v_distance_meters, 2), NULL),
    'convention_name', v_convention.name,
    'geofence_radius_meters', v_convention.geofence_radius_meters,
    'effective_radius_meters', v_effective_radius,
    'error', v_error
  );
END;
$function$
;

create or replace view "public"."fursuits_moderation" as  SELECT id,
    name,
    unique_code,
    owner_id,
    is_flagged,
    flagged_at,
    flagged_reason,
    created_at
   FROM public.fursuits
  WHERE (public.get_user_role(( SELECT auth.uid() AS uid)) = ANY (ARRAY['owner'::public.user_role, 'moderator'::public.user_role, 'organizer'::public.user_role]));


CREATE INDEX idx_catches_hourly_convention ON public.mv_catches_hourly USING btree (convention_id);

CREATE INDEX idx_daily_stats_convention ON public.mv_convention_daily_stats USING btree (convention_id);

CREATE INDEX idx_unlocks_day ON public.mv_achievement_unlocks_daily USING btree (day_bucket);

CREATE UNIQUE INDEX uq_achievement_unlocks_daily ON public.mv_achievement_unlocks_daily USING btree (day_bucket, achievement_id);

CREATE UNIQUE INDEX uq_catches_hourly ON public.mv_catches_hourly USING btree (convention_id, hour_bucket);

CREATE UNIQUE INDEX uq_convention_daily_stats ON public.mv_convention_daily_stats USING btree (convention_id, day_bucket);

grant delete on table "public"."achievement_rules" to "anon";

grant insert on table "public"."achievement_rules" to "anon";

grant references on table "public"."achievement_rules" to "anon";

grant select on table "public"."achievement_rules" to "anon";

grant trigger on table "public"."achievement_rules" to "anon";

grant truncate on table "public"."achievement_rules" to "anon";

grant update on table "public"."achievement_rules" to "anon";

grant delete on table "public"."achievement_rules" to "authenticated";

grant insert on table "public"."achievement_rules" to "authenticated";

grant references on table "public"."achievement_rules" to "authenticated";

grant select on table "public"."achievement_rules" to "authenticated";

grant trigger on table "public"."achievement_rules" to "authenticated";

grant truncate on table "public"."achievement_rules" to "authenticated";

grant update on table "public"."achievement_rules" to "authenticated";

grant delete on table "public"."achievement_rules" to "service_role";

grant insert on table "public"."achievement_rules" to "service_role";

grant references on table "public"."achievement_rules" to "service_role";

grant select on table "public"."achievement_rules" to "service_role";

grant trigger on table "public"."achievement_rules" to "service_role";

grant truncate on table "public"."achievement_rules" to "service_role";

grant update on table "public"."achievement_rules" to "service_role";

grant delete on table "public"."achievements" to "anon";

grant insert on table "public"."achievements" to "anon";

grant references on table "public"."achievements" to "anon";

grant select on table "public"."achievements" to "anon";

grant trigger on table "public"."achievements" to "anon";

grant truncate on table "public"."achievements" to "anon";

grant update on table "public"."achievements" to "anon";

grant delete on table "public"."achievements" to "authenticated";

grant insert on table "public"."achievements" to "authenticated";

grant references on table "public"."achievements" to "authenticated";

grant select on table "public"."achievements" to "authenticated";

grant trigger on table "public"."achievements" to "authenticated";

grant truncate on table "public"."achievements" to "authenticated";

grant update on table "public"."achievements" to "authenticated";

grant delete on table "public"."achievements" to "service_role";

grant insert on table "public"."achievements" to "service_role";

grant references on table "public"."achievements" to "service_role";

grant select on table "public"."achievements" to "service_role";

grant trigger on table "public"."achievements" to "service_role";

grant truncate on table "public"."achievements" to "service_role";

grant update on table "public"."achievements" to "service_role";

grant delete on table "public"."admin_error_log" to "anon";

grant insert on table "public"."admin_error_log" to "anon";

grant references on table "public"."admin_error_log" to "anon";

grant select on table "public"."admin_error_log" to "anon";

grant trigger on table "public"."admin_error_log" to "anon";

grant truncate on table "public"."admin_error_log" to "anon";

grant update on table "public"."admin_error_log" to "anon";

grant delete on table "public"."admin_error_log" to "authenticated";

grant insert on table "public"."admin_error_log" to "authenticated";

grant references on table "public"."admin_error_log" to "authenticated";

grant select on table "public"."admin_error_log" to "authenticated";

grant trigger on table "public"."admin_error_log" to "authenticated";

grant truncate on table "public"."admin_error_log" to "authenticated";

grant update on table "public"."admin_error_log" to "authenticated";

grant delete on table "public"."admin_error_log" to "service_role";

grant insert on table "public"."admin_error_log" to "service_role";

grant references on table "public"."admin_error_log" to "service_role";

grant select on table "public"."admin_error_log" to "service_role";

grant trigger on table "public"."admin_error_log" to "service_role";

grant truncate on table "public"."admin_error_log" to "service_role";

grant update on table "public"."admin_error_log" to "service_role";

grant delete on table "public"."allowed_event_types" to "anon";

grant insert on table "public"."allowed_event_types" to "anon";

grant references on table "public"."allowed_event_types" to "anon";

grant select on table "public"."allowed_event_types" to "anon";

grant trigger on table "public"."allowed_event_types" to "anon";

grant truncate on table "public"."allowed_event_types" to "anon";

grant update on table "public"."allowed_event_types" to "anon";

grant delete on table "public"."allowed_event_types" to "authenticated";

grant insert on table "public"."allowed_event_types" to "authenticated";

grant references on table "public"."allowed_event_types" to "authenticated";

grant select on table "public"."allowed_event_types" to "authenticated";

grant trigger on table "public"."allowed_event_types" to "authenticated";

grant truncate on table "public"."allowed_event_types" to "authenticated";

grant update on table "public"."allowed_event_types" to "authenticated";

grant delete on table "public"."allowed_event_types" to "service_role";

grant insert on table "public"."allowed_event_types" to "service_role";

grant references on table "public"."allowed_event_types" to "service_role";

grant select on table "public"."allowed_event_types" to "service_role";

grant trigger on table "public"."allowed_event_types" to "service_role";

grant truncate on table "public"."allowed_event_types" to "service_role";

grant update on table "public"."allowed_event_types" to "service_role";

grant delete on table "public"."audit_log" to "anon";

grant insert on table "public"."audit_log" to "anon";

grant references on table "public"."audit_log" to "anon";

grant select on table "public"."audit_log" to "anon";

grant trigger on table "public"."audit_log" to "anon";

grant truncate on table "public"."audit_log" to "anon";

grant update on table "public"."audit_log" to "anon";

grant delete on table "public"."audit_log" to "authenticated";

grant insert on table "public"."audit_log" to "authenticated";

grant references on table "public"."audit_log" to "authenticated";

grant select on table "public"."audit_log" to "authenticated";

grant trigger on table "public"."audit_log" to "authenticated";

grant truncate on table "public"."audit_log" to "authenticated";

grant update on table "public"."audit_log" to "authenticated";

grant delete on table "public"."audit_log" to "service_role";

grant insert on table "public"."audit_log" to "service_role";

grant references on table "public"."audit_log" to "service_role";

grant select on table "public"."audit_log" to "service_role";

grant trigger on table "public"."audit_log" to "service_role";

grant truncate on table "public"."audit_log" to "service_role";

grant update on table "public"."audit_log" to "service_role";

grant delete on table "public"."catches" to "anon";

grant insert on table "public"."catches" to "anon";

grant references on table "public"."catches" to "anon";

grant select on table "public"."catches" to "anon";

grant trigger on table "public"."catches" to "anon";

grant truncate on table "public"."catches" to "anon";

grant update on table "public"."catches" to "anon";

grant delete on table "public"."catches" to "authenticated";

grant insert on table "public"."catches" to "authenticated";

grant references on table "public"."catches" to "authenticated";

grant select on table "public"."catches" to "authenticated";

grant trigger on table "public"."catches" to "authenticated";

grant truncate on table "public"."catches" to "authenticated";

grant update on table "public"."catches" to "authenticated";

grant delete on table "public"."catches" to "service_role";

grant insert on table "public"."catches" to "service_role";

grant references on table "public"."catches" to "service_role";

grant select on table "public"."catches" to "service_role";

grant trigger on table "public"."catches" to "service_role";

grant truncate on table "public"."catches" to "service_role";

grant update on table "public"."catches" to "service_role";

grant delete on table "public"."conventions" to "anon";

grant insert on table "public"."conventions" to "anon";

grant references on table "public"."conventions" to "anon";

grant select on table "public"."conventions" to "anon";

grant trigger on table "public"."conventions" to "anon";

grant truncate on table "public"."conventions" to "anon";

grant update on table "public"."conventions" to "anon";

grant delete on table "public"."conventions" to "authenticated";

grant insert on table "public"."conventions" to "authenticated";

grant references on table "public"."conventions" to "authenticated";

grant select on table "public"."conventions" to "authenticated";

grant trigger on table "public"."conventions" to "authenticated";

grant truncate on table "public"."conventions" to "authenticated";

grant update on table "public"."conventions" to "authenticated";

grant delete on table "public"."conventions" to "service_role";

grant insert on table "public"."conventions" to "service_role";

grant references on table "public"."conventions" to "service_role";

grant select on table "public"."conventions" to "service_role";

grant trigger on table "public"."conventions" to "service_role";

grant truncate on table "public"."conventions" to "service_role";

grant update on table "public"."conventions" to "service_role";

grant delete on table "public"."daily_assignments" to "anon";

grant insert on table "public"."daily_assignments" to "anon";

grant references on table "public"."daily_assignments" to "anon";

grant select on table "public"."daily_assignments" to "anon";

grant trigger on table "public"."daily_assignments" to "anon";

grant truncate on table "public"."daily_assignments" to "anon";

grant update on table "public"."daily_assignments" to "anon";

grant delete on table "public"."daily_assignments" to "authenticated";

grant insert on table "public"."daily_assignments" to "authenticated";

grant references on table "public"."daily_assignments" to "authenticated";

grant select on table "public"."daily_assignments" to "authenticated";

grant trigger on table "public"."daily_assignments" to "authenticated";

grant truncate on table "public"."daily_assignments" to "authenticated";

grant update on table "public"."daily_assignments" to "authenticated";

grant delete on table "public"."daily_assignments" to "service_role";

grant insert on table "public"."daily_assignments" to "service_role";

grant references on table "public"."daily_assignments" to "service_role";

grant select on table "public"."daily_assignments" to "service_role";

grant trigger on table "public"."daily_assignments" to "service_role";

grant truncate on table "public"."daily_assignments" to "service_role";

grant update on table "public"."daily_assignments" to "service_role";

grant delete on table "public"."daily_tasks" to "anon";

grant insert on table "public"."daily_tasks" to "anon";

grant references on table "public"."daily_tasks" to "anon";

grant select on table "public"."daily_tasks" to "anon";

grant trigger on table "public"."daily_tasks" to "anon";

grant truncate on table "public"."daily_tasks" to "anon";

grant update on table "public"."daily_tasks" to "anon";

grant delete on table "public"."daily_tasks" to "authenticated";

grant insert on table "public"."daily_tasks" to "authenticated";

grant references on table "public"."daily_tasks" to "authenticated";

grant select on table "public"."daily_tasks" to "authenticated";

grant trigger on table "public"."daily_tasks" to "authenticated";

grant truncate on table "public"."daily_tasks" to "authenticated";

grant update on table "public"."daily_tasks" to "authenticated";

grant delete on table "public"."daily_tasks" to "service_role";

grant insert on table "public"."daily_tasks" to "service_role";

grant references on table "public"."daily_tasks" to "service_role";

grant select on table "public"."daily_tasks" to "service_role";

grant trigger on table "public"."daily_tasks" to "service_role";

grant truncate on table "public"."daily_tasks" to "service_role";

grant update on table "public"."daily_tasks" to "service_role";

grant delete on table "public"."edge_function_config" to "anon";

grant insert on table "public"."edge_function_config" to "anon";

grant references on table "public"."edge_function_config" to "anon";

grant select on table "public"."edge_function_config" to "anon";

grant trigger on table "public"."edge_function_config" to "anon";

grant truncate on table "public"."edge_function_config" to "anon";

grant update on table "public"."edge_function_config" to "anon";

grant delete on table "public"."edge_function_config" to "authenticated";

grant insert on table "public"."edge_function_config" to "authenticated";

grant references on table "public"."edge_function_config" to "authenticated";

grant select on table "public"."edge_function_config" to "authenticated";

grant trigger on table "public"."edge_function_config" to "authenticated";

grant truncate on table "public"."edge_function_config" to "authenticated";

grant update on table "public"."edge_function_config" to "authenticated";

grant delete on table "public"."edge_function_config" to "service_role";

grant insert on table "public"."edge_function_config" to "service_role";

grant references on table "public"."edge_function_config" to "service_role";

grant select on table "public"."edge_function_config" to "service_role";

grant trigger on table "public"."edge_function_config" to "service_role";

grant truncate on table "public"."edge_function_config" to "service_role";

grant update on table "public"."edge_function_config" to "service_role";

grant delete on table "public"."event_staff" to "anon";

grant insert on table "public"."event_staff" to "anon";

grant references on table "public"."event_staff" to "anon";

grant select on table "public"."event_staff" to "anon";

grant trigger on table "public"."event_staff" to "anon";

grant truncate on table "public"."event_staff" to "anon";

grant update on table "public"."event_staff" to "anon";

grant delete on table "public"."event_staff" to "authenticated";

grant insert on table "public"."event_staff" to "authenticated";

grant references on table "public"."event_staff" to "authenticated";

grant select on table "public"."event_staff" to "authenticated";

grant trigger on table "public"."event_staff" to "authenticated";

grant truncate on table "public"."event_staff" to "authenticated";

grant update on table "public"."event_staff" to "authenticated";

grant delete on table "public"."event_staff" to "service_role";

grant insert on table "public"."event_staff" to "service_role";

grant references on table "public"."event_staff" to "service_role";

grant select on table "public"."event_staff" to "service_role";

grant trigger on table "public"."event_staff" to "service_role";

grant truncate on table "public"."event_staff" to "service_role";

grant update on table "public"."event_staff" to "service_role";

grant delete on table "public"."events" to "anon";

grant insert on table "public"."events" to "anon";

grant references on table "public"."events" to "anon";

grant select on table "public"."events" to "anon";

grant trigger on table "public"."events" to "anon";

grant truncate on table "public"."events" to "anon";

grant update on table "public"."events" to "anon";

grant delete on table "public"."events" to "authenticated";

grant insert on table "public"."events" to "authenticated";

grant references on table "public"."events" to "authenticated";

grant select on table "public"."events" to "authenticated";

grant trigger on table "public"."events" to "authenticated";

grant truncate on table "public"."events" to "authenticated";

grant update on table "public"."events" to "authenticated";

grant delete on table "public"."events" to "service_role";

grant insert on table "public"."events" to "service_role";

grant references on table "public"."events" to "service_role";

grant select on table "public"."events" to "service_role";

grant trigger on table "public"."events" to "service_role";

grant truncate on table "public"."events" to "service_role";

grant update on table "public"."events" to "service_role";

grant delete on table "public"."fursuit_bios" to "anon";

grant insert on table "public"."fursuit_bios" to "anon";

grant references on table "public"."fursuit_bios" to "anon";

grant select on table "public"."fursuit_bios" to "anon";

grant trigger on table "public"."fursuit_bios" to "anon";

grant truncate on table "public"."fursuit_bios" to "anon";

grant update on table "public"."fursuit_bios" to "anon";

grant delete on table "public"."fursuit_bios" to "authenticated";

grant insert on table "public"."fursuit_bios" to "authenticated";

grant references on table "public"."fursuit_bios" to "authenticated";

grant select on table "public"."fursuit_bios" to "authenticated";

grant trigger on table "public"."fursuit_bios" to "authenticated";

grant truncate on table "public"."fursuit_bios" to "authenticated";

grant update on table "public"."fursuit_bios" to "authenticated";

grant delete on table "public"."fursuit_bios" to "service_role";

grant insert on table "public"."fursuit_bios" to "service_role";

grant references on table "public"."fursuit_bios" to "service_role";

grant select on table "public"."fursuit_bios" to "service_role";

grant trigger on table "public"."fursuit_bios" to "service_role";

grant truncate on table "public"."fursuit_bios" to "service_role";

grant update on table "public"."fursuit_bios" to "service_role";

grant delete on table "public"."fursuit_color_assignments" to "anon";

grant insert on table "public"."fursuit_color_assignments" to "anon";

grant references on table "public"."fursuit_color_assignments" to "anon";

grant select on table "public"."fursuit_color_assignments" to "anon";

grant trigger on table "public"."fursuit_color_assignments" to "anon";

grant truncate on table "public"."fursuit_color_assignments" to "anon";

grant update on table "public"."fursuit_color_assignments" to "anon";

grant delete on table "public"."fursuit_color_assignments" to "authenticated";

grant insert on table "public"."fursuit_color_assignments" to "authenticated";

grant references on table "public"."fursuit_color_assignments" to "authenticated";

grant select on table "public"."fursuit_color_assignments" to "authenticated";

grant trigger on table "public"."fursuit_color_assignments" to "authenticated";

grant truncate on table "public"."fursuit_color_assignments" to "authenticated";

grant update on table "public"."fursuit_color_assignments" to "authenticated";

grant delete on table "public"."fursuit_color_assignments" to "service_role";

grant insert on table "public"."fursuit_color_assignments" to "service_role";

grant references on table "public"."fursuit_color_assignments" to "service_role";

grant select on table "public"."fursuit_color_assignments" to "service_role";

grant trigger on table "public"."fursuit_color_assignments" to "service_role";

grant truncate on table "public"."fursuit_color_assignments" to "service_role";

grant update on table "public"."fursuit_color_assignments" to "service_role";

grant delete on table "public"."fursuit_colors" to "anon";

grant insert on table "public"."fursuit_colors" to "anon";

grant references on table "public"."fursuit_colors" to "anon";

grant select on table "public"."fursuit_colors" to "anon";

grant trigger on table "public"."fursuit_colors" to "anon";

grant truncate on table "public"."fursuit_colors" to "anon";

grant update on table "public"."fursuit_colors" to "anon";

grant delete on table "public"."fursuit_colors" to "authenticated";

grant insert on table "public"."fursuit_colors" to "authenticated";

grant references on table "public"."fursuit_colors" to "authenticated";

grant select on table "public"."fursuit_colors" to "authenticated";

grant trigger on table "public"."fursuit_colors" to "authenticated";

grant truncate on table "public"."fursuit_colors" to "authenticated";

grant update on table "public"."fursuit_colors" to "authenticated";

grant delete on table "public"."fursuit_colors" to "service_role";

grant insert on table "public"."fursuit_colors" to "service_role";

grant references on table "public"."fursuit_colors" to "service_role";

grant select on table "public"."fursuit_colors" to "service_role";

grant trigger on table "public"."fursuit_colors" to "service_role";

grant truncate on table "public"."fursuit_colors" to "service_role";

grant update on table "public"."fursuit_colors" to "service_role";

grant delete on table "public"."fursuit_conventions" to "anon";

grant insert on table "public"."fursuit_conventions" to "anon";

grant references on table "public"."fursuit_conventions" to "anon";

grant select on table "public"."fursuit_conventions" to "anon";

grant trigger on table "public"."fursuit_conventions" to "anon";

grant truncate on table "public"."fursuit_conventions" to "anon";

grant update on table "public"."fursuit_conventions" to "anon";

grant delete on table "public"."fursuit_conventions" to "authenticated";

grant insert on table "public"."fursuit_conventions" to "authenticated";

grant references on table "public"."fursuit_conventions" to "authenticated";

grant select on table "public"."fursuit_conventions" to "authenticated";

grant trigger on table "public"."fursuit_conventions" to "authenticated";

grant truncate on table "public"."fursuit_conventions" to "authenticated";

grant update on table "public"."fursuit_conventions" to "authenticated";

grant delete on table "public"."fursuit_conventions" to "service_role";

grant insert on table "public"."fursuit_conventions" to "service_role";

grant references on table "public"."fursuit_conventions" to "service_role";

grant select on table "public"."fursuit_conventions" to "service_role";

grant trigger on table "public"."fursuit_conventions" to "service_role";

grant truncate on table "public"."fursuit_conventions" to "service_role";

grant update on table "public"."fursuit_conventions" to "service_role";

grant delete on table "public"."fursuit_species" to "anon";

grant insert on table "public"."fursuit_species" to "anon";

grant references on table "public"."fursuit_species" to "anon";

grant select on table "public"."fursuit_species" to "anon";

grant trigger on table "public"."fursuit_species" to "anon";

grant truncate on table "public"."fursuit_species" to "anon";

grant update on table "public"."fursuit_species" to "anon";

grant delete on table "public"."fursuit_species" to "authenticated";

grant insert on table "public"."fursuit_species" to "authenticated";

grant references on table "public"."fursuit_species" to "authenticated";

grant select on table "public"."fursuit_species" to "authenticated";

grant trigger on table "public"."fursuit_species" to "authenticated";

grant truncate on table "public"."fursuit_species" to "authenticated";

grant update on table "public"."fursuit_species" to "authenticated";

grant delete on table "public"."fursuit_species" to "service_role";

grant insert on table "public"."fursuit_species" to "service_role";

grant references on table "public"."fursuit_species" to "service_role";

grant select on table "public"."fursuit_species" to "service_role";

grant trigger on table "public"."fursuit_species" to "service_role";

grant truncate on table "public"."fursuit_species" to "service_role";

grant update on table "public"."fursuit_species" to "service_role";

grant delete on table "public"."fursuits" to "anon";

grant insert on table "public"."fursuits" to "anon";

grant references on table "public"."fursuits" to "anon";

grant select on table "public"."fursuits" to "anon";

grant trigger on table "public"."fursuits" to "anon";

grant truncate on table "public"."fursuits" to "anon";

grant update on table "public"."fursuits" to "anon";

grant delete on table "public"."fursuits" to "authenticated";

grant insert on table "public"."fursuits" to "authenticated";

grant references on table "public"."fursuits" to "authenticated";

grant select on table "public"."fursuits" to "authenticated";

grant trigger on table "public"."fursuits" to "authenticated";

grant truncate on table "public"."fursuits" to "authenticated";

grant update on table "public"."fursuits" to "authenticated";

grant delete on table "public"."fursuits" to "service_role";

grant insert on table "public"."fursuits" to "service_role";

grant references on table "public"."fursuits" to "service_role";

grant select on table "public"."fursuits" to "service_role";

grant trigger on table "public"."fursuits" to "service_role";

grant truncate on table "public"."fursuits" to "service_role";

grant update on table "public"."fursuits" to "service_role";

grant delete on table "public"."notifications" to "anon";

grant insert on table "public"."notifications" to "anon";

grant references on table "public"."notifications" to "anon";

grant select on table "public"."notifications" to "anon";

grant trigger on table "public"."notifications" to "anon";

grant truncate on table "public"."notifications" to "anon";

grant update on table "public"."notifications" to "anon";

grant delete on table "public"."notifications" to "authenticated";

grant insert on table "public"."notifications" to "authenticated";

grant references on table "public"."notifications" to "authenticated";

grant select on table "public"."notifications" to "authenticated";

grant trigger on table "public"."notifications" to "authenticated";

grant truncate on table "public"."notifications" to "authenticated";

grant update on table "public"."notifications" to "authenticated";

grant delete on table "public"."notifications" to "service_role";

grant insert on table "public"."notifications" to "service_role";

grant references on table "public"."notifications" to "service_role";

grant select on table "public"."notifications" to "service_role";

grant trigger on table "public"."notifications" to "service_role";

grant truncate on table "public"."notifications" to "service_role";

grant update on table "public"."notifications" to "service_role";

grant delete on table "public"."profile_conventions" to "anon";

grant insert on table "public"."profile_conventions" to "anon";

grant references on table "public"."profile_conventions" to "anon";

grant select on table "public"."profile_conventions" to "anon";

grant trigger on table "public"."profile_conventions" to "anon";

grant truncate on table "public"."profile_conventions" to "anon";

grant update on table "public"."profile_conventions" to "anon";

grant delete on table "public"."profile_conventions" to "authenticated";

grant insert on table "public"."profile_conventions" to "authenticated";

grant references on table "public"."profile_conventions" to "authenticated";

grant select on table "public"."profile_conventions" to "authenticated";

grant trigger on table "public"."profile_conventions" to "authenticated";

grant truncate on table "public"."profile_conventions" to "authenticated";

grant update on table "public"."profile_conventions" to "authenticated";

grant delete on table "public"."profile_conventions" to "service_role";

grant insert on table "public"."profile_conventions" to "service_role";

grant references on table "public"."profile_conventions" to "service_role";

grant select on table "public"."profile_conventions" to "service_role";

grant trigger on table "public"."profile_conventions" to "service_role";

grant truncate on table "public"."profile_conventions" to "service_role";

grant update on table "public"."profile_conventions" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."push_notification_retry_queue" to "anon";

grant insert on table "public"."push_notification_retry_queue" to "anon";

grant references on table "public"."push_notification_retry_queue" to "anon";

grant select on table "public"."push_notification_retry_queue" to "anon";

grant trigger on table "public"."push_notification_retry_queue" to "anon";

grant truncate on table "public"."push_notification_retry_queue" to "anon";

grant update on table "public"."push_notification_retry_queue" to "anon";

grant delete on table "public"."push_notification_retry_queue" to "authenticated";

grant insert on table "public"."push_notification_retry_queue" to "authenticated";

grant references on table "public"."push_notification_retry_queue" to "authenticated";

grant select on table "public"."push_notification_retry_queue" to "authenticated";

grant trigger on table "public"."push_notification_retry_queue" to "authenticated";

grant truncate on table "public"."push_notification_retry_queue" to "authenticated";

grant update on table "public"."push_notification_retry_queue" to "authenticated";

grant delete on table "public"."push_notification_retry_queue" to "service_role";

grant insert on table "public"."push_notification_retry_queue" to "service_role";

grant references on table "public"."push_notification_retry_queue" to "service_role";

grant select on table "public"."push_notification_retry_queue" to "service_role";

grant trigger on table "public"."push_notification_retry_queue" to "service_role";

grant truncate on table "public"."push_notification_retry_queue" to "service_role";

grant update on table "public"."push_notification_retry_queue" to "service_role";

-- spatial_ref_sys grants removed: table owned by PostGIS extension, API access intentionally revoked

grant delete on table "public"."tag_scans" to "anon";

grant insert on table "public"."tag_scans" to "anon";

grant references on table "public"."tag_scans" to "anon";

grant select on table "public"."tag_scans" to "anon";

grant trigger on table "public"."tag_scans" to "anon";

grant truncate on table "public"."tag_scans" to "anon";

grant update on table "public"."tag_scans" to "anon";

grant delete on table "public"."tag_scans" to "authenticated";

grant insert on table "public"."tag_scans" to "authenticated";

grant references on table "public"."tag_scans" to "authenticated";

grant select on table "public"."tag_scans" to "authenticated";

grant trigger on table "public"."tag_scans" to "authenticated";

grant truncate on table "public"."tag_scans" to "authenticated";

grant update on table "public"."tag_scans" to "authenticated";

grant delete on table "public"."tag_scans" to "service_role";

grant insert on table "public"."tag_scans" to "service_role";

grant references on table "public"."tag_scans" to "service_role";

grant select on table "public"."tag_scans" to "service_role";

grant trigger on table "public"."tag_scans" to "service_role";

grant truncate on table "public"."tag_scans" to "service_role";

grant update on table "public"."tag_scans" to "service_role";

grant delete on table "public"."tags" to "anon";

grant insert on table "public"."tags" to "anon";

grant references on table "public"."tags" to "anon";

grant select on table "public"."tags" to "anon";

grant trigger on table "public"."tags" to "anon";

grant truncate on table "public"."tags" to "anon";

grant update on table "public"."tags" to "anon";

grant delete on table "public"."tags" to "authenticated";

grant insert on table "public"."tags" to "authenticated";

grant references on table "public"."tags" to "authenticated";

grant select on table "public"."tags" to "authenticated";

grant trigger on table "public"."tags" to "authenticated";

grant truncate on table "public"."tags" to "authenticated";

grant update on table "public"."tags" to "authenticated";

grant delete on table "public"."tags" to "service_role";

grant insert on table "public"."tags" to "service_role";

grant references on table "public"."tags" to "service_role";

grant select on table "public"."tags" to "service_role";

grant trigger on table "public"."tags" to "service_role";

grant truncate on table "public"."tags" to "service_role";

grant update on table "public"."tags" to "service_role";

grant delete on table "public"."user_achievements" to "anon";

grant insert on table "public"."user_achievements" to "anon";

grant references on table "public"."user_achievements" to "anon";

grant select on table "public"."user_achievements" to "anon";

grant trigger on table "public"."user_achievements" to "anon";

grant truncate on table "public"."user_achievements" to "anon";

grant update on table "public"."user_achievements" to "anon";

grant delete on table "public"."user_achievements" to "authenticated";

grant insert on table "public"."user_achievements" to "authenticated";

grant references on table "public"."user_achievements" to "authenticated";

grant select on table "public"."user_achievements" to "authenticated";

grant trigger on table "public"."user_achievements" to "authenticated";

grant truncate on table "public"."user_achievements" to "authenticated";

grant update on table "public"."user_achievements" to "authenticated";

grant delete on table "public"."user_achievements" to "service_role";

grant insert on table "public"."user_achievements" to "service_role";

grant references on table "public"."user_achievements" to "service_role";

grant select on table "public"."user_achievements" to "service_role";

grant trigger on table "public"."user_achievements" to "service_role";

grant truncate on table "public"."user_achievements" to "service_role";

grant update on table "public"."user_achievements" to "service_role";

grant delete on table "public"."user_blocks" to "anon";

grant insert on table "public"."user_blocks" to "anon";

grant references on table "public"."user_blocks" to "anon";

grant select on table "public"."user_blocks" to "anon";

grant trigger on table "public"."user_blocks" to "anon";

grant truncate on table "public"."user_blocks" to "anon";

grant update on table "public"."user_blocks" to "anon";

grant delete on table "public"."user_blocks" to "authenticated";

grant insert on table "public"."user_blocks" to "authenticated";

grant references on table "public"."user_blocks" to "authenticated";

grant select on table "public"."user_blocks" to "authenticated";

grant trigger on table "public"."user_blocks" to "authenticated";

grant truncate on table "public"."user_blocks" to "authenticated";

grant update on table "public"."user_blocks" to "authenticated";

grant delete on table "public"."user_blocks" to "service_role";

grant insert on table "public"."user_blocks" to "service_role";

grant references on table "public"."user_blocks" to "service_role";

grant select on table "public"."user_blocks" to "service_role";

grant trigger on table "public"."user_blocks" to "service_role";

grant truncate on table "public"."user_blocks" to "service_role";

grant update on table "public"."user_blocks" to "service_role";

grant delete on table "public"."user_daily_progress" to "anon";

grant insert on table "public"."user_daily_progress" to "anon";

grant references on table "public"."user_daily_progress" to "anon";

grant select on table "public"."user_daily_progress" to "anon";

grant trigger on table "public"."user_daily_progress" to "anon";

grant truncate on table "public"."user_daily_progress" to "anon";

grant update on table "public"."user_daily_progress" to "anon";

grant delete on table "public"."user_daily_progress" to "authenticated";

grant insert on table "public"."user_daily_progress" to "authenticated";

grant references on table "public"."user_daily_progress" to "authenticated";

grant select on table "public"."user_daily_progress" to "authenticated";

grant trigger on table "public"."user_daily_progress" to "authenticated";

grant truncate on table "public"."user_daily_progress" to "authenticated";

grant update on table "public"."user_daily_progress" to "authenticated";

grant delete on table "public"."user_daily_progress" to "service_role";

grant insert on table "public"."user_daily_progress" to "service_role";

grant references on table "public"."user_daily_progress" to "service_role";

grant select on table "public"."user_daily_progress" to "service_role";

grant trigger on table "public"."user_daily_progress" to "service_role";

grant truncate on table "public"."user_daily_progress" to "service_role";

grant update on table "public"."user_daily_progress" to "service_role";

grant delete on table "public"."user_daily_streaks" to "anon";

grant insert on table "public"."user_daily_streaks" to "anon";

grant references on table "public"."user_daily_streaks" to "anon";

grant select on table "public"."user_daily_streaks" to "anon";

grant trigger on table "public"."user_daily_streaks" to "anon";

grant truncate on table "public"."user_daily_streaks" to "anon";

grant update on table "public"."user_daily_streaks" to "anon";

grant delete on table "public"."user_daily_streaks" to "authenticated";

grant insert on table "public"."user_daily_streaks" to "authenticated";

grant references on table "public"."user_daily_streaks" to "authenticated";

grant select on table "public"."user_daily_streaks" to "authenticated";

grant trigger on table "public"."user_daily_streaks" to "authenticated";

grant truncate on table "public"."user_daily_streaks" to "authenticated";

grant update on table "public"."user_daily_streaks" to "authenticated";

grant delete on table "public"."user_daily_streaks" to "service_role";

grant insert on table "public"."user_daily_streaks" to "service_role";

grant references on table "public"."user_daily_streaks" to "service_role";

grant select on table "public"."user_daily_streaks" to "service_role";

grant trigger on table "public"."user_daily_streaks" to "service_role";

grant truncate on table "public"."user_daily_streaks" to "service_role";

grant update on table "public"."user_daily_streaks" to "service_role";

grant delete on table "public"."user_moderation_actions" to "anon";

grant insert on table "public"."user_moderation_actions" to "anon";

grant references on table "public"."user_moderation_actions" to "anon";

grant select on table "public"."user_moderation_actions" to "anon";

grant trigger on table "public"."user_moderation_actions" to "anon";

grant truncate on table "public"."user_moderation_actions" to "anon";

grant update on table "public"."user_moderation_actions" to "anon";

grant delete on table "public"."user_moderation_actions" to "authenticated";

grant insert on table "public"."user_moderation_actions" to "authenticated";

grant references on table "public"."user_moderation_actions" to "authenticated";

grant select on table "public"."user_moderation_actions" to "authenticated";

grant trigger on table "public"."user_moderation_actions" to "authenticated";

grant truncate on table "public"."user_moderation_actions" to "authenticated";

grant update on table "public"."user_moderation_actions" to "authenticated";

grant delete on table "public"."user_moderation_actions" to "service_role";

grant insert on table "public"."user_moderation_actions" to "service_role";

grant references on table "public"."user_moderation_actions" to "service_role";

grant select on table "public"."user_moderation_actions" to "service_role";

grant trigger on table "public"."user_moderation_actions" to "service_role";

grant truncate on table "public"."user_moderation_actions" to "service_role";

grant update on table "public"."user_moderation_actions" to "service_role";

grant delete on table "public"."user_reports" to "anon";

grant insert on table "public"."user_reports" to "anon";

grant references on table "public"."user_reports" to "anon";

grant select on table "public"."user_reports" to "anon";

grant trigger on table "public"."user_reports" to "anon";

grant truncate on table "public"."user_reports" to "anon";

grant update on table "public"."user_reports" to "anon";

grant delete on table "public"."user_reports" to "authenticated";

grant insert on table "public"."user_reports" to "authenticated";

grant references on table "public"."user_reports" to "authenticated";

grant select on table "public"."user_reports" to "authenticated";

grant trigger on table "public"."user_reports" to "authenticated";

grant truncate on table "public"."user_reports" to "authenticated";

grant update on table "public"."user_reports" to "authenticated";

grant delete on table "public"."user_reports" to "service_role";

grant insert on table "public"."user_reports" to "service_role";

grant references on table "public"."user_reports" to "service_role";

grant select on table "public"."user_reports" to "service_role";

grant trigger on table "public"."user_reports" to "service_role";

grant truncate on table "public"."user_reports" to "service_role";

grant update on table "public"."user_reports" to "service_role";

grant delete on table "public"."verification_attempts" to "anon";

grant insert on table "public"."verification_attempts" to "anon";

grant references on table "public"."verification_attempts" to "anon";

grant select on table "public"."verification_attempts" to "anon";

grant trigger on table "public"."verification_attempts" to "anon";

grant truncate on table "public"."verification_attempts" to "anon";

grant update on table "public"."verification_attempts" to "anon";

grant delete on table "public"."verification_attempts" to "authenticated";

grant insert on table "public"."verification_attempts" to "authenticated";

grant references on table "public"."verification_attempts" to "authenticated";

grant select on table "public"."verification_attempts" to "authenticated";

grant trigger on table "public"."verification_attempts" to "authenticated";

grant truncate on table "public"."verification_attempts" to "authenticated";

grant update on table "public"."verification_attempts" to "authenticated";

grant delete on table "public"."verification_attempts" to "service_role";

grant insert on table "public"."verification_attempts" to "service_role";

grant references on table "public"."verification_attempts" to "service_role";

grant select on table "public"."verification_attempts" to "service_role";

grant trigger on table "public"."verification_attempts" to "service_role";

grant truncate on table "public"."verification_attempts" to "service_role";

grant update on table "public"."verification_attempts" to "service_role";


  create policy "Service role manages achievement rules"
  on "public"."achievement_rules"
  as permissive
  for all
  to public
using ((( SELECT auth.role() AS role) = 'service_role'::text));



  create policy "Achievements are viewable by everyone"
  on "public"."achievements"
  as permissive
  for select
  to public
using (true);



  create policy "error_log_admin_insert"
  on "public"."admin_error_log"
  as permissive
  for insert
  to public
with check ((( SELECT auth.role() AS role) = 'service_role'::text));



  create policy "error_log_organizer_select"
  on "public"."admin_error_log"
  as permissive
  for select
  to public
using (((public.get_user_role(( SELECT auth.uid() AS uid)) = 'organizer'::public.user_role) AND (convention_id IN ( SELECT event_staff.convention_id
   FROM public.event_staff
  WHERE (event_staff.profile_id = ( SELECT auth.uid() AS uid))))));



  create policy "error_log_owner_moderator_select"
  on "public"."admin_error_log"
  as permissive
  for select
  to public
using ((public.get_user_role(( SELECT auth.uid() AS uid)) = ANY (ARRAY['owner'::public.user_role, 'moderator'::public.user_role])));



  create policy "allowed_event_types_public_read"
  on "public"."allowed_event_types"
  as permissive
  for select
  to public
using ((is_active = true));



  create policy "allowed_event_types_service_role"
  on "public"."allowed_event_types"
  as permissive
  for all
  to public
using ((( SELECT auth.role() AS role) = 'service_role'::text))
with check ((( SELECT auth.role() AS role) = 'service_role'::text));



  create policy "Admins can read audit logs"
  on "public"."audit_log"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['owner'::public.user_role, 'moderator'::public.user_role, 'organizer'::public.user_role]))))));



  create policy "Service role can insert audit logs"
  on "public"."audit_log"
  as permissive
  for insert
  to public
with check ((( SELECT auth.role() AS role) = 'service_role'::text));



  create policy "Fursuit owners can update catch status"
  on "public"."catches"
  as permissive
  for update
  to public
using ((fursuit_id IN ( SELECT fursuits.id
   FROM public.fursuits
  WHERE (fursuits.owner_id = ( SELECT auth.uid() AS uid)))));



  create policy "Users can delete their own catches"
  on "public"."catches"
  as permissive
  for delete
  to public
using ((catcher_id = ( SELECT auth.uid() AS uid)));



  create policy "Users can insert their own catches"
  on "public"."catches"
  as permissive
  for insert
  to public
with check ((catcher_id = ( SELECT auth.uid() AS uid)));



  create policy "catches_select_consolidated"
  on "public"."catches"
  as permissive
  for select
  to public
using (((catcher_id = ( SELECT auth.uid() AS uid)) OR (fursuit_id IN ( SELECT fursuits.id
   FROM public.fursuits
  WHERE (fursuits.owner_id = ( SELECT auth.uid() AS uid)))) OR (public.get_user_role(( SELECT auth.uid() AS uid)) = ANY (ARRAY['owner'::public.user_role, 'moderator'::public.user_role, 'organizer'::public.user_role]))));



  create policy "Admins can read all conventions"
  on "public"."conventions"
  as permissive
  for select
  to public
using (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['owner'::public.user_role, 'moderator'::public.user_role, 'organizer'::public.user_role, 'staff'::public.user_role]))))) OR true));



  create policy "Anyone can read conventions"
  on "public"."conventions"
  as permissive
  for select
  to public
using (true);



  create policy "Organizers can update assigned conventions"
  on "public"."conventions"
  as permissive
  for update
  to public
using (((EXISTS ( SELECT 1
   FROM public.event_staff es
  WHERE ((es.profile_id = ( SELECT auth.uid() AS uid)) AND (es.convention_id = conventions.id) AND (es.role = 'organizer'::public.user_role) AND (es.status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'owner'::public.user_role))))))
with check (((EXISTS ( SELECT 1
   FROM public.event_staff es
  WHERE ((es.profile_id = ( SELECT auth.uid() AS uid)) AND (es.convention_id = conventions.id) AND (es.role = 'organizer'::public.user_role) AND (es.status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'owner'::public.user_role))))));



  create policy "Authenticated can read assignments"
  on "public"."daily_assignments"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Block client delete assignments"
  on "public"."daily_assignments"
  as permissive
  for delete
  to authenticated
using (false);



  create policy "Block client insert assignments"
  on "public"."daily_assignments"
  as permissive
  for insert
  to authenticated
with check (false);



  create policy "Block client update assignments"
  on "public"."daily_assignments"
  as permissive
  for update
  to authenticated
using (false);



  create policy "Authenticated can read active tasks"
  on "public"."daily_tasks"
  as permissive
  for select
  to authenticated
using ((is_active = true));



  create policy "Block client delete tasks"
  on "public"."daily_tasks"
  as permissive
  for delete
  to authenticated
using (false);



  create policy "Block client insert tasks"
  on "public"."daily_tasks"
  as permissive
  for insert
  to authenticated
with check (false);



  create policy "Block client update tasks"
  on "public"."daily_tasks"
  as permissive
  for update
  to authenticated
using (false);



  create policy "edge_function_config_public_read"
  on "public"."edge_function_config"
  as permissive
  for select
  to public
using (true);



  create policy "edge_function_config_service_role"
  on "public"."edge_function_config"
  as permissive
  for all
  to public
using ((( SELECT auth.role() AS role) = 'service_role'::text))
with check ((( SELECT auth.role() AS role) = 'service_role'::text));



  create policy "Admins can read staff assignments"
  on "public"."event_staff"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['owner'::public.user_role, 'organizer'::public.user_role]))))));



  create policy "Owners and organizers can delete staff"
  on "public"."event_staff"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['owner'::public.user_role, 'organizer'::public.user_role]))))));



  create policy "Owners and organizers can insert staff"
  on "public"."event_staff"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['owner'::public.user_role, 'organizer'::public.user_role]))))));



  create policy "Owners and organizers can update staff"
  on "public"."event_staff"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['owner'::public.user_role, 'organizer'::public.user_role]))))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['owner'::public.user_role, 'moderator'::public.user_role]))))));



  create policy "Staff can read own assignments"
  on "public"."event_staff"
  as permissive
  for select
  to public
using ((profile_id = ( SELECT auth.uid() AS uid)));



  create policy "events_insert"
  on "public"."events"
  as permissive
  for insert
  to public
with check (((user_id = ( SELECT auth.uid() AS uid)) OR (( SELECT auth.role() AS role) = 'service_role'::text)));



  create policy "events_manage"
  on "public"."events"
  as permissive
  for all
  to public
using ((( SELECT auth.role() AS role) = 'service_role'::text));



  create policy "events_select"
  on "public"."events"
  as permissive
  for select
  to public
using (((user_id = ( SELECT auth.uid() AS uid)) OR (( SELECT auth.role() AS role) = 'service_role'::text)));



  create policy "fursuit_bios_insert_owner"
  on "public"."fursuit_bios"
  as permissive
  for insert
  to public
with check ((fursuit_id IN ( SELECT fursuits.id
   FROM public.fursuits
  WHERE (fursuits.owner_id = ( SELECT auth.uid() AS uid)))));



  create policy "fursuit_bios_select_all_authenticated"
  on "public"."fursuit_bios"
  as permissive
  for select
  to authenticated
using (true);



  create policy "fursuit_bios_update_owner"
  on "public"."fursuit_bios"
  as permissive
  for update
  to public
using ((fursuit_id IN ( SELECT fursuits.id
   FROM public.fursuits
  WHERE (fursuits.owner_id = ( SELECT auth.uid() AS uid)))));



  create policy "fursuit_color_assignments_delete"
  on "public"."fursuit_color_assignments"
  as permissive
  for delete
  to public
using (((( SELECT auth.role() AS role) = 'service_role'::text) OR (fursuit_id IN ( SELECT fursuits.id
   FROM public.fursuits
  WHERE (fursuits.owner_id = ( SELECT auth.uid() AS uid))))));



  create policy "fursuit_color_assignments_insert"
  on "public"."fursuit_color_assignments"
  as permissive
  for insert
  to public
with check (((( SELECT auth.role() AS role) = 'service_role'::text) OR (fursuit_id IN ( SELECT fursuits.id
   FROM public.fursuits
  WHERE (fursuits.owner_id = ( SELECT auth.uid() AS uid))))));



  create policy "fursuit_color_assignments_select"
  on "public"."fursuit_color_assignments"
  as permissive
  for select
  to public
using (true);



  create policy "fursuit_color_assignments_update"
  on "public"."fursuit_color_assignments"
  as permissive
  for update
  to public
using (((( SELECT auth.role() AS role) = 'service_role'::text) OR (fursuit_id IN ( SELECT fursuits.id
   FROM public.fursuits
  WHERE (fursuits.owner_id = ( SELECT auth.uid() AS uid))))));



  create policy "fursuit_colors_manage"
  on "public"."fursuit_colors"
  as permissive
  for all
  to public
using ((( SELECT auth.role() AS role) = 'service_role'::text));



  create policy "fursuit_colors_select"
  on "public"."fursuit_colors"
  as permissive
  for select
  to public
using (true);



  create policy "Users can delete associations for their own fursuits"
  on "public"."fursuit_conventions"
  as permissive
  for delete
  to public
using ((fursuit_id IN ( SELECT fursuits.id
   FROM public.fursuits
  WHERE (fursuits.owner_id = ( SELECT auth.uid() AS uid)))));



  create policy "Users can insert associations for their own fursuits"
  on "public"."fursuit_conventions"
  as permissive
  for insert
  to public
with check ((fursuit_id IN ( SELECT fursuits.id
   FROM public.fursuits
  WHERE (fursuits.owner_id = ( SELECT auth.uid() AS uid)))));



  create policy "Users can update associations for their own fursuits"
  on "public"."fursuit_conventions"
  as permissive
  for update
  to public
using ((fursuit_id IN ( SELECT fursuits.id
   FROM public.fursuits
  WHERE (fursuits.owner_id = ( SELECT auth.uid() AS uid)))));



  create policy "fursuit_conventions_public_read"
  on "public"."fursuit_conventions"
  as permissive
  for select
  to public
using (true);



  create policy "fursuit_species_insert_authenticated"
  on "public"."fursuit_species"
  as permissive
  for insert
  to public
with check ((( SELECT auth.role() AS role) = 'authenticated'::text));



  create policy "fursuit_species_read_access"
  on "public"."fursuit_species"
  as permissive
  for select
  to public
using (true);



  create policy "Admins can view all fursuits"
  on "public"."fursuits"
  as permissive
  for select
  to public
using (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['owner'::public.user_role, 'moderator'::public.user_role, 'organizer'::public.user_role, 'staff'::public.user_role]))))) OR (owner_id = ( SELECT auth.uid() AS uid))));



  create policy "Anyone can view fursuits"
  on "public"."fursuits"
  as permissive
  for select
  to public
using (true);



  create policy "Users can delete their own fursuits"
  on "public"."fursuits"
  as permissive
  for delete
  to public
using ((owner_id = ( SELECT auth.uid() AS uid)));



  create policy "Users can insert their own fursuits with limit"
  on "public"."fursuits"
  as permissive
  for insert
  to public
with check (((owner_id = ( SELECT auth.uid() AS uid)) AND (public.count_user_fursuits(( SELECT auth.uid() AS uid)) < 3)));



  create policy "Users can update their own fursuits"
  on "public"."fursuits"
  as permissive
  for update
  to public
using ((owner_id = ( SELECT auth.uid() AS uid)))
with check ((owner_id = ( SELECT auth.uid() AS uid)));



  create policy "Users can view their own fursuits"
  on "public"."fursuits"
  as permissive
  for select
  to public
using ((owner_id = ( SELECT auth.uid() AS uid)));



  create policy "Service role can insert notifications"
  on "public"."notifications"
  as permissive
  for insert
  to service_role
with check (true);



  create policy "Users can delete their own notifications"
  on "public"."notifications"
  as permissive
  for delete
  to public
using ((user_id = ( SELECT auth.uid() AS uid)));



  create policy "Users can update their own notifications"
  on "public"."notifications"
  as permissive
  for update
  to public
using ((user_id = ( SELECT auth.uid() AS uid)));



  create policy "Users read their notifications"
  on "public"."notifications"
  as permissive
  for select
  to public
using ((user_id = ( SELECT auth.uid() AS uid)));



  create policy "profile_conventions_delete_consolidated"
  on "public"."profile_conventions"
  as permissive
  for delete
  to public
using (((profile_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['owner'::public.user_role, 'moderator'::public.user_role])))))));



  create policy "profile_conventions_insert_consolidated"
  on "public"."profile_conventions"
  as permissive
  for insert
  to public
with check (((profile_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['owner'::public.user_role, 'moderator'::public.user_role])))))));



  create policy "profile_conventions_select_consolidated"
  on "public"."profile_conventions"
  as permissive
  for select
  to public
using ((( SELECT auth.role() AS role) = 'authenticated'::text));



  create policy "profile_conventions_update_consolidated"
  on "public"."profile_conventions"
  as permissive
  for update
  to public
using (((profile_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['owner'::public.user_role, 'moderator'::public.user_role])))))))
with check (((profile_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['owner'::public.user_role, 'moderator'::public.user_role])))))));



  create policy "Service role can update any profile"
  on "public"."profiles"
  as permissive
  for update
  to service_role
using (true)
with check (true);



  create policy "Users can delete own profile"
  on "public"."profiles"
  as permissive
  for delete
  to public
using ((( SELECT auth.uid() AS uid) = id));



  create policy "Users can insert own profile"
  on "public"."profiles"
  as permissive
  for insert
  to public
with check ((id = ( SELECT auth.uid() AS uid)));



  create policy "Users can update own profile"
  on "public"."profiles"
  as permissive
  for update
  to public
using ((id = ( SELECT auth.uid() AS uid)))
with check ((id = ( SELECT auth.uid() AS uid)));



  create policy "profiles_select_consolidated"
  on "public"."profiles"
  as permissive
  for select
  to public
using (((id = ( SELECT auth.uid() AS uid)) OR (public.get_user_role(( SELECT auth.uid() AS uid)) = ANY (ARRAY['owner'::public.user_role, 'moderator'::public.user_role]))));



  create policy "push_queue_service_role"
  on "public"."push_notification_retry_queue"
  as permissive
  for all
  to public
using ((( SELECT auth.role() AS role) = 'service_role'::text))
with check ((( SELECT auth.role() AS role) = 'service_role'::text));



  create policy "Admins can read tag scans"
  on "public"."tag_scans"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['staff'::public.user_role, 'moderator'::public.user_role, 'organizer'::public.user_role, 'owner'::public.user_role]))))));



  create policy "Service role can manage tag scans"
  on "public"."tag_scans"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "Staff can view tags for assigned conventions"
  on "public"."tags"
  as permissive
  for select
  to authenticated
using (((EXISTS ( SELECT 1
   FROM (public.fursuit_conventions fc
     JOIN public.event_staff es ON ((es.convention_id = fc.convention_id)))
  WHERE ((fc.fursuit_id = tags.fursuit_id) AND (es.profile_id = ( SELECT auth.uid() AS uid)) AND (es.status = 'active'::text)))) OR (registered_by_user_id = ( SELECT auth.uid() AS uid))));



  create policy "Users can register tags"
  on "public"."tags"
  as permissive
  for insert
  to public
with check ((registered_by_user_id = ( SELECT auth.uid() AS uid)));



  create policy "Users can update own tags"
  on "public"."tags"
  as permissive
  for update
  to public
using (((registered_by_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.fursuits
  WHERE ((fursuits.id = tags.fursuit_id) AND (fursuits.owner_id = ( SELECT auth.uid() AS uid)))))));



  create policy "Users can view own tags"
  on "public"."tags"
  as permissive
  for select
  to public
using (((registered_by_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.fursuits
  WHERE ((fursuits.id = tags.fursuit_id) AND (fursuits.owner_id = ( SELECT auth.uid() AS uid)))))));



  create policy "Authenticated users can view achievements"
  on "public"."user_achievements"
  as permissive
  for select
  to public
using ((( SELECT auth.role() AS role) = 'authenticated'::text));



  create policy "Service role can insert achievements"
  on "public"."user_achievements"
  as permissive
  for insert
  to service_role
with check (true);



  create policy "Users can insert their own achievements"
  on "public"."user_achievements"
  as permissive
  for insert
  to public
with check ((user_id = ( SELECT auth.uid() AS uid)));



  create policy "Admins can view all blocks"
  on "public"."user_blocks"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['owner'::public.user_role, 'organizer'::public.user_role, 'moderator'::public.user_role]))))));



  create policy "Users can create blocks"
  on "public"."user_blocks"
  as permissive
  for insert
  to public
with check ((blocker_id = ( SELECT auth.uid() AS uid)));



  create policy "Users can delete own blocks"
  on "public"."user_blocks"
  as permissive
  for delete
  to public
using ((blocker_id = ( SELECT auth.uid() AS uid)));



  create policy "Users can view own blocks"
  on "public"."user_blocks"
  as permissive
  for select
  to public
using ((blocker_id = ( SELECT auth.uid() AS uid)));



  create policy "Service role can manage daily progress"
  on "public"."user_daily_progress"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "Users can read their progress"
  on "public"."user_daily_progress"
  as permissive
  for select
  to public
using ((user_id = ( SELECT auth.uid() AS uid)));



  create policy "Users can update own daily progress"
  on "public"."user_daily_progress"
  as permissive
  for update
  to authenticated
using ((( SELECT auth.uid() AS uid) = user_id))
with check ((( SELECT auth.uid() AS uid) = user_id));



  create policy "Service role can manage streaks"
  on "public"."user_daily_streaks"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "Users can read their streaks"
  on "public"."user_daily_streaks"
  as permissive
  for select
  to public
using ((user_id = ( SELECT auth.uid() AS uid)));



  create policy "Moderators can manage moderation actions"
  on "public"."user_moderation_actions"
  as permissive
  for all
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['owner'::public.user_role, 'moderator'::public.user_role]))))));



  create policy "Staff can insert moderation actions"
  on "public"."user_moderation_actions"
  as permissive
  for insert
  to authenticated
with check ((public.is_moderator_or_higher(( SELECT auth.uid() AS uid)) AND (( SELECT auth.uid() AS uid) = applied_by_user_id)));



  create policy "Staff can update moderation actions"
  on "public"."user_moderation_actions"
  as permissive
  for update
  to authenticated
using (public.is_moderator_or_higher(( SELECT auth.uid() AS uid)))
with check (public.is_moderator_or_higher(( SELECT auth.uid() AS uid)));



  create policy "Users can view their own moderation actions"
  on "public"."user_moderation_actions"
  as permissive
  for select
  to authenticated
using ((user_id = ( SELECT auth.uid() AS uid)));



  create policy "Moderators can update reports"
  on "public"."user_reports"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['owner'::public.user_role, 'moderator'::public.user_role]))))));



  create policy "Moderators can view all reports"
  on "public"."user_reports"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['owner'::public.user_role, 'moderator'::public.user_role]))))));



  create policy "Organizers can view event reports"
  on "public"."user_reports"
  as permissive
  for select
  to authenticated
using ((convention_id IN ( SELECT event_staff.convention_id
   FROM public.event_staff
  WHERE ((event_staff.profile_id = ( SELECT auth.uid() AS uid)) AND (event_staff.role = 'organizer'::public.user_role) AND (event_staff.status = 'active'::text)))));



  create policy "Staff can update reports"
  on "public"."user_reports"
  as permissive
  for update
  to authenticated
using (public.is_moderator_or_higher(( SELECT auth.uid() AS uid)))
with check (public.is_moderator_or_higher(( SELECT auth.uid() AS uid)));



  create policy "Users can create reports"
  on "public"."user_reports"
  as permissive
  for insert
  to authenticated
with check ((reporter_id = ( SELECT auth.uid() AS uid)));



  create policy "Users can view their own reports"
  on "public"."user_reports"
  as permissive
  for select
  to authenticated
using ((reporter_id = ( SELECT auth.uid() AS uid)));



  create policy "verification_attempts_insert_self"
  on "public"."verification_attempts"
  as permissive
  for insert
  to public
with check ((profile_id = ( SELECT auth.uid() AS uid)));



  create policy "verification_attempts_select_admin"
  on "public"."verification_attempts"
  as permissive
  for select
  to public
using ((public.get_user_role(( SELECT auth.uid() AS uid)) = ANY (ARRAY['owner'::public.user_role, 'moderator'::public.user_role, 'organizer'::public.user_role])));


CREATE TRIGGER achievement_rules_touch_updated_at BEFORE UPDATE ON public.achievement_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_utc();

CREATE TRIGGER audit_log_hash_ip BEFORE INSERT ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.audit_log_hash_ip_trigger();

CREATE TRIGGER before_insert_catcher_id BEFORE INSERT ON public.catches FOR EACH ROW EXECUTE FUNCTION public.set_catcher_id();

CREATE TRIGGER trg_check_catch_block BEFORE INSERT ON public.catches FOR EACH ROW EXECUTE FUNCTION public.check_catch_block();

CREATE TRIGGER update_fursuit_catch_count AFTER INSERT OR DELETE OR UPDATE OF fursuit_id ON public.catches FOR EACH ROW EXECUTE FUNCTION public.keep_fursuit_catch_count();

CREATE TRIGGER set_conventions_updated_at BEFORE UPDATE ON public.conventions FOR EACH ROW EXECUTE FUNCTION public.touch_conventions_updated_at();

CREATE TRIGGER set_daily_assignments_updated_at BEFORE UPDATE ON public.daily_assignments FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

CREATE TRIGGER set_daily_tasks_updated_at BEFORE UPDATE ON public.daily_tasks FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

CREATE TRIGGER trigger_process_achievements_on_event_insert AFTER INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION public.invoke_process_achievements_trigger();
ALTER TABLE "public"."events" DISABLE TRIGGER "trigger_process_achievements_on_event_insert";

CREATE TRIGGER set_fursuit_bios_updated_at BEFORE UPDATE ON public.fursuit_bios FOR EACH ROW EXECUTE FUNCTION public.set_fursuit_bios_updated_at();

CREATE TRIGGER set_fursuit_species_updated_at BEFORE UPDATE ON public.fursuit_species FOR EACH ROW EXECUTE FUNCTION public.set_fursuit_species_updated_at();

CREATE TRIGGER before_insert_fursuit_owner BEFORE INSERT ON public.fursuits FOR EACH ROW EXECUTE FUNCTION public.set_fursuit_owner();

CREATE TRIGGER "send-push-on-notification-insert" AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.invoke_send_push_trigger();

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_profiles_updated_at();

CREATE TRIGGER sync_bio_owner_name_on_username_change AFTER UPDATE OF username ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_fursuit_bio_owner_name();

CREATE TRIGGER tags_qr_cleanup_trigger AFTER DELETE ON public.tags FOR EACH ROW WHEN ((old.qr_asset_path IS NOT NULL)) EXECUTE FUNCTION public.enqueue_qr_asset_cleanup();

CREATE TRIGGER set_user_daily_progress_updated_at BEFORE UPDATE ON public.user_daily_progress FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

CREATE TRIGGER set_user_daily_streaks_updated_at BEFORE UPDATE ON public.user_daily_streaks FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
