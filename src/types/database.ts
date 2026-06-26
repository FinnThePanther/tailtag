export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type AttendanceState = "active" | "left" | "removed" | "finalized"
export type RosterState = "active" | "removed" | "finalized"

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      achievement_rules: {
        Row: {
          created_at: string
          description: string | null
          is_active: boolean
          kind: string
          metadata: Json
          name: string
          rule: Json
          rule_id: string
          slug: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          kind: string
          metadata?: Json
          name: string
          rule: Json
          rule_id?: string
          slug: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          kind?: string
          metadata?: Json
          name?: string
          rule?: Json
          rule_id?: string
          slug?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      achievements: {
        Row: {
          category: Database["public"]["Enums"]["achievement_category"]
          convention_id: string | null
          created_at: string
          description: string
          id: string
          is_active: boolean
          key: string
          name: string
          recipient_role: Database["public"]["Enums"]["achievement_recipient_role"]
          reset_grace_minutes: number
          reset_mode: string
          reset_timezone: string
          rule_id: string | null
          trigger_event: Database["public"]["Enums"]["achievement_trigger_event"]
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["achievement_category"]
          convention_id?: string | null
          created_at?: string
          description: string
          id?: string
          is_active?: boolean
          key: string
          name: string
          recipient_role: Database["public"]["Enums"]["achievement_recipient_role"]
          reset_grace_minutes?: number
          reset_mode?: string
          reset_timezone?: string
          rule_id?: string | null
          trigger_event: Database["public"]["Enums"]["achievement_trigger_event"]
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["achievement_category"]
          convention_id?: string | null
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          recipient_role?: Database["public"]["Enums"]["achievement_recipient_role"]
          reset_grace_minutes?: number
          reset_mode?: string
          reset_timezone?: string
          rule_id?: string | null
          trigger_event?: Database["public"]["Enums"]["achievement_trigger_event"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievements_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "achievements_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "achievement_rules"
            referencedColumns: ["rule_id"]
          },
        ]
      }
      admin_error_log: {
        Row: {
          context: Json | null
          convention_id: string | null
          created_at: string
          error_message: string
          error_type: string
          id: string
          occurred_at: string
          severity: string
        }
        Insert: {
          context?: Json | null
          convention_id?: string | null
          created_at?: string
          error_message: string
          error_type: string
          id?: string
          occurred_at?: string
          severity: string
        }
        Update: {
          context?: Json | null
          convention_id?: string | null
          created_at?: string
          error_message?: string
          error_type?: string
          id?: string
          occurred_at?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_error_log_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
        ]
      }
      allowed_event_types: {
        Row: {
          created_at: string
          deprecated_at: string | null
          description: string
          event_type: string
          is_active: boolean
        }
        Insert: {
          created_at?: string
          deprecated_at?: string | null
          description: string
          event_type: string
          is_active?: boolean
        }
        Update: {
          created_at?: string
          deprecated_at?: string | null
          description?: string
          event_type?: string
          is_active?: boolean
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string
          context: Json | null
          created_at: string
          diff: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id: string
          context?: Json | null
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          context?: Json | null
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      backend_worker_heartbeats: {
        Row: {
          created_at: string
          display_name: string
          idle_count_24h: number
          last_idle_at: string | null
          last_idle_counts: Json
          last_idle_duration_ms: number | null
          last_seen_at: string
          metadata: Json
          source: string
          updated_at: string
          worker_name: string
        }
        Insert: {
          created_at?: string
          display_name: string
          idle_count_24h?: number
          last_idle_at?: string | null
          last_idle_counts?: Json
          last_idle_duration_ms?: number | null
          last_seen_at?: string
          metadata?: Json
          source: string
          updated_at?: string
          worker_name: string
        }
        Update: {
          created_at?: string
          display_name?: string
          idle_count_24h?: number
          last_idle_at?: string | null
          last_idle_counts?: Json
          last_idle_duration_ms?: number | null
          last_seen_at?: string
          metadata?: Json
          source?: string
          updated_at?: string
          worker_name?: string
        }
        Relationships: []
      }
      backend_worker_runs: {
        Row: {
          completed_at: string | null
          counts: Json
          created_at: string
          duration_ms: number | null
          error_details: Json | null
          error_message: string | null
          id: string
          metadata: Json
          source: string
          started_at: string
          status: string
          updated_at: string
          worker_name: string
        }
        Insert: {
          completed_at?: string | null
          counts?: Json
          created_at?: string
          duration_ms?: number | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          metadata?: Json
          source: string
          started_at?: string
          status?: string
          updated_at?: string
          worker_name: string
        }
        Update: {
          completed_at?: string | null
          counts?: Json
          created_at?: string
          duration_ms?: number | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          metadata?: Json
          source?: string
          started_at?: string
          status?: string
          updated_at?: string
          worker_name?: string
        }
        Relationships: []
      }
      catch_invites: {
        Row: {
          approved_at: string | null
          canceled_at: string | null
          catch_photo_path: string
          catch_photo_source: string
          catch_photo_url: string
          caught_at: string
          claimed_at: string | null
          claimed_by_profile_id: string | null
          convention_id: string | null
          converted_catch_id: string | null
          created_at: string
          credit_scope: string
          declined_at: string | null
          expires_at: string
          id: string
          invitee_display_name: string | null
          inviter_profile_id: string
          report_reason: string | null
          reported_at: string | null
          selected_fursuit_id: string | null
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          canceled_at?: string | null
          catch_photo_path: string
          catch_photo_source?: string
          catch_photo_url: string
          caught_at?: string
          claimed_at?: string | null
          claimed_by_profile_id?: string | null
          convention_id?: string | null
          converted_catch_id?: string | null
          created_at?: string
          credit_scope?: string
          declined_at?: string | null
          expires_at: string
          id?: string
          invitee_display_name?: string | null
          inviter_profile_id: string
          report_reason?: string | null
          reported_at?: string | null
          selected_fursuit_id?: string | null
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          canceled_at?: string | null
          catch_photo_path?: string
          catch_photo_source?: string
          catch_photo_url?: string
          caught_at?: string
          claimed_at?: string | null
          claimed_by_profile_id?: string | null
          convention_id?: string | null
          converted_catch_id?: string | null
          created_at?: string
          credit_scope?: string
          declined_at?: string | null
          expires_at?: string
          id?: string
          invitee_display_name?: string | null
          inviter_profile_id?: string
          report_reason?: string | null
          reported_at?: string | null
          selected_fursuit_id?: string | null
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catch_invites_claimed_by_profile_id_fkey"
            columns: ["claimed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catch_invites_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catch_invites_converted_catch_id_fkey"
            columns: ["converted_catch_id"]
            isOneToOne: false
            referencedRelation: "catches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catch_invites_inviter_profile_id_fkey"
            columns: ["inviter_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catch_invites_selected_fursuit_id_fkey"
            columns: ["selected_fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catch_invites_selected_fursuit_id_fkey"
            columns: ["selected_fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits_moderation"
            referencedColumns: ["id"]
          },
        ]
      }
      catch_performance_events: {
        Row: {
          app_version: string | null
          catch_id: string | null
          client_attempt_id: string
          convention_id: string | null
          created_at: string
          error_code: string | null
          id: string
          method: string
          network_type: string | null
          platform: string | null
          result: string
          timings: Json
          total_ms: number | null
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          catch_id?: string | null
          client_attempt_id: string
          convention_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          method: string
          network_type?: string | null
          platform?: string | null
          result: string
          timings?: Json
          total_ms?: number | null
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          catch_id?: string | null
          client_attempt_id?: string
          convention_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          method?: string
          network_type?: string | null
          platform?: string | null
          result?: string
          timings?: Json
          total_ms?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catch_performance_events_catch_id_fkey"
            columns: ["catch_id"]
            isOneToOne: false
            referencedRelation: "catches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catch_performance_events_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catch_performance_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      catch_reciprocal_offers: {
        Row: {
          convention_id: string
          created_at: string
          failure_reason: string | null
          id: string
          offered_by_profile_id: string
          offered_fursuit_id: string
          primary_catch_id: string
          processed_at: string | null
          recipient_profile_id: string
          reciprocal_catch_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          convention_id: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          offered_by_profile_id: string
          offered_fursuit_id: string
          primary_catch_id: string
          processed_at?: string | null
          recipient_profile_id: string
          reciprocal_catch_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          convention_id?: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          offered_by_profile_id?: string
          offered_fursuit_id?: string
          primary_catch_id?: string
          processed_at?: string | null
          recipient_profile_id?: string
          reciprocal_catch_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catch_reciprocal_offers_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catch_reciprocal_offers_offered_by_profile_id_fkey"
            columns: ["offered_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catch_reciprocal_offers_offered_fursuit_id_fkey"
            columns: ["offered_fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catch_reciprocal_offers_offered_fursuit_id_fkey"
            columns: ["offered_fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catch_reciprocal_offers_primary_catch_id_fkey"
            columns: ["primary_catch_id"]
            isOneToOne: false
            referencedRelation: "catches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catch_reciprocal_offers_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catch_reciprocal_offers_reciprocal_catch_id_fkey"
            columns: ["reciprocal_catch_id"]
            isOneToOne: false
            referencedRelation: "catches"
            referencedColumns: ["id"]
          },
        ]
      }
      catches: {
        Row: {
          catch_credit_scope: string
          catch_number: number | null
          catch_photo_path: string | null
          catch_photo_source: string | null
          catch_photo_url: string | null
          catcher_id: string
          caught_at: string | null
          client_attempt_id: string | null
          convention_id: string | null
          decided_at: string | null
          decided_by_user_id: string | null
          expires_at: string | null
          fursuit_id: string
          id: string
          photo_upload_state: string
          rejection_reason: string | null
          status: string
        }
        Insert: {
          catch_credit_scope?: string
          catch_number?: number | null
          catch_photo_path?: string | null
          catch_photo_source?: string | null
          catch_photo_url?: string | null
          catcher_id: string
          caught_at?: string | null
          client_attempt_id?: string | null
          convention_id?: string | null
          decided_at?: string | null
          decided_by_user_id?: string | null
          expires_at?: string | null
          fursuit_id: string
          id?: string
          photo_upload_state?: string
          rejection_reason?: string | null
          status?: string
        }
        Update: {
          catch_credit_scope?: string
          catch_number?: number | null
          catch_photo_path?: string | null
          catch_photo_source?: string | null
          catch_photo_url?: string | null
          catcher_id?: string
          caught_at?: string | null
          client_attempt_id?: string | null
          convention_id?: string | null
          decided_at?: string | null
          decided_by_user_id?: string | null
          expires_at?: string | null
          fursuit_id?: string
          id?: string
          photo_upload_state?: string
          rejection_reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "catches_catcher_id_fkey"
            columns: ["catcher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catches_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catches_decided_by_user_id_fkey"
            columns: ["decided_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catches_fursuit_id_fkey"
            columns: ["fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catches_fursuit_id_fkey"
            columns: ["fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits_moderation"
            referencedColumns: ["id"]
          },
        ]
      }
      convention_participant_recaps: {
        Row: {
          achievements_unlocked_count: number
          catch_count: number
          convention_id: string
          created_at: string
          daily_tasks_completed_count: number
          final_rank: number | null
          fursuits_caught_count: number
          generated_at: string
          id: string
          joined_at: string | null
          left_at: string | null
          own_fursuits_caught_count: number
          profile_id: string
          summary: Json
          unique_catchers_for_own_fursuits_count: number
          unique_fursuits_caught_count: number
          updated_at: string
        }
        Insert: {
          achievements_unlocked_count?: number
          catch_count?: number
          convention_id: string
          created_at?: string
          daily_tasks_completed_count?: number
          final_rank?: number | null
          fursuits_caught_count?: number
          generated_at?: string
          id?: string
          joined_at?: string | null
          left_at?: string | null
          own_fursuits_caught_count?: number
          profile_id: string
          summary?: Json
          unique_catchers_for_own_fursuits_count?: number
          unique_fursuits_caught_count?: number
          updated_at?: string
        }
        Update: {
          achievements_unlocked_count?: number
          catch_count?: number
          convention_id?: string
          created_at?: string
          daily_tasks_completed_count?: number
          final_rank?: number | null
          fursuits_caught_count?: number
          generated_at?: string
          id?: string
          joined_at?: string | null
          left_at?: string | null
          own_fursuits_caught_count?: number
          profile_id?: string
          summary?: Json
          unique_catchers_for_own_fursuits_count?: number
          unique_fursuits_caught_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "convention_participant_recaps_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convention_participant_recaps_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conventions: {
        Row: {
          archived_at: string | null
          canceled_at: string | null
          closed_at: string | null
          closeout_completed_at: string | null
          closeout_error: string | null
          closeout_last_attempt_at: string | null
          closeout_not_before: string | null
          closeout_retry_count: number
          closeout_started_at: string | null
          closeout_step: string | null
          closeout_summary: Json
          config: Json
          created_at: string
          end_date: string | null
          finalizing_started_at: string | null
          geofence_enabled: boolean | null
          geofence_radius_meters: number | null
          id: string
          latitude: number | null
          location: string | null
          location_verification_required: boolean | null
          longitude: number | null
          name: string
          slug: string
          start_date: string | null
          started_at: string | null
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          canceled_at?: string | null
          closed_at?: string | null
          closeout_completed_at?: string | null
          closeout_error?: string | null
          closeout_last_attempt_at?: string | null
          closeout_not_before?: string | null
          closeout_retry_count?: number
          closeout_started_at?: string | null
          closeout_step?: string | null
          closeout_summary?: Json
          config?: Json
          created_at?: string
          end_date?: string | null
          finalizing_started_at?: string | null
          geofence_enabled?: boolean | null
          geofence_radius_meters?: number | null
          id?: string
          latitude?: number | null
          location?: string | null
          location_verification_required?: boolean | null
          longitude?: number | null
          name: string
          slug: string
          start_date?: string | null
          started_at?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          canceled_at?: string | null
          closed_at?: string | null
          closeout_completed_at?: string | null
          closeout_error?: string | null
          closeout_last_attempt_at?: string | null
          closeout_not_before?: string | null
          closeout_retry_count?: number
          closeout_started_at?: string | null
          closeout_step?: string | null
          closeout_summary?: Json
          config?: Json
          created_at?: string
          end_date?: string | null
          finalizing_started_at?: string | null
          geofence_enabled?: boolean | null
          geofence_radius_meters?: number | null
          id?: string
          latitude?: number | null
          location?: string | null
          location_verification_required?: boolean | null
          longitude?: number | null
          name?: string
          slug?: string
          start_date?: string | null
          started_at?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_assignments: {
        Row: {
          convention_id: string
          created_at: string
          day: string
          id: string
          position: number
          task_id: string
          updated_at: string
        }
        Insert: {
          convention_id: string
          created_at?: string
          day: string
          id?: string
          position: number
          task_id: string
          updated_at?: string
        }
        Update: {
          convention_id?: string
          created_at?: string
          day?: string
          id?: string
          position?: number
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_assignments_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "daily_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_tasks: {
        Row: {
          convention_id: string | null
          created_at: string
          description: string
          id: string
          is_active: boolean
          kind: string
          metadata: Json
          name: string
          requirement: number
          rule_id: string | null
          updated_at: string
        }
        Insert: {
          convention_id?: string | null
          created_at?: string
          description: string
          id?: string
          is_active?: boolean
          kind: string
          metadata?: Json
          name: string
          requirement: number
          rule_id?: string | null
          updated_at?: string
        }
        Update: {
          convention_id?: string | null
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          kind?: string
          metadata?: Json
          name?: string
          requirement?: number
          rule_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_tasks_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_tasks_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "achievement_rules"
            referencedColumns: ["rule_id"]
          },
        ]
      }
      edge_function_config: {
        Row: {
          allowed_roles: string[] | null
          config: Json
          deprecation_date: string | null
          description: string
          function_name: string
          is_deprecated: boolean
          max_payload_size_bytes: number | null
          rate_limit_enabled: boolean
          rate_limit_requests_per_hour: number | null
          rate_limit_requests_per_minute: number | null
          replacement_function: string | null
          require_jwt: boolean
          updated_at: string
          validate_event_types: boolean | null
        }
        Insert: {
          allowed_roles?: string[] | null
          config?: Json
          deprecation_date?: string | null
          description: string
          function_name: string
          is_deprecated?: boolean
          max_payload_size_bytes?: number | null
          rate_limit_enabled?: boolean
          rate_limit_requests_per_hour?: number | null
          rate_limit_requests_per_minute?: number | null
          replacement_function?: string | null
          require_jwt?: boolean
          updated_at?: string
          validate_event_types?: boolean | null
        }
        Update: {
          allowed_roles?: string[] | null
          config?: Json
          deprecation_date?: string | null
          description?: string
          function_name?: string
          is_deprecated?: boolean
          max_payload_size_bytes?: number | null
          rate_limit_enabled?: boolean
          rate_limit_requests_per_hour?: number | null
          rate_limit_requests_per_minute?: number | null
          replacement_function?: string | null
          require_jwt?: boolean
          updated_at?: string
          validate_event_types?: boolean | null
        }
        Relationships: []
      }
      event_staff: {
        Row: {
          assigned_at: string
          assigned_by_user_id: string | null
          convention_id: string
          created_at: string
          id: string
          notes: string | null
          profile_id: string
          role: Database["public"]["Enums"]["user_role"]
          status: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_by_user_id?: string | null
          convention_id: string
          created_at?: string
          id?: string
          notes?: string | null
          profile_id: string
          role: Database["public"]["Enums"]["user_role"]
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_by_user_id?: string | null
          convention_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          profile_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_staff_assigned_by_user_id_fkey"
            columns: ["assigned_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_staff_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_staff_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_suggestions: {
        Row: {
          city_region: string
          contact_method: string
          contact_value: string
          converted_convention_id: string | null
          country: string
          created_at: string
          date_notes: string | null
          date_status: string
          duplicate_of_convention_id: string | null
          end_date: string | null
          event_name: string
          event_type: string
          event_visibility: string
          expected_attendance: number | null
          id: string
          notes: string | null
          official_url: string | null
          preferred_setup: string | null
          resolution_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string | null
          status: string
          submitter_relationship: string
          updated_at: string
          venue_name: string | null
        }
        Insert: {
          city_region: string
          contact_method: string
          contact_value: string
          converted_convention_id?: string | null
          country: string
          created_at?: string
          date_notes?: string | null
          date_status: string
          duplicate_of_convention_id?: string | null
          end_date?: string | null
          event_name: string
          event_type: string
          event_visibility: string
          expected_attendance?: number | null
          id?: string
          notes?: string | null
          official_url?: string | null
          preferred_setup?: string | null
          resolution_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string | null
          status?: string
          submitter_relationship: string
          updated_at?: string
          venue_name?: string | null
        }
        Update: {
          city_region?: string
          contact_method?: string
          contact_value?: string
          converted_convention_id?: string | null
          country?: string
          created_at?: string
          date_notes?: string | null
          date_status?: string
          duplicate_of_convention_id?: string | null
          end_date?: string | null
          event_name?: string
          event_type?: string
          event_visibility?: string
          expected_attendance?: number | null
          id?: string
          notes?: string | null
          official_url?: string | null
          preferred_setup?: string | null
          resolution_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string | null
          status?: string
          submitter_relationship?: string
          updated_at?: string
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_suggestions_converted_convention_id_fkey"
            columns: ["converted_convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_suggestions_duplicate_of_convention_id_fkey"
            columns: ["duplicate_of_convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_suggestions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          convention_id: string | null
          dead_letter_reason: string | null
          dead_lettered_at: string | null
          enqueued_at: string | null
          event_id: string
          idempotency_key: string | null
          last_attempted_at: string | null
          last_error: string | null
          occurred_at: string
          payload: Json
          processed_at: string | null
          queue_message_id: number | null
          queue_name: string | null
          received_at: string
          retry_count: number
          type: string
          user_id: string
        }
        Insert: {
          convention_id?: string | null
          dead_letter_reason?: string | null
          dead_lettered_at?: string | null
          enqueued_at?: string | null
          event_id?: string
          idempotency_key?: string | null
          last_attempted_at?: string | null
          last_error?: string | null
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
          queue_message_id?: number | null
          queue_name?: string | null
          received_at?: string
          retry_count?: number
          type: string
          user_id: string
        }
        Update: {
          convention_id?: string | null
          dead_letter_reason?: string | null
          dead_lettered_at?: string | null
          enqueued_at?: string | null
          event_id?: string
          idempotency_key?: string | null
          last_attempted_at?: string | null
          last_error?: string | null
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
          queue_message_id?: number | null
          queue_name?: string | null
          received_at?: string
          retry_count?: number
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_assignments: {
        Row: {
          assigned_at: string
          created_at: string
          default_applied_at: string | null
          experiment_key: string
          exposure_count: number
          first_exposed_at: string | null
          last_exposed_at: string | null
          metadata: Json
          subject_id: string
          subject_type: string
          updated_at: string
          variant: string
        }
        Insert: {
          assigned_at?: string
          created_at?: string
          default_applied_at?: string | null
          experiment_key: string
          exposure_count?: number
          first_exposed_at?: string | null
          last_exposed_at?: string | null
          metadata?: Json
          subject_id: string
          subject_type: string
          updated_at?: string
          variant: string
        }
        Update: {
          assigned_at?: string
          created_at?: string
          default_applied_at?: string | null
          experiment_key?: string
          exposure_count?: number
          first_exposed_at?: string | null
          last_exposed_at?: string | null
          metadata?: Json
          subject_id?: string
          subject_type?: string
          updated_at?: string
          variant?: string
        }
        Relationships: []
      }
      feature_flag_profile_overrides: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          enabled: boolean
          feature_key: string
          profile_id: string
          reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          enabled: boolean
          feature_key: string
          profile_id: string
          reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          enabled?: boolean
          feature_key?: string
          profile_id?: string
          reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flag_profile_overrides_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_flag_profile_overrides_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "feature_flag_profile_overrides_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          config: Json
          created_at: string
          description: string | null
          enabled: boolean
          key: string
          rollout_percentage: number
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          description?: string | null
          enabled?: boolean
          key: string
          rollout_percentage?: number
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          description?: string | null
          enabled?: boolean
          key?: string
          rollout_percentage?: number
          updated_at?: string
        }
        Relationships: []
      }
      fursuit_bios: {
        Row: {
          ask_me_about: string
          created_at: string
          fursuit_id: string
          id: string
          likes_and_interests: string
          owner_name: string
          photo_credit: string
          pronouns: string
          social_links: Json
          updated_at: string
          version: number
        }
        Insert: {
          ask_me_about: string
          created_at?: string
          fursuit_id: string
          id?: string
          likes_and_interests: string
          owner_name: string
          photo_credit?: string
          pronouns: string
          social_links?: Json
          updated_at?: string
          version: number
        }
        Update: {
          ask_me_about?: string
          created_at?: string
          fursuit_id?: string
          id?: string
          likes_and_interests?: string
          owner_name?: string
          photo_credit?: string
          pronouns?: string
          social_links?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fursuit_bios_fursuit_id_fkey"
            columns: ["fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fursuit_bios_fursuit_id_fkey"
            columns: ["fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits_moderation"
            referencedColumns: ["id"]
          },
        ]
      }
      fursuit_color_assignments: {
        Row: {
          color_id: string
          created_at: string
          fursuit_id: string
          id: string
          position: number
        }
        Insert: {
          color_id: string
          created_at?: string
          fursuit_id: string
          id?: string
          position: number
        }
        Update: {
          color_id?: string
          created_at?: string
          fursuit_id?: string
          id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "fursuit_color_assignments_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "fursuit_colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fursuit_color_assignments_fursuit_id_fkey"
            columns: ["fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fursuit_color_assignments_fursuit_id_fkey"
            columns: ["fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits_moderation"
            referencedColumns: ["id"]
          },
        ]
      }
      fursuit_colors: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          normalized_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          normalized_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          normalized_name?: string | null
        }
        Relationships: []
      }
      fursuit_conventions: {
        Row: {
          active_until: string | null
          convention_id: string
          created_at: string
          finalized_at: string | null
          fursuit_id: string
          removed_at: string | null
          roster_state: RosterState
          roster_visible: boolean
        }
        Insert: {
          active_until?: string | null
          convention_id: string
          created_at?: string
          finalized_at?: string | null
          fursuit_id: string
          removed_at?: string | null
          roster_state?: RosterState
          roster_visible?: boolean
        }
        Update: {
          active_until?: string | null
          convention_id?: string
          created_at?: string
          finalized_at?: string | null
          fursuit_id?: string
          removed_at?: string | null
          roster_state?: RosterState
          roster_visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fursuit_conventions_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fursuit_conventions_fursuit_id_fkey"
            columns: ["fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fursuit_conventions_fursuit_id_fkey"
            columns: ["fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits_moderation"
            referencedColumns: ["id"]
          },
        ]
      }
      fursuit_makers: {
        Row: {
          created_at: string
          fursuit_id: string
          id: string
          maker_name: string
          normalized_maker_name: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          fursuit_id: string
          id?: string
          maker_name: string
          normalized_maker_name: string
          position: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          fursuit_id?: string
          id?: string
          maker_name?: string
          normalized_maker_name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fursuit_makers_fursuit_id_fkey"
            columns: ["fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fursuit_makers_fursuit_id_fkey"
            columns: ["fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits_moderation"
            referencedColumns: ["id"]
          },
        ]
      }
      fursuit_species: {
        Row: {
          created_at: string
          id: string
          name: string
          normalized_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          normalized_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          normalized_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fursuit_species_assignments: {
        Row: {
          created_at: string
          fursuit_id: string
          id: string
          position: number
          species_id: string
        }
        Insert: {
          created_at?: string
          fursuit_id: string
          id?: string
          position: number
          species_id: string
        }
        Update: {
          created_at?: string
          fursuit_id?: string
          id?: string
          position?: number
          species_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fursuit_species_assignments_fursuit_id_fkey"
            columns: ["fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fursuit_species_assignments_fursuit_id_fkey"
            columns: ["fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fursuit_species_assignments_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "fursuit_species"
            referencedColumns: ["id"]
          },
        ]
      }
      fursuits: {
        Row: {
          avatar_path: string | null
          avatar_url: string | null
          catch_count: number
          catch_mode: string
          created_at: string | null
          description: string | null
          flagged_at: string | null
          flagged_reason: string | null
          id: string
          interaction_badges: string[]
          is_flagged: boolean
          is_tutorial: boolean
          name: string
          owner_attribution_visibility: string
          owner_id: string
          social_signal: string | null
          species_id: string | null
          unique_code: string
          visibility_audience: string
        }
        Insert: {
          avatar_path?: string | null
          avatar_url?: string | null
          catch_count?: number
          catch_mode?: string
          created_at?: string | null
          description?: string | null
          flagged_at?: string | null
          flagged_reason?: string | null
          id?: string
          interaction_badges?: string[]
          is_flagged?: boolean
          is_tutorial?: boolean
          name: string
          owner_attribution_visibility?: string
          owner_id: string
          social_signal?: string | null
          species_id?: string | null
          unique_code: string
          visibility_audience?: string
        }
        Update: {
          avatar_path?: string | null
          avatar_url?: string | null
          catch_count?: number
          catch_mode?: string
          created_at?: string | null
          description?: string | null
          flagged_at?: string | null
          flagged_reason?: string | null
          id?: string
          interaction_badges?: string[]
          is_flagged?: boolean
          is_tutorial?: boolean
          name?: string
          owner_attribution_visibility?: string
          owner_id?: string
          social_signal?: string | null
          species_id?: string | null
          unique_code?: string
          visibility_audience?: string
        }
        Relationships: [
          {
            foreignKeyName: "fursuits_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fursuits_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "fursuit_species"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_push_attempts: {
        Row: {
          attempt_number: number
          completed_at: string
          created_at: string
          error_message: string | null
          expo_response_body: Json | null
          expo_response_status: number | null
          expo_ticket_id: string | null
          id: string
          job_id: string
          notification_id: string
          request_snapshot: Json | null
          result_status: string
          skip_reason: string | null
          started_at: string
        }
        Insert: {
          attempt_number: number
          completed_at?: string
          created_at?: string
          error_message?: string | null
          expo_response_body?: Json | null
          expo_response_status?: number | null
          expo_ticket_id?: string | null
          id?: string
          job_id: string
          notification_id: string
          request_snapshot?: Json | null
          result_status: string
          skip_reason?: string | null
          started_at?: string
        }
        Update: {
          attempt_number?: number
          completed_at?: string
          created_at?: string
          error_message?: string | null
          expo_response_body?: Json | null
          expo_response_status?: number | null
          expo_ticket_id?: string | null
          id?: string
          job_id?: string
          notification_id?: string
          request_snapshot?: Json | null
          result_status?: string
          skip_reason?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_push_attempts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "notification_push_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_push_attempts_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_push_jobs: {
        Row: {
          attempt_count: number
          created_at: string
          failed_at: string | null
          id: string
          last_attempted_at: string | null
          last_error: string | null
          last_response_body: Json | null
          last_response_status: number | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string | null
          notification_id: string
          notification_type: string
          payload: Json
          sent_at: string | null
          skipped_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          failed_at?: string | null
          id?: string
          last_attempted_at?: string | null
          last_error?: string | null
          last_response_body?: Json | null
          last_response_status?: number | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          notification_id: string
          notification_type: string
          payload?: Json
          sent_at?: string | null
          skipped_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          failed_at?: string | null
          id?: string
          last_attempted_at?: string | null
          last_error?: string | null
          last_response_body?: Json | null
          last_response_status?: number | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          notification_id?: string
          notification_type?: string
          payload?: Json
          sent_at?: string | null
          skipped_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_push_jobs_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: true
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_push_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_push_receipts: {
        Row: {
          attempt_count: number
          attempt_id: string
          created_at: string
          error_at: string | null
          expired_at: string | null
          expires_at: string
          expo_error: string | null
          expo_message: string | null
          expo_push_token: string
          expo_ticket_id: string
          failed_at: string | null
          id: string
          job_id: string
          last_error: string | null
          last_polled_at: string | null
          last_receipt_body: Json | null
          last_response_body: Json | null
          last_response_status: number | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string | null
          notification_id: string
          ok_at: string | null
          status: string
          token_cleared: boolean
          token_cleared_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          attempt_id: string
          created_at?: string
          error_at?: string | null
          expired_at?: string | null
          expires_at?: string
          expo_error?: string | null
          expo_message?: string | null
          expo_push_token: string
          expo_ticket_id: string
          failed_at?: string | null
          id?: string
          job_id: string
          last_error?: string | null
          last_polled_at?: string | null
          last_receipt_body?: Json | null
          last_response_body?: Json | null
          last_response_status?: number | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          notification_id: string
          ok_at?: string | null
          status?: string
          token_cleared?: boolean
          token_cleared_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          attempt_id?: string
          created_at?: string
          error_at?: string | null
          expired_at?: string | null
          expires_at?: string
          expo_error?: string | null
          expo_message?: string | null
          expo_push_token?: string
          expo_ticket_id?: string
          failed_at?: string | null
          id?: string
          job_id?: string
          last_error?: string | null
          last_polled_at?: string | null
          last_receipt_body?: Json | null
          last_response_body?: Json | null
          last_response_status?: number | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          notification_id?: string
          ok_at?: string | null
          status?: string
          token_cleared?: boolean
          token_cleared_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_push_receipts_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "notification_push_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_push_receipts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "notification_push_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_push_receipts_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_push_receipts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          dedupe_key: string | null
          id: string
          payload: Json
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          id?: string
          payload?: Json
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          id?: string
          payload?: Json
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      player_progress: {
        Row: {
          created_at: string
          last_level_up_at: string | null
          level: number
          total_xp: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_level_up_at?: string | null
          level?: number
          total_xp?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_level_up_at?: string | null
          level?: number
          total_xp?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_xp_events: {
        Row: {
          created_at: string
          dedupe_key: string
          id: string
          level_after: number
          level_before: number
          metadata: Json
          reason: string
          source_event_id: string | null
          user_id: string
          xp_after: number
          xp_amount: number
          xp_before: number
        }
        Insert: {
          created_at?: string
          dedupe_key: string
          id?: string
          level_after: number
          level_before: number
          metadata?: Json
          reason: string
          source_event_id?: string | null
          user_id: string
          xp_after: number
          xp_amount: number
          xp_before: number
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          id?: string
          level_after?: number
          level_before?: number
          metadata?: Json
          reason?: string
          source_event_id?: string | null
          user_id?: string
          xp_after?: number
          xp_amount?: number
          xp_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_xp_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_conventions: {
        Row: {
          active_until: string | null
          attendance_state: AttendanceState
          convention_id: string
          created_at: string
          finalized_at: string | null
          left_at: string | null
          override_actor_id: string | null
          override_at: string | null
          override_reason: string | null
          playable_notified_at: string | null
          profile_id: string
          removed_at: string | null
          verification_method: string | null
          verified_at: string | null
          verified_location: Json | null
        }
        Insert: {
          active_until?: string | null
          attendance_state?: AttendanceState
          convention_id: string
          created_at?: string
          finalized_at?: string | null
          left_at?: string | null
          override_actor_id?: string | null
          override_at?: string | null
          override_reason?: string | null
          playable_notified_at?: string | null
          profile_id: string
          removed_at?: string | null
          verification_method?: string | null
          verified_at?: string | null
          verified_location?: Json | null
        }
        Update: {
          active_until?: string | null
          attendance_state?: AttendanceState
          convention_id?: string
          created_at?: string
          finalized_at?: string | null
          left_at?: string | null
          override_actor_id?: string | null
          override_at?: string | null
          override_reason?: string | null
          playable_notified_at?: string | null
          profile_id?: string
          removed_at?: string | null
          verification_method?: string | null
          verified_at?: string | null
          verified_location?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_conventions_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_conventions_override_actor_id_fkey"
            columns: ["override_actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_conventions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age_confirmed_at: string | null
          age_gate_version: number
          avatar_path: string | null
          avatar_url: string | null
          bio: string | null
          catch_mode_preference_source: string
          created_at: string | null
          default_catch_mode: string
          expo_push_token: string | null
          id: string
          is_adult: boolean | null
          is_new: boolean
          is_suspended: boolean
          legal_terms_accepted_at: string | null
          legal_terms_version: number
          location_permission_granted_at: string | null
          location_permission_requested_at: string | null
          location_permission_status: string | null
          onboarding_completed: boolean
          push_notifications_enabled: boolean
          push_notifications_prompted: boolean | null
          role: Database["public"]["Enums"]["user_role"]
          social_links: Json | null
          suspended_until: string | null
          suspension_reason: string | null
          updated_at: string | null
          username: string | null
          visibility_audience: string
        }
        Insert: {
          age_confirmed_at?: string | null
          age_gate_version?: number
          avatar_path?: string | null
          avatar_url?: string | null
          bio?: string | null
          catch_mode_preference_source?: string
          created_at?: string | null
          default_catch_mode?: string
          expo_push_token?: string | null
          id: string
          is_adult?: boolean | null
          is_new?: boolean
          is_suspended?: boolean
          legal_terms_accepted_at?: string | null
          legal_terms_version?: number
          location_permission_granted_at?: string | null
          location_permission_requested_at?: string | null
          location_permission_status?: string | null
          onboarding_completed?: boolean
          push_notifications_enabled?: boolean
          push_notifications_prompted?: boolean | null
          role?: Database["public"]["Enums"]["user_role"]
          social_links?: Json | null
          suspended_until?: string | null
          suspension_reason?: string | null
          updated_at?: string | null
          username?: string | null
          visibility_audience?: string
        }
        Update: {
          age_confirmed_at?: string | null
          age_gate_version?: number
          avatar_path?: string | null
          avatar_url?: string | null
          bio?: string | null
          catch_mode_preference_source?: string
          created_at?: string | null
          default_catch_mode?: string
          expo_push_token?: string | null
          id?: string
          is_adult?: boolean | null
          is_new?: boolean
          is_suspended?: boolean
          legal_terms_accepted_at?: string | null
          legal_terms_version?: number
          location_permission_granted_at?: string | null
          location_permission_requested_at?: string | null
          location_permission_status?: string | null
          onboarding_completed?: boolean
          push_notifications_enabled?: boolean
          push_notifications_prompted?: boolean | null
          role?: Database["public"]["Enums"]["user_role"]
          social_links?: Json | null
          suspended_until?: string | null
          suspension_reason?: string | null
          updated_at?: string | null
          username?: string | null
          visibility_audience?: string
        }
        Relationships: []
      }
      push_notification_retry_queue: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          notification_id: string
          notification_type: string
          payload: Json | null
          processed_at: string | null
          request_body: Json | null
          response_body: Json | null
          response_status: number | null
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          notification_id: string
          notification_type: string
          payload?: Json | null
          processed_at?: string | null
          request_body?: Json | null
          response_body?: Json | null
          response_status?: number | null
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          notification_id?: string
          notification_type?: string
          payload?: Json | null
          processed_at?: string | null
          request_body?: Json | null
          response_body?: Json | null
          response_status?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_notification_retry_queue_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_notification_retry_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_scans: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          result: string
          scan_method: string
          scanned_identifier: string
          scanner_user_id: string | null
          tag_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          result: string
          scan_method: string
          scanned_identifier: string
          scanner_user_id?: string | null
          tag_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          result?: string
          scan_method?: string
          scanned_identifier?: string
          scanner_user_id?: string | null
          tag_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tag_scans_scanner_user_id_fkey"
            columns: ["scanner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_scans_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          catch_count: number
          disabled_at: string | null
          disabled_by: string | null
          expires_at: string | null
          fursuit_id: string | null
          id: string
          label: string | null
          last_scanned_at: string | null
          linked_at: string | null
          qr_asset_path: string | null
          qr_token: string | null
          qr_token_created_at: string | null
          qr_token_hash: string | null
          registered_at: string
          registered_by_user_id: string | null
          replaced_by_tag_id: string | null
          scan_count: number
          status: string
          updated_at: string
        }
        Insert: {
          catch_count?: number
          disabled_at?: string | null
          disabled_by?: string | null
          expires_at?: string | null
          fursuit_id?: string | null
          id?: string
          label?: string | null
          last_scanned_at?: string | null
          linked_at?: string | null
          qr_asset_path?: string | null
          qr_token?: string | null
          qr_token_created_at?: string | null
          qr_token_hash?: string | null
          registered_at?: string
          registered_by_user_id?: string | null
          replaced_by_tag_id?: string | null
          scan_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          catch_count?: number
          disabled_at?: string | null
          disabled_by?: string | null
          expires_at?: string | null
          fursuit_id?: string | null
          id?: string
          label?: string | null
          last_scanned_at?: string | null
          linked_at?: string | null
          qr_asset_path?: string | null
          qr_token?: string | null
          qr_token_created_at?: string | null
          qr_token_hash?: string | null
          registered_at?: string
          registered_by_user_id?: string | null
          replaced_by_tag_id?: string | null
          scan_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_disabled_by_fkey"
            columns: ["disabled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_fursuit_id_fkey"
            columns: ["fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_fursuit_id_fkey"
            columns: ["fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_registered_by_user_id_fkey"
            columns: ["registered_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_replaced_by_tag_id_fkey"
            columns: ["replaced_by_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_id: string
          context: Json
          id: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          context?: Json
          id?: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          context?: Json
          id?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_daily_progress: {
        Row: {
          completed_at: string | null
          convention_id: string
          created_at: string
          current_count: number
          day: string
          is_completed: boolean
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          convention_id: string
          created_at?: string
          current_count?: number
          day: string
          is_completed?: boolean
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          convention_id?: string
          created_at?: string
          current_count?: number
          day?: string
          is_completed?: boolean
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_daily_progress_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_daily_progress_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "daily_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_daily_streaks: {
        Row: {
          best_streak: number
          convention_id: string
          created_at: string
          current_streak: number
          last_completed_day: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          best_streak?: number
          convention_id: string
          created_at?: string
          current_streak?: number
          last_completed_day?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          best_streak?: number
          convention_id?: string
          created_at?: string
          current_streak?: number
          last_completed_day?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_daily_streaks_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_moderation_actions: {
        Row: {
          action_type: string
          applied_by_user_id: string
          convention_id: string | null
          created_at: string
          duration_hours: number | null
          expires_at: string | null
          id: string
          internal_notes: string | null
          is_active: boolean
          reason: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by_user_id: string | null
          scope: string
          user_id: string
        }
        Insert: {
          action_type: string
          applied_by_user_id: string
          convention_id?: string | null
          created_at?: string
          duration_hours?: number | null
          expires_at?: string | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          reason: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          scope?: string
          user_id: string
        }
        Update: {
          action_type?: string
          applied_by_user_id?: string
          convention_id?: string | null
          created_at?: string
          duration_hours?: number | null
          expires_at?: string | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          reason?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          scope?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_moderation_actions_applied_by_user_id_fkey"
            columns: ["applied_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_moderation_actions_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_moderation_actions_revoked_by_user_id_fkey"
            columns: ["revoked_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_moderation_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reports: {
        Row: {
          convention_id: string | null
          created_at: string
          description: string
          id: string
          report_type: string
          reported_fursuit_id: string | null
          reported_user_id: string | null
          reporter_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by_user_id: string | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          convention_id?: string | null
          created_at?: string
          description: string
          id?: string
          report_type: string
          reported_fursuit_id?: string | null
          reported_user_id?: string | null
          reporter_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Update: {
          convention_id?: string | null
          created_at?: string
          description?: string
          id?: string
          report_type?: string
          reported_fursuit_id?: string | null
          reported_user_id?: string | null
          reporter_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reports_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reported_fursuit_id_fkey"
            columns: ["reported_fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reported_fursuit_id_fkey"
            columns: ["reported_fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_resolved_by_user_id_fkey"
            columns: ["resolved_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_attempts: {
        Row: {
          convention_id: string | null
          created_at: string | null
          distance_meters: number | null
          error_code: string | null
          gps_accuracy: number | null
          id: string
          profile_id: string | null
          verified: boolean
        }
        Insert: {
          convention_id?: string | null
          created_at?: string | null
          distance_meters?: number | null
          error_code?: string | null
          gps_accuracy?: number | null
          id?: string
          profile_id?: string | null
          verified: boolean
        }
        Update: {
          convention_id?: string | null
          created_at?: string | null
          distance_meters?: number | null
          error_code?: string | null
          gps_accuracy?: number | null
          id?: string
          profile_id?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "verification_attempts_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_attempts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      catch_mode_default_experiment_results: {
        Row: {
          accepted_catches_after_exposure: number | null
          assigned_profiles: number | null
          catches_after_exposure: number | null
          current_auto_profiles: number | null
          current_manual_profiles: number | null
          defaults_applied: number | null
          experiment_key: string | null
          exposed_profiles: number | null
          fursuits_created_after_exposure: number | null
          pending_catches_after_exposure: number | null
          switch_away_rate: number | null
          switched_away_profiles: number | null
          variant: string | null
        }
        Relationships: []
      }
      fursuits_moderation: {
        Row: {
          created_at: string | null
          flagged_at: string | null
          flagged_reason: string | null
          id: string | null
          is_flagged: boolean | null
          name: string | null
          owner_id: string | null
          unique_code: string | null
        }
        Insert: {
          created_at?: string | null
          flagged_at?: string | null
          flagged_reason?: string | null
          id?: string | null
          is_flagged?: boolean | null
          name?: string | null
          owner_id?: string | null
          unique_code?: string | null
        }
        Update: {
          created_at?: string | null
          flagged_at?: string | null
          flagged_reason?: string | null
          id?: string | null
          is_flagged?: boolean | null
          name?: string | null
          owner_id?: string | null
          unique_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fursuits_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_achievement_unlocks_daily: {
        Row: {
          achievement_id: string | null
          day_bucket: string | null
          unlock_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_catches_hourly: {
        Row: {
          avg_approval_seconds: number | null
          catch_count: number | null
          convention_id: string | null
          hour_bucket: string | null
          unique_catchers: number | null
          unique_fursuits: number | null
        }
        Relationships: [
          {
            foreignKeyName: "catches_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_convention_daily_stats: {
        Row: {
          active_fursuits: number | null
          active_players: number | null
          convention_id: string | null
          day_bucket: string | null
          pending_count: number | null
          rejected_count: number | null
          total_catches: number | null
        }
        Relationships: [
          {
            foreignKeyName: "catches_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      approve_catch_invite: {
        Args: {
          p_claimant_profile_id: string
          p_fursuit_id: string
          p_invite_id: string
        }
        Returns: Json
      }
      archive_gameplay_event_queue_message: {
        Args: { p_message_id: number }
        Returns: boolean
      }
      archive_old_events: { Args: never; Returns: undefined }
      attach_catch_photo_after_upload: {
        Args: {
          p_catch_id: string
          p_catch_photo_path: string
          p_catch_photo_source?: string
          p_catch_photo_url: string
          p_catcher_id: string
        }
        Returns: Json
      }
      attach_fursuit_qr_asset: {
        Args: { p_asset_path: string; p_tag_id: string }
        Returns: {
          qr_asset_path: string
          tag_id: string
        }[]
      }
      attach_fursuit_qr_asset_without_feature_gate: {
        Args: { p_asset_path: string; p_tag_id: string }
        Returns: {
          qr_asset_path: string
          tag_id: string
        }[]
      }
      award_owned_fursuit_catch_xp_once: {
        Args: {
          p_catch_id: string
          p_convention_id?: string
          p_daily_cap?: number
          p_fursuit_id: string
          p_local_day: string
          p_metadata?: Json
          p_owner_id: string
          p_source_event_id?: string
          p_xp_amount: number
        }
        Returns: {
          awarded: boolean
          level_after: number
          level_before: number
          leveled_up: boolean
          levels_gained: number
          user_id: string
          xp_after: number
          xp_amount: number
          xp_before: number
          xp_event_id: string
        }[]
      }
      award_player_xp_once: {
        Args: {
          p_dedupe_key: string
          p_metadata?: Json
          p_reason: string
          p_source_event_id?: string
          p_user_id: string
          p_xp_amount: number
        }
        Returns: {
          awarded: boolean
          level_after: number
          level_before: number
          leveled_up: boolean
          levels_gained: number
          user_id: string
          xp_after: number
          xp_amount: number
          xp_before: number
          xp_event_id: string
        }[]
      }
      calculate_catch_expiration:
        | { Args: never; Returns: string }
        | { Args: { convention_id_param: string }; Returns: string }
      calculate_convention_closeout_not_before: {
        Args: { p_end_date: string; p_timezone: string }
        Returns: string
      }
      can_catch_fursuit: {
        Args: { p_catcher_id: string; p_fursuit_id: string }
        Returns: boolean
      }
      can_catch_fursuit_as_profile: {
        Args: { p_catcher_id: string; p_fursuit_id: string }
        Returns: boolean
      }
      can_manage_qr_asset_object: {
        Args: { p_object_name: string; p_viewer_id: string }
        Returns: boolean
      }
      can_view_catch_photo_object: {
        Args: { p_object_name: string; p_viewer_id: string }
        Returns: boolean
      }
      can_view_fursuit: {
        Args: { p_fursuit_id: string; p_viewer_id: string }
        Returns: boolean
      }
      can_view_fursuit_as_profile: {
        Args: { p_fursuit_id: string; p_viewer_id: string }
        Returns: boolean
      }
      can_view_fursuit_avatar_object: {
        Args: { p_object_name: string; p_viewer_id: string }
        Returns: boolean
      }
      can_view_fursuit_owner: {
        Args: { p_fursuit_id: string; p_viewer_id: string }
        Returns: boolean
      }
      can_view_profile: {
        Args: { p_target_id: string; p_viewer_id: string }
        Returns: boolean
      }
      can_view_profile_as_profile: {
        Args: { p_target_id: string; p_viewer_id: string }
        Returns: boolean
      }
      can_view_profile_avatar_object: {
        Args: { p_object_name: string; p_viewer_id: string }
        Returns: boolean
      }
      can_view_public_qr_fursuit_avatar_object: {
        Args: { p_object_name: string }
        Returns: boolean
      }
      catch_invite_expiration: {
        Args: { p_convention_id: string }
        Returns: string
      }
      claim_catch_invite: {
        Args: { p_claimant_profile_id: string; p_token_hash: string }
        Returns: Json
      }
      claim_notification_push_jobs: {
        Args: {
          p_limit?: number
          p_notification_id?: string
          p_worker_id: string
        }
        Returns: {
          attempt_number: number
          id: string
          max_attempts: number
          notification_id: string
          notification_type: string
          payload: Json
          user_id: string
        }[]
      }
      claim_notification_push_receipts: {
        Args: { p_limit?: number; p_worker_id: string }
        Returns: {
          attempt_id: string
          attempt_number: number
          expires_at: string
          expo_push_token: string
          expo_ticket_id: string
          id: string
          job_id: string
          max_attempts: number
          notification_id: string
          user_id: string
        }[]
      }
      claim_unprocessed_events: {
        Args: { p_batch_size?: number; p_min_age_seconds?: number }
        Returns: {
          convention_id: string | null
          dead_letter_reason: string | null
          dead_lettered_at: string | null
          enqueued_at: string | null
          event_id: string
          idempotency_key: string | null
          last_attempted_at: string | null
          last_error: string | null
          occurred_at: string
          payload: Json
          processed_at: string | null
          queue_message_id: number | null
          queue_name: string | null
          received_at: string
          retry_count: number
          type: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_old_audit_logs: { Args: never; Returns: undefined }
      cleanup_old_notifications: { Args: never; Returns: undefined }
      complete_notification_push_job: {
        Args: {
          p_error_message?: string
          p_expo_push_token?: string
          p_expo_ticket_id?: string
          p_job_id: string
          p_request_snapshot?: Json
          p_response_body?: Json
          p_response_status?: number
          p_result_status: string
          p_retry_after_seconds?: number
          p_skip_reason?: string
          p_worker_id: string
        }
        Returns: string
      }
      complete_notification_push_receipt: {
        Args: {
          p_error_message?: string
          p_expo_error?: string
          p_expo_message?: string
          p_receipt_body?: Json
          p_receipt_id: string
          p_response_body?: Json
          p_response_status?: number
          p_result_status: string
          p_retry_after_seconds?: number
          p_token_cleared?: boolean
          p_worker_id: string
        }
        Returns: string
      }
      confirm_catch: {
        Args: {
          p_catch_id: string
          p_decision: string
          p_reason?: string
          p_user_id: string
        }
        Returns: Json
      }
      count_accepted_catches_by_catcher_on_date: {
        Args: {
          p_catcher_id: string
          p_convention_id: string
          p_date: string
          p_timezone: string
        }
        Returns: number
      }
      count_distinct_conventions: { Args: { user_id: string }; Returns: number }
      count_distinct_conventions_for_catcher_fursuit: {
        Args: { p_catcher_id: string; p_fursuit_id: string }
        Returns: number
      }
      count_distinct_conventions_for_fursuit: {
        Args: { p_fursuit_id: string }
        Returns: number
      }
      count_distinct_local_days_for_fursuit_at_convention: {
        Args: {
          p_convention_id: string
          p_fursuit_id: string
          p_timezone: string
        }
        Returns: number
      }
      count_distinct_makers_caught_at_convention: {
        Args: { p_catcher_id: string; p_convention_id: string }
        Returns: number
      }
      count_distinct_self_made_fursuits_caught: {
        Args: { p_catcher_id: string; p_self_made_aliases: string[] }
        Returns: number
      }
      count_distinct_species_caught: {
        Args: { user_id: string }
        Returns: number
      }
      count_real_achievements_for_user: {
        Args: { p_user_id: string }
        Returns: number
      }
      count_unique_catchers_for_fursuit_lifetime: {
        Args: { p_fursuit_id: string }
        Returns: number
      }
      count_user_fursuits: { Args: { p_user_id: string }; Returns: number }
      create_catch_invite: {
        Args: {
          p_catch_photo_path: string
          p_catch_photo_source?: string
          p_catch_photo_url: string
          p_caught_at?: string
          p_convention_id?: string
          p_invitee_display_name?: string
          p_inviter_profile_id: string
          p_token_hash: string
        }
        Returns: Json
      }
      create_catch_reciprocal_offer: {
        Args: {
          p_offered_by_profile_id: string
          p_offered_fursuit_id: string
          p_primary_catch_id: string
        }
        Returns: Json
      }
      create_catch_with_approval: {
        Args: {
          p_catch_photo_source?: string
          p_catcher_id: string
          p_convention_id?: string
          p_force_pending?: boolean
          p_fursuit_id: string
        }
        Returns: Json
      }
      create_catch_with_event: {
        Args: {
          p_catch_photo_path?: string
          p_catch_photo_source?: string
          p_catch_photo_url?: string
          p_catcher_id: string
          p_client_attempt_id?: string
          p_convention_id?: string
          p_force_pending?: boolean
          p_fursuit_id: string
          p_photo_upload_state?: string
        }
        Returns: Json
      }
      create_fursuit_qr_code: {
        Args: { p_fursuit_id: string; p_label?: string }
        Returns: {
          created_at: string
          fursuit_id: string
          label: string
          qr_asset_path: string
          qr_token: string
          qr_url: string
          status: string
          tag_id: string
        }[]
      }
      create_fursuit_qr_code_without_feature_gate: {
        Args: { p_fursuit_id: string; p_label?: string }
        Returns: {
          created_at: string
          fursuit_id: string
          label: string
          qr_asset_path: string
          qr_token: string
          qr_url: string
          status: string
          tag_id: string
        }[]
      }
      current_user_has_password_credential: { Args: never; Returns: boolean }
      decline_catch_invite: {
        Args: { p_claimant_profile_id: string; p_invite_id: string }
        Returns: Json
      }
      delete_archived_convention_in_dev: {
        Args: { p_actor_id: string; p_convention_id: string }
        Returns: {
          cleanup_notes: string[]
          convention_name: string
          counts: Json
          deleted: boolean
        }[]
      }
      delete_gameplay_event_queue_message: {
        Args: { p_message_id: number }
        Returns: boolean
      }
      detect_duplicate_tag_users: {
        Args: { p_hours_ago?: number; p_tag_uid: string }
        Returns: {
          catcher_id: string
          last_seen: string
          scan_count: number
        }[]
      }
      disable_fursuit_qr_code: {
        Args: { p_tag_id: string }
        Returns: {
          disabled_at: string
          status: string
          tag_id: string
        }[]
      }
      disable_fursuit_qr_code_without_feature_gate: {
        Args: { p_tag_id: string }
        Returns: {
          disabled_at: string
          status: string
          tag_id: string
        }[]
      }
      enqueue_notification_push_job: {
        Args: { p_notification_id: string }
        Returns: string
      }
      ensure_own_profile_exists: {
        Args: { p_username?: string }
        Returns: undefined
      }
      execute_data_retention_cleanup: { Args: never; Returns: Json }
      expire_bans: { Args: never; Returns: Json }
      expire_moderation_actions: { Args: never; Returns: undefined }
      expire_pending_catches: { Args: never; Returns: Json }
      expire_pending_catches_for_convention_closeout: {
        Args: { p_convention_id: string }
        Returns: Json
      }
      expire_stale_catch_invites: { Args: never; Returns: Json }
      fetch_unprocessed_events: {
        Args: { batch_size?: number; min_age_seconds?: number }
        Returns: {
          convention_id: string
          event_id: string
          occurred_at: string
          payload: Json
          received_at: string
          retry_count: number
          type: string
          user_id: string
        }[]
      }
      finish_onboarding: { Args: { target_user_id?: string }; Returns: Json }
      generate_profile_avatar_url: {
        Args: { app_meta: Json; user_meta: Json }
        Returns: string
      }
      generate_profile_username: {
        Args: { app_meta: Json; user_email: string; user_meta: Json }
        Returns: string
      }
      generate_qr_token: { Args: never; Returns: string }
      get_active_profile_convention_ids: {
        Args: { p_profile_id: string }
        Returns: {
          convention_id: string
        }[]
      }
      get_active_shared_convention_ids: {
        Args: { p_fursuit_id: string; p_profile_id: string }
        Returns: {
          convention_id: string
        }[]
      }
      get_backend_worker_run_health: {
        Args: never
        Returns: {
          display_name: string
          idle_count_24h: number
          last_failure_at: string
          last_heartbeat_at: string
          last_idle_at: string
          last_idle_counts: Json
          last_success_at: string
          latest_completed_at: string
          latest_counts: Json
          latest_duration_ms: number
          latest_error_message: string
          latest_run_id: string
          latest_source: string
          latest_started_at: string
          latest_status: string
          recent_failure_count: number
          running_started_at: string
          worker_name: string
        }[]
      }
      get_blocked_users: {
        Args: { p_user_id: string }
        Returns: {
          blocked_avatar_url: string
          blocked_id: string
          blocked_username: string
          blocker_id: string
          created_at: string
          id: string
        }[]
      }
      get_catch_detail: {
        Args: { p_catch_id: string }
        Returns: {
          catch_id: string
          catch_number: number
          catch_photo_path: string
          catch_photo_url: string
          caught_at: string
          color_assignments: Json
          convention: Json
          convention_id: string
          fursuit_avatar_path: string
          fursuit_avatar_url: string
          fursuit_bio: Json
          fursuit_catch_count: number
          fursuit_created_at: string
          fursuit_description: string
          fursuit_id: string
          fursuit_interaction_badges: string[]
          fursuit_name: string
          fursuit_owner_attribution_visibility: string
          fursuit_owner_id: string
          fursuit_redacted: boolean
          fursuit_social_signal: string
          fursuit_unique_code: string
          fursuit_visibility_audience: string
          makers: Json
          owner_social_links: Json
          species_id: string
          species_name: string
        }[]
      }
      get_convention_leaderboard: {
        Args: { p_convention_id?: string }
        Returns: {
          catch_count: number
          catcher_id: string
          convention_id: string
          first_catch_at: string
          last_catch_at: string
          profile_redacted: boolean
          unique_fursuits: number
          unique_species: number
          username: string
        }[]
      }
      get_convention_lifecycle_health_counts: {
        Args: {
          p_convention_ids: string[]
          p_local_days?: Json
          p_retry_window_start?: string
          p_throttle_window_start?: string
        }
        Returns: {
          accepted_convention_catches_count: number
          active_fursuit_assignments_count: number
          active_profile_memberships_count: number
          automation_retry_attempts_last_7_days: number
          convention_id: string
          convention_tasks_count: number
          last_automation_attempt_at: string
          last_automation_source: string
          participant_recaps_count: number
          pending_convention_catches_count: number
          recent_cron_close_attempt: boolean
          recent_cron_retry_attempt: boolean
          today_assignments_count: number
        }[]
      }
      get_convention_suit_leaderboard: {
        Args: { p_convention_id: string }
        Returns: {
          catch_count: number
          color_assignments: Json
          convention_id: string
          first_caught_at: string
          fursuit_avatar_url: string
          fursuit_id: string
          fursuit_name: string
          fursuit_redacted: boolean
          last_caught_at: string
          owner_id: string
          species_id: string
          species_name: string
          unique_catchers: number
        }[]
      }
      get_convention_suit_roster: {
        Args: { p_convention_id: string }
        Returns: {
          color_assignments: Json
          convention_catch_count: number
          convention_id: string
          fursuit_avatar_path: string
          fursuit_avatar_url: string
          fursuit_id: string
          fursuit_name: string
          owner_id: string
          owner_username: string
          roster_visible: boolean
          species_id: string
          species_name: string
        }[]
      }
      get_convention_suit_roster_caught_ids: {
        Args: { p_convention_id: string }
        Returns: {
          fursuit_id: string
        }[]
      }
      get_event_dashboard_summary: {
        Args: { p_convention_id: string }
        Returns: {
          active_fursuits: number
          active_players: number
          avg_catches_per_hour: number
          peak_hour: string
          pending_approval: number
          total_achievements: number
          total_catches: number
        }[]
      }
      get_fursuit_catches: {
        Args: { p_fursuit_id: string }
        Returns: {
          catch_id: string
          catch_photo_path: string
          catch_photo_url: string
          caught_at: string
          is_redacted: boolean
        }[]
      }
      get_fursuit_convention_stats: {
        Args: { p_convention_id: string; p_fursuit_id: string }
        Returns: {
          total_catches: number
          unique_catchers: number
        }[]
      }
      get_fursuit_detail: {
        Args: { p_fursuit_id: string }
        Returns: {
          avatar_path: string
          avatar_url: string
          catch_count: number
          color_assignments: Json
          created_at: string
          description: string
          fursuit_bio: Json
          fursuit_conventions: Json
          id: string
          interaction_badges: string[]
          makers: Json
          name: string
          owner_attribution_visibility: string
          owner_id: string
          owner_social_links: Json
          social_signal: string
          species_entry: Json
          species_id: string
          unique_code: string
          visibility_audience: string
        }[]
      }
      get_fursuit_limit_for_profile: {
        Args: { p_profile_id: string }
        Returns: number
      }
      get_gallery_profile_convention_ids: {
        Args: { p_profile_id: string }
        Returns: {
          convention_id: string
        }[]
      }
      get_gallery_shared_convention_ids: {
        Args: { p_fursuit_id: string; p_profile_id: string }
        Returns: {
          convention_id: string
        }[]
      }
      get_gameplay_queue_health: {
        Args: never
        Returns: {
          dead_lettered_event_count: number
          grouped_failures: Json
          oldest_unprocessed_event_age_seconds: number
          oldest_unprocessed_event_received_at: string
          oldest_visible_message_age_seconds: number
          oldest_visible_message_enqueued_at: string
          queue_depth: number
          retrying_event_count: number
          visible_queue_depth: number
        }[]
      }
      get_global_dashboard_summary: {
        Args: never
        Returns: {
          active_fursuits: number
          active_players: number
          avg_catches_per_hour: number
          peak_hour: string
          pending_approval: number
          total_achievements: number
          total_catches: number
        }[]
      }
      get_joinable_conventions: {
        Args: never
        Returns: {
          end_date: string
          geofence_enabled: boolean
          geofence_radius_meters: number
          id: string
          is_joinable: boolean
          latitude: number
          local_day: string
          location: string
          location_verification_required: boolean
          longitude: number
          name: string
          slug: string
          start_date: string
          status: string
          timezone: string
        }[]
      }
      get_my_caught_suits: {
        Args: never
        Returns: {
          catch_id: string
          catch_number: number
          catch_photo_path: string
          catch_photo_url: string
          caught_at: string
          color_assignments: Json
          convention: Json
          convention_id: string
          fursuit_avatar_path: string
          fursuit_avatar_url: string
          fursuit_bio: Json
          fursuit_catch_count: number
          fursuit_created_at: string
          fursuit_description: string
          fursuit_id: string
          fursuit_interaction_badges: string[]
          fursuit_name: string
          fursuit_owner_attribution_visibility: string
          fursuit_owner_id: string
          fursuit_redacted: boolean
          fursuit_social_signal: string
          fursuit_unique_code: string
          fursuit_visibility_audience: string
          makers: Json
          owner_social_links: Json
          species_id: string
          species_name: string
        }[]
      }
      get_my_convention_memberships: {
        Args: never
        Returns: {
          closeout_not_before: string
          convention_id: string
          end_date: string
          finalizing_started_at: string
          geofence_enabled: boolean
          geofence_radius_meters: number
          id: string
          is_joinable: boolean
          joined_at: string
          latitude: number
          local_day: string
          location: string
          location_verification_required: boolean
          longitude: number
          membership_state: string
          name: string
          override_at: string
          playable_notified_at: string
          slug: string
          start_date: string
          status: string
          timezone: string
          verification_method: string
          verified_at: string
        }[]
      }
      get_my_convention_recap_detail: {
        Args: { p_recap_id: string }
        Returns: {
          achievements: Json
          awards: Json
          caught_fursuits: Json
          daily_summary: Json
          owned_fursuits: Json
          recap: Json
        }[]
      }
      get_my_convention_recaps: {
        Args: never
        Returns: {
          achievements_unlocked_count: number
          catch_count: number
          convention_id: string
          convention_name: string
          daily_tasks_completed_count: number
          end_date: string
          final_rank: number
          generated_at: string
          location: string
          own_fursuits_caught_count: number
          recap_id: string
          start_date: string
          summary: Json
          unique_catchers_for_own_fursuits_count: number
          unique_fursuits_caught_count: number
        }[]
      }
      get_or_assign_catch_mode_default_experiment: {
        Args: never
        Returns: {
          assignment_created: boolean
          current_catch_mode: string
          current_preference_source: string
          default_applied: boolean
          experiment_key: string
          exposed_at: string
          previous_catch_mode: string
          previous_preference_source: string
          profile_id: string
          variant: string
        }[]
      }
      get_pending_catch_count: { Args: { p_user_id: string }; Returns: number }
      get_pending_catches: {
        Args: { p_user_id: string }
        Returns: {
          catch_id: string
          catch_photo_source: string
          catch_photo_url: string
          catcher_avatar_url: string
          catcher_id: string
          catcher_username: string
          caught_at: string
          convention_id: string
          convention_name: string
          expires_at: string
          fursuit_avatar_url: string
          fursuit_id: string
          fursuit_name: string
          photo_upload_state: string
          reciprocal_fursuit_avatar_url: string
          reciprocal_fursuit_id: string
          reciprocal_fursuit_name: string
          reciprocal_offer_id: string
          time_remaining: string
        }[]
      }
      get_player_level_summary: {
        Args: { p_user_id: string }
        Returns: {
          level: number
          user_id: string
        }[]
      }
      get_profile_fursuits: {
        Args: { p_profile_id: string }
        Returns: {
          avatar_path: string
          avatar_url: string
          catch_count: number
          color_assignments: Json
          created_at: string
          description: string
          fursuit_bio: Json
          fursuit_conventions: Json
          id: string
          interaction_badges: string[]
          makers: Json
          name: string
          owner_attribution_visibility: string
          owner_id: string
          owner_social_links: Json
          social_signal: string
          species_entry: Json
          species_id: string
          visibility_audience: string
        }[]
      }
      get_user_moderation_summary: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_user_role: {
        Args: { user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      grant_achievements_batch: { Args: { awards: Json }; Returns: Json }
      has_new_maker_for_catcher_at_convention: {
        Args: {
          p_catch_id: string
          p_catcher_id: string
          p_convention_id: string
          p_normalized_maker_names: string[]
        }
        Returns: boolean
      }
      has_visible_gameplay_event_queue_messages: {
        Args: never
        Returns: boolean
      }
      hash_ip_address: { Args: { ip_addr: unknown }; Returns: string }
      hash_qr_token: { Args: { p_token: string }; Returns: string }
      increment_qr_tag_counters: {
        Args: { p_count_catch?: boolean; p_tag_id: string }
        Returns: undefined
      }
      ingest_gameplay_event: {
        Args: {
          p_convention_id: string
          p_idempotency_key?: string
          p_occurred_at: string
          p_payload: Json
          p_type: string
          p_user_id: string
        }
        Returns: {
          duplicate: boolean
          enqueued: boolean
          event_id: string
        }[]
      }
      insert_catch_notification_once: {
        Args: { p_payload: Json; p_type: string; p_user_id: string }
        Returns: undefined
      }
      insert_convention_recap_ready_notification_once: {
        Args: { p_payload: Json; p_user_id: string }
        Returns: boolean
      }
      insert_next_fursuit_bio_version: {
        Args: {
          p_ask_me_about: string
          p_fursuit_id: string
          p_likes_and_interests: string
          p_owner_name: string
          p_photo_credit: string
          p_pronouns: string
          p_social_links?: Json
        }
        Returns: number
      }
      insert_notification_once: {
        Args: {
          p_dedupe_key: string
          p_payload: Json
          p_type: string
          p_user_id: string
        }
        Returns: {
          inserted: boolean
          notification_id: string
        }[]
      }
      invoke_edge_function: {
        Args: { p_body?: Json; p_function_name: string }
        Returns: undefined
      }
      is_active_qr_tag_status: {
        Args: { p_disabled_at: string; p_expires_at: string; p_status: string }
        Returns: boolean
      }
      is_admin: { Args: { user_id: string }; Returns: boolean }
      is_admin_user: { Args: { check_user_id: string }; Returns: boolean }
      is_adult_profile: { Args: { p_profile_id: string }; Returns: boolean }
      is_blocked: {
        Args: { p_user_a: string; p_user_b: string }
        Returns: boolean
      }
      is_convention_closeout_started: {
        Args: { p_convention_id: string }
        Returns: boolean
      }
      is_convention_gallery_catchable: {
        Args: { p_convention_id: string }
        Returns: boolean
      }
      is_convention_joinable: {
        Args: { p_convention_id: string }
        Returns: boolean
      }
      is_convention_leaderboard_visible: {
        Args: { p_convention_id: string }
        Returns: boolean
      }
      is_convention_prejoinable: {
        Args: { p_convention_id: string }
        Returns: boolean
      }
      is_elevated_privacy_viewer: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      is_event_staff: {
        Args: { convention_id: string; user_id: string }
        Returns: boolean
      }
      is_feature_enabled_for_profile: {
        Args: { p_feature_key: string; p_profile_id: string }
        Returns: boolean
      }
      is_fursuit_unique_code_available: {
        Args: { p_excluding_fursuit_id?: string; p_unique_code: string }
        Returns: boolean
      }
      is_moderator_or_higher: {
        Args: { check_user_id: string }
        Returns: boolean
      }
      is_printable_fursuit_qr_enabled_for_profile: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      is_profile_convention_gallery_catch_eligible: {
        Args: { p_convention_id: string; p_profile_id: string }
        Returns: boolean
      }
      is_profile_convention_gameplay_eligible: {
        Args: { p_convention_id: string; p_profile_id: string }
        Returns: boolean
      }
      is_tutorial_fursuit: { Args: { p_fursuit_id: string }; Returns: boolean }
      is_username_available: {
        Args: { p_current_user_id?: string; p_username: string }
        Returns: boolean
      }
      is_valid_event_type: { Args: { p_event_type: string }; Returns: boolean }
      leave_convention: {
        Args: { p_convention_id: string; p_profile_id: string }
        Returns: undefined
      }
      list_fursuit_qr_codes: {
        Args: { p_fursuit_id: string }
        Returns: {
          catch_count: number
          created_at: string
          disabled_at: string
          expires_at: string
          fursuit_id: string
          label: string
          last_scanned_at: string
          linked_at: string
          qr_asset_path: string
          replaced_by_tag_id: string
          scan_count: number
          status: string
          tag_id: string
        }[]
      }
      list_fursuit_qr_codes_without_feature_gate: {
        Args: { p_fursuit_id: string }
        Returns: {
          catch_count: number
          created_at: string
          disabled_at: string
          expires_at: string
          fursuit_id: string
          label: string
          last_scanned_at: string
          linked_at: string
          qr_asset_path: string
          replaced_by_tag_id: string
          scan_count: number
          status: string
          tag_id: string
        }[]
      }
      log_admin_action: {
        Args: {
          p_action: string
          p_actor_id: string
          p_context?: Json
          p_diff?: Json
          p_entity_id?: string
          p_entity_type: string
          p_ip_address?: unknown
          p_user_agent?: string
        }
        Returns: string
      }
      normalize_qr_label: { Args: { p_label: string }; Returns: string }
      notify_catch_decision: {
        Args: {
          p_catch_id: string
          p_catcher_id: string
          p_decision: string
          p_fursuit_id: string
          p_fursuit_name: string
          p_rejection_reason?: string
        }
        Returns: undefined
      }
      notify_catch_pending: {
        Args: {
          p_catch_id: string
          p_catcher_id: string
          p_catcher_username: string
          p_fursuit_name: string
          p_fursuit_owner_id: string
        }
        Returns: undefined
      }
      opt_in_to_convention: {
        Args: {
          p_convention_id: string
          p_override_reason?: string
          p_profile_id: string
          p_verification_method?: string
          p_verified_location?: Json
        }
        Returns: undefined
      }
      persist_daily_task_state_and_notifications: {
        Args: { p_notifications: Json; p_progress_rows: Json; p_streak: Json }
        Returns: undefined
      }
      player_level_for_xp: { Args: { p_total_xp: number }; Returns: number }
      preview_player_leveling_backfill: {
        Args: never
        Returns: {
          already_awarded_count: number
          already_awarded_xp: number
          candidate_count: number
          candidate_xp: number
          reason: string
          would_award_count: number
          would_award_xp: number
        }[]
      }
      process_achievement_queue_if_active: { Args: never; Returns: undefined }
      process_catch_reciprocal_offer: {
        Args: { p_offer_id: string }
        Returns: Json
      }
      process_gameplay_queue_if_active: { Args: never; Returns: undefined }
      purge_geo_verification_data: { Args: never; Returns: Json }
      read_backend_runtime_config: {
        Args: { p_config_names: string[] }
        Returns: {
          config: Json
          config_name: string
        }[]
      }
      read_catch_invite_payload: {
        Args: { p_invite: Database["public"]["Tables"]["catch_invites"]["Row"] }
        Returns: Json
      }
      read_gameplay_event_queue: {
        Args: { p_batch_size?: number; p_visibility_timeout_seconds?: number }
        Returns: {
          enqueued_at: string
          message: Json
          msg_id: number
          read_ct: number
          vt: string
        }[]
      }
      record_backend_worker_heartbeat: {
        Args: {
          p_display_name: string
          p_last_idle_at: string
          p_last_idle_counts?: Json
          p_last_idle_duration_ms: number
          p_metadata?: Json
          p_source: string
          p_worker_name: string
        }
        Returns: {
          created_at: string
          display_name: string
          idle_count_24h: number
          last_idle_at: string | null
          last_idle_counts: Json
          last_idle_duration_ms: number | null
          last_seen_at: string
          metadata: Json
          source: string
          updated_at: string
          worker_name: string
        }
        SetofOptions: {
          from: "*"
          to: "backend_worker_heartbeats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refresh_analytics_views: { Args: never; Returns: undefined }
      register_push_token: {
        Args: { p_expo_push_token: string; p_user_id: string }
        Returns: undefined
      }
      remove_fursuit_from_convention: {
        Args: { p_convention_id: string; p_fursuit_id: string }
        Returns: undefined
      }
      replace_fursuit_makers: {
        Args: { fursuit_id: string; makers?: Json }
        Returns: undefined
      }
      replace_fursuit_qr_code: {
        Args: { p_tag_id: string }
        Returns: {
          created_at: string
          fursuit_id: string
          label: string
          old_tag_id: string
          qr_asset_path: string
          qr_token: string
          qr_url: string
          status: string
          tag_id: string
        }[]
      }
      replace_fursuit_qr_code_without_feature_gate: {
        Args: { p_tag_id: string }
        Returns: {
          created_at: string
          fursuit_id: string
          label: string
          old_tag_id: string
          qr_asset_path: string
          qr_token: string
          qr_url: string
          status: string
          tag_id: string
        }[]
      }
      replace_fursuit_species_assignments: {
        Args: { p_fursuit_id: string; p_species_ids: string[] }
        Returns: undefined
      }
      replay_gameplay_dead_letter_events: {
        Args: { p_actor_id: string; p_event_ids: string[]; p_reason: string }
        Returns: {
          event_id: string
          message: string
          queue_message_id: number | null
          replayed: boolean
          status: string
        }[]
      }
      report_catch_invite: {
        Args: {
          p_claimant_profile_id: string
          p_invite_id: string
          p_reason?: string
        }
        Returns: Json
      }
      require_printable_fursuit_qr_feature: { Args: never; Returns: undefined }
      resolve_fursuit_qr_preview: {
        Args: { p_qr_token: string }
        Returns: {
          fursuit_avatar_path: string
          fursuit_avatar_url: string
          fursuit_id: string
          fursuit_name: string
          result: string
          species_name: string
          valid: boolean
        }[]
      }
      run_player_leveling_backfill: {
        Args: never
        Returns: {
          awarded_count: number
          awarded_xp: number
          candidate_count: number
          reason: string
          skipped_count: number
        }[]
      }
      search_players: {
        Args: {
          convention_filter?: string
          is_suspended_filter?: boolean
          limit_count?: number
          offset_count?: number
          role_filter?: Database["public"]["Enums"]["user_role"]
          search_term?: string
        }
        Returns: {
          avatar_url: string
          catch_count: number
          created_at: string
          email: string
          fursuit_count: number
          id: string
          is_suspended: boolean
          report_count: number
          role: Database["public"]["Enums"]["user_role"]
          suspended_until: string
          username: string
        }[]
      }
      set_own_age_attestation: {
        Args: { p_age_gate_version?: number; p_is_adult: boolean }
        Returns: undefined
      }
      silent_repair_historical_convention: {
        Args: { p_actor_id: string; p_convention_id: string; p_reason: string }
        Returns: {
          convention_id: string
          counts: Json
          final_status: string
          previous_status: string
          repaired: boolean
        }[]
      }
      submit_user_report: {
        Args: {
          p_convention_id?: string
          p_description?: string
          p_report_type?: string
          p_reported_fursuit_id?: string
          p_reported_user_id?: string
          p_severity?: string
        }
        Returns: string
      }
      text_array_has_no_duplicates: {
        Args: { input_values: string[] }
        Returns: boolean
      }
      transition_ended_conventions_to_finalizing: {
        Args: { p_now?: string }
        Returns: {
          closeout_not_before: string
          convention_id: string
          finalizing_started_at: string
        }[]
      }
      transition_started_conventions_to_live: {
        Args: { p_now?: string }
        Returns: {
          convention_id: string
          started_at: string
        }[]
      }
      update_fursuit_profile: {
        Args: {
          p_avatar_changed: boolean
          p_avatar_path: string
          p_avatar_url: string
          p_fursuit_id: string
          p_interaction_badges: string[]
          p_name: string
          p_owner_attribution_visibility: string
          p_social_signal: string
          p_species_id: string
          p_unique_code: string
          p_visibility_audience: string
        }
        Returns: Json
      }
      user_owns_fursuit: {
        Args: { p_fursuit_id: string; p_profile_id: string }
        Returns: boolean
      }
      validate_catch_reciprocal_offer: {
        Args: {
          p_offered_by_profile_id: string
          p_offered_fursuit_id: string
          p_primary_catch_id: string
        }
        Returns: {
          convention_id: string
          offered_fursuit_avatar_path: string
          offered_fursuit_avatar_url: string
          offered_fursuit_name: string
          recipient_profile_id: string
        }[]
      }
      verify_and_opt_in_to_convention: {
        Args: {
          p_convention_id: string
          p_profile_id: string
          p_verified_location: Json
        }
        Returns: Json
      }
      verify_convention_location: {
        Args: {
          p_accuracy: number
          p_convention_id: string
          p_profile_id: string
          p_user_lat: number
          p_user_lng: number
        }
        Returns: Json
      }
    }
    Enums: {
      achievement_category:
        | "catching"
        | "variety"
        | "dedication"
        | "fursuiter"
        | "fun"
        | "meta"
      achievement_recipient_role: "catcher" | "fursuit_owner" | "any"
      achievement_trigger_event:
        | "catch.created"
        | "profile.updated"
        | "convention.checkin"
        | "leaderboard.refreshed"
        | "catch_performed"
        | "convention_joined"
      catch_mode: "AUTO_ACCEPT" | "MANUAL_APPROVAL"
      catch_status: "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED"
      user_role: "player" | "staff" | "moderator" | "organizer" | "owner"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]
export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never
export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never
export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never
export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never
export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
export const Constants = {
  public: {
    Enums: {
      achievement_category: [
        "catching",
        "variety",
        "dedication",
        "fursuiter",
        "fun",
        "meta",
      ],
      achievement_recipient_role: ["catcher", "fursuit_owner", "any"],
      achievement_trigger_event: [
        "catch.created",
        "profile.updated",
        "convention.checkin",
        "leaderboard.refreshed",
        "catch_performed",
        "convention_joined",
      ],
      catch_mode: ["AUTO_ACCEPT", "MANUAL_APPROVAL"],
      catch_status: ["PENDING", "ACCEPTED", "REJECTED", "EXPIRED"],
      user_role: ["player", "staff", "moderator", "organizer", "owner"],
    },
  },
} as const

// Type aliases for application use
export type FursuitSocialLink = {
  label: string;
  url: string;
};

export type FursuitsRow = Database['public']['Tables']['fursuits']['Row'];
export type FursuitsInsert = Database['public']['Tables']['fursuits']['Insert'];
export type FursuitBiosInsert = Database['public']['Tables']['fursuit_bios']['Insert'];
export type FursuitMakersInsert = Database['public']['Tables']['fursuit_makers']['Insert'];
export type ConventionStatus = Database['public']['Tables']['conventions']['Row']['status'];
export type ConventionParticipantRecapRow =
  Database['public']['Tables']['convention_participant_recaps']['Row'];
export type AchievementCategory = Database['public']['Enums']['achievement_category'];
export type AchievementRecipientRole = Database['public']['Enums']['achievement_recipient_role'];
export type AchievementTriggerEvent = Database['public']['Enums']['achievement_trigger_event'];
export type AchievementsRow = Database['public']['Tables']['achievements']['Row'];
export type UserAchievementsRow = Database['public']['Tables']['user_achievements']['Row'];
export type AchievementEventsRow = Database['public']['Tables']['user_achievements']['Row'];
export type DailyTaskKind = string;
export type DailyAssignmentsRow = Database['public']['Tables']['daily_assignments']['Row'];
export type DailyTasksRow = Database['public']['Tables']['daily_tasks']['Row'];
export type UserDailyProgressRow = Database['public']['Tables']['user_daily_progress']['Row'];
export type UserDailyStreaksRow = Database['public']['Tables']['user_daily_streaks']['Row'];
