export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

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
      auth_security_checklist: {
        Row: {
          category: string
          configuration_method: string
          configured_at: string | null
          configured_by: string | null
          description: string
          is_configured: boolean
          notes: string | null
          priority: string
          remediation_url: string | null
          setting_name: string
        }
        Insert: {
          category: string
          configuration_method: string
          configured_at?: string | null
          configured_by?: string | null
          description: string
          is_configured?: boolean
          notes?: string | null
          priority: string
          remediation_url?: string | null
          setting_name: string
        }
        Update: {
          category?: string
          configuration_method?: string
          configured_at?: string | null
          configured_by?: string | null
          description?: string
          is_configured?: boolean
          notes?: string | null
          priority?: string
          remediation_url?: string | null
          setting_name?: string
        }
        Relationships: []
      }
      catches: {
        Row: {
          catch_number: number | null
          catcher_id: string
          caught_at: string | null
          convention_id: string | null
          decided_at: string | null
          decided_by_user_id: string | null
          expires_at: string | null
          fursuit_id: string
          id: string
          is_tutorial: boolean
          rejection_reason: string | null
          status: string
        }
        Insert: {
          catch_number?: number | null
          catcher_id: string
          caught_at?: string | null
          convention_id?: string | null
          decided_at?: string | null
          decided_by_user_id?: string | null
          expires_at?: string | null
          fursuit_id: string
          id?: string
          is_tutorial?: boolean
          rejection_reason?: string | null
          status?: string
        }
        Update: {
          catch_number?: number | null
          catcher_id?: string
          caught_at?: string | null
          convention_id?: string | null
          decided_at?: string | null
          decided_by_user_id?: string | null
          expires_at?: string | null
          fursuit_id?: string
          id?: string
          is_tutorial?: boolean
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
      conventions: {
        Row: {
          config: Json
          created_at: string
          end_date: string | null
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
          timezone: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          end_date?: string | null
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
          timezone?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          end_date?: string | null
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
      events: {
        Row: {
          convention_id: string | null
          event_id: string
          occurred_at: string
          payload: Json
          received_at: string
          type: string
          user_id: string
        }
        Insert: {
          convention_id?: string | null
          event_id?: string
          occurred_at?: string
          payload?: Json
          received_at?: string
          type: string
          user_id: string
        }
        Update: {
          convention_id?: string | null
          event_id?: string
          occurred_at?: string
          payload?: Json
          received_at?: string
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
      extension_migration_status: {
        Row: {
          blocking_reason: string | null
          completed_migration_date: string | null
          dependencies: string[] | null
          extension_name: string
          migration_status: string
          notes: string | null
          planned_migration_date: string | null
          source_schema: string
          target_schema: string
        }
        Insert: {
          blocking_reason?: string | null
          completed_migration_date?: string | null
          dependencies?: string[] | null
          extension_name: string
          migration_status: string
          notes?: string | null
          planned_migration_date?: string | null
          source_schema: string
          target_schema: string
        }
        Update: {
          blocking_reason?: string | null
          completed_migration_date?: string | null
          dependencies?: string[] | null
          extension_name?: string
          migration_status?: string
          notes?: string | null
          planned_migration_date?: string | null
          source_schema?: string
          target_schema?: string
        }
        Relationships: []
      }
      fursuit_bios: {
        Row: {
          ask_me_about: string
          created_at: string
          fun_fact: string
          fursuit_id: string
          id: string
          likes_and_interests: string
          owner_name: string
          pronouns: string
          social_links: Json
          tagline: string
          updated_at: string
          version: number
        }
        Insert: {
          ask_me_about: string
          created_at?: string
          fun_fact: string
          fursuit_id: string
          id?: string
          likes_and_interests: string
          owner_name: string
          pronouns: string
          social_links?: Json
          tagline: string
          updated_at?: string
          version: number
        }
        Update: {
          ask_me_about?: string
          created_at?: string
          fun_fact?: string
          fursuit_id?: string
          id?: string
          likes_and_interests?: string
          owner_name?: string
          pronouns?: string
          social_links?: Json
          tagline?: string
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
          convention_id: string
          created_at: string
          fursuit_id: string
        }
        Insert: {
          convention_id: string
          created_at?: string
          fursuit_id: string
        }
        Update: {
          convention_id?: string
          created_at?: string
          fursuit_id?: string
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
      fursuit_moderation_queue: {
        Row: {
          action_taken: string | null
          created_at: string
          flag_reason: string
          flagged_by_user_id: string | null
          flagged_content: Json
          fursuit_id: string
          id: string
          moderator_notes: string | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          status: string
        }
        Insert: {
          action_taken?: string | null
          created_at?: string
          flag_reason: string
          flagged_by_user_id?: string | null
          flagged_content: Json
          fursuit_id: string
          id?: string
          moderator_notes?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          status?: string
        }
        Update: {
          action_taken?: string | null
          created_at?: string
          flag_reason?: string
          flagged_by_user_id?: string | null
          flagged_content?: Json
          fursuit_id?: string
          id?: string
          moderator_notes?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fursuit_moderation_queue_flagged_by_user_id_fkey"
            columns: ["flagged_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fursuit_moderation_queue_fursuit_id_fkey"
            columns: ["fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fursuit_moderation_queue_fursuit_id_fkey"
            columns: ["fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fursuit_moderation_queue_reviewed_by_user_id_fkey"
            columns: ["reviewed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      fursuits: {
        Row: {
          avatar_url: string | null
          catch_count: number
          catch_mode: string
          created_at: string | null
          description: string | null
          flagged_at: string | null
          flagged_reason: string | null
          id: string
          is_flagged: boolean
          is_tutorial: boolean
          name: string
          owner_id: string
          species_id: string | null
          unique_code: string
        }
        Insert: {
          avatar_url?: string | null
          catch_count?: number
          catch_mode?: string
          created_at?: string | null
          description?: string | null
          flagged_at?: string | null
          flagged_reason?: string | null
          id?: string
          is_flagged?: boolean
          is_tutorial?: boolean
          name: string
          owner_id: string
          species_id?: string | null
          unique_code: string
        }
        Update: {
          avatar_url?: string | null
          catch_count?: number
          catch_mode?: string
          created_at?: string | null
          description?: string | null
          flagged_at?: string | null
          flagged_reason?: string | null
          id?: string
          is_flagged?: boolean
          is_tutorial?: boolean
          name?: string
          owner_id?: string
          species_id?: string | null
          unique_code?: string
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
      materialized_view_config: {
        Row: {
          access_justification: string | null
          approximate_size: string | null
          description: string
          is_public_api_accessible: boolean
          last_refreshed_at: string | null
          next_refresh_at: string | null
          notes: string | null
          refresh_function_name: string | null
          refresh_strategy: string
          view_name: string
        }
        Insert: {
          access_justification?: string | null
          approximate_size?: string | null
          description: string
          is_public_api_accessible?: boolean
          last_refreshed_at?: string | null
          next_refresh_at?: string | null
          notes?: string | null
          refresh_function_name?: string | null
          refresh_strategy: string
          view_name: string
        }
        Update: {
          access_justification?: string | null
          approximate_size?: string | null
          description?: string
          is_public_api_accessible?: boolean
          last_refreshed_at?: string | null
          next_refresh_at?: string | null
          notes?: string | null
          refresh_function_name?: string | null
          refresh_strategy?: string
          view_name?: string
        }
        Relationships: []
      }
      moderation_notes: {
        Row: {
          author_id: string
          created_at: string
          id: string
          is_flagged: boolean
          note: string
          user_id: string
        }
        Insert: {
          author_id: string
          created_at?: string
          id?: string
          is_flagged?: boolean
          note: string
          user_id: string
        }
        Update: {
          author_id?: string
          created_at?: string
          id?: string
          is_flagged?: boolean
          note?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_notes_user_id_fkey"
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
          id: string
          payload: Json
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_conventions: {
        Row: {
          convention_id: string
          created_at: string
          override_actor_id: string | null
          override_at: string | null
          override_reason: string | null
          profile_id: string
          verification_method: string | null
          verified_at: string | null
          verified_location: Json | null
        }
        Insert: {
          convention_id: string
          created_at?: string
          override_actor_id?: string | null
          override_at?: string | null
          override_reason?: string | null
          profile_id: string
          verification_method?: string | null
          verified_at?: string | null
          verified_location?: Json | null
        }
        Update: {
          convention_id?: string
          created_at?: string
          override_actor_id?: string | null
          override_at?: string | null
          override_reason?: string | null
          profile_id?: string
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
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          default_catch_mode: string
          expo_push_token: string | null
          id: string
          is_new: boolean
          is_suspended: boolean
          location_permission_granted_at: string | null
          location_permission_requested_at: string | null
          location_permission_status: string | null
          onboarding_completed: boolean
          push_notifications_enabled: boolean
          push_notifications_prompted: boolean | null
          role: Database["public"]["Enums"]["user_role"]
          suspended_until: string | null
          suspension_reason: string | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          default_catch_mode?: string
          expo_push_token?: string | null
          id: string
          is_new?: boolean
          is_suspended?: boolean
          location_permission_granted_at?: string | null
          location_permission_requested_at?: string | null
          location_permission_status?: string | null
          onboarding_completed?: boolean
          push_notifications_enabled?: boolean
          push_notifications_prompted?: boolean | null
          role?: Database["public"]["Enums"]["user_role"]
          suspended_until?: string | null
          suspension_reason?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          default_catch_mode?: string
          expo_push_token?: string | null
          id?: string
          is_new?: boolean
          is_suspended?: boolean
          location_permission_granted_at?: string | null
          location_permission_requested_at?: string | null
          location_permission_status?: string | null
          onboarding_completed?: boolean
          push_notifications_enabled?: boolean
          push_notifications_prompted?: boolean | null
          role?: Database["public"]["Enums"]["user_role"]
          suspended_until?: string | null
          suspension_reason?: string | null
          updated_at?: string | null
          username?: string | null
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
      qr_asset_cleanup_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      qr_asset_cleanup_queue: {
        Row: {
          attempts: number
          bucket: string
          created_at: string
          id: string
          last_error: string | null
          processed_at: string | null
          qr_asset_path: string
          tag_id: string
        }
        Insert: {
          attempts?: number
          bucket?: string
          created_at?: string
          id?: string
          last_error?: string | null
          processed_at?: string | null
          qr_asset_path: string
          tag_id: string
        }
        Update: {
          attempts?: number
          bucket?: string
          created_at?: string
          id?: string
          last_error?: string | null
          processed_at?: string | null
          qr_asset_path?: string
          tag_id?: string
        }
        Relationships: []
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      tag_activity: {
        Row: {
          catcher_id: string | null
          convention_id: string | null
          created_at: string
          device_id: string | null
          id: string
          location: Json | null
          seen_at: string
          tag_uid: string
        }
        Insert: {
          catcher_id?: string | null
          convention_id?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          location?: Json | null
          seen_at?: string
          tag_uid: string
        }
        Update: {
          catcher_id?: string | null
          convention_id?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          location?: Json | null
          seen_at?: string
          tag_uid?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_activity_catcher_id_fkey"
            columns: ["catcher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_activity_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_activity_tag_uid_fkey"
            columns: ["tag_uid"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["nfc_uid"]
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
          fursuit_id: string | null
          id: string
          linked_at: string | null
          nfc_uid: string | null
          qr_asset_path: string | null
          qr_token: string | null
          qr_token_created_at: string | null
          registered_at: string
          registered_by_user_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          fursuit_id?: string | null
          id?: string
          linked_at?: string | null
          nfc_uid?: string | null
          qr_asset_path?: string | null
          qr_token?: string | null
          qr_token_created_at?: string | null
          registered_at?: string
          registered_by_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          fursuit_id?: string | null
          id?: string
          linked_at?: string | null
          nfc_uid?: string | null
          qr_asset_path?: string | null
          qr_token?: string | null
          qr_token_created_at?: string | null
          registered_at?: string
          registered_by_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nfc_tags_fursuit_id_fkey"
            columns: ["fursuit_id"]
            isOneToOne: false
            referencedRelation: "fursuits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfc_tags_fursuit_id_fkey"
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
          reporter_id: string
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
          reporter_id: string
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
          reporter_id?: string
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
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
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
      mv_convention_leaderboard: {
        Row: {
          avatar_url: string | null
          catch_count: number | null
          catcher_id: string | null
          convention_id: string | null
          first_catch_at: string | null
          last_catch_at: string | null
          unique_fursuits: number | null
          unique_species: number | null
          username: string | null
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
        ]
      }
      mv_fursuit_popularity: {
        Row: {
          catch_count: number | null
          convention_id: string | null
          first_caught_at: string | null
          fursuit_avatar_url: string | null
          fursuit_id: string | null
          fursuit_name: string | null
          last_caught_at: string | null
          owner_id: string | null
          unique_catchers: number | null
        }
        Relationships: [
          {
            foreignKeyName: "catches_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions"
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
          {
            foreignKeyName: "fursuits_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      archive_old_events: { Args: never; Returns: undefined }
      calculate_catch_expiration:
        | { Args: never; Returns: string }
        | { Args: { convention_id_param: string }; Returns: string }
      cleanup_old_audit_logs: { Args: never; Returns: undefined }
      cleanup_old_notifications: { Args: never; Returns: undefined }
      confirm_catch: {
        Args: {
          p_catch_id: string
          p_decision: string
          p_reason?: string
          p_user_id: string
        }
        Returns: Json
      }
      count_distinct_conventions: { Args: { user_id: string }; Returns: number }
      count_distinct_species_caught: {
        Args: { user_id: string }
        Returns: number
      }
      count_user_fursuits: { Args: { p_user_id: string }; Returns: number }
      create_catch_with_approval: {
        Args: {
          p_catcher_id: string
          p_convention_id?: string
          p_fursuit_id: string
          p_is_tutorial?: boolean
        }
        Returns: Json
      }
      detect_duplicate_tag_users: {
        Args: { p_hours_ago?: number; p_tag_uid: string }
        Returns: {
          catcher_id: string
          last_seen: string
          scan_count: number
        }[]
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      execute_data_retention_cleanup: { Args: never; Returns: Json }
      expire_moderation_actions: { Args: never; Returns: undefined }
      expire_pending_catches: { Args: never; Returns: Json }
      finish_onboarding: { Args: { target_user_id?: string }; Returns: Json }
      generate_profile_avatar_url: {
        Args: { app_meta: Json; user_meta: Json }
        Returns: string
      }
      generate_profile_username: {
        Args: { app_meta: Json; user_email: string; user_meta: Json }
        Returns: string
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
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
      get_fursuit_convention_stats: {
        Args: { p_convention_id: string; p_fursuit_id: string }
        Returns: {
          total_catches: number
          unique_catchers: number
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
      get_pending_catch_count: { Args: { p_user_id: string }; Returns: number }
      get_pending_catches: {
        Args: { p_user_id: string }
        Returns: {
          catch_id: string
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
          time_remaining: unknown
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
      gettransactionid: { Args: never; Returns: unknown }
      grant_achievements_batch: { Args: { awards: Json }; Returns: Json }
      hash_ip_address: { Args: { ip_addr: unknown }; Returns: string }
      is_admin: { Args: { user_id: string }; Returns: boolean }
      is_admin_user: { Args: { check_user_id: string }; Returns: boolean }
      is_event_staff: {
        Args: { convention_id: string; user_id: string }
        Returns: boolean
      }
      is_moderator_or_higher: {
        Args: { check_user_id: string }
        Returns: boolean
      }
      is_valid_event_type: { Args: { p_event_type: string }; Returns: boolean }
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
      longtransactionsenabled: { Args: never; Returns: boolean }
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
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      process_qr_asset_cleanup: {
        Args: { batch_size?: number }
        Returns: {
          attempts: number
          bucket: string
          created_at: string
          id: string
          last_error: string | null
          processed_at: string | null
          qr_asset_path: string
          tag_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "qr_asset_cleanup_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      purge_geo_verification_data: { Args: never; Returns: Json }
      refresh_analytics_views: { Args: never; Returns: undefined }
      refresh_convention_leaderboard: {
        Args: { convention_uuid?: string }
        Returns: undefined
      }
      refresh_fursuit_popularity: {
        Args: { convention_uuid?: string }
        Returns: undefined
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
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
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
      catch_mode: "AUTO_ACCEPT" | "MANUAL_APPROVAL"
      catch_status: "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED"
      user_role: "player" | "staff" | "moderator" | "organizer" | "owner"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
      ],
      catch_mode: ["AUTO_ACCEPT", "MANUAL_APPROVAL"],
      catch_status: ["PENDING", "ACCEPTED", "REJECTED", "EXPIRED"],
      user_role: ["player", "staff", "moderator", "organizer", "owner"],
    },
  },
} as const

// Type aliases for application use
export type FursuitSocialLink = {
  label: string
  url: string
}

export type FursuitsRow = Database['public']['Tables']['fursuits']['Row']
export type FursuitsInsert = Database['public']['Tables']['fursuits']['Insert']
export type FursuitBiosInsert = Database['public']['Tables']['fursuit_bios']['Insert']
export type AchievementCategory = Database['public']['Enums']['achievement_category']
export type AchievementRecipientRole = Database['public']['Enums']['achievement_recipient_role']
export type AchievementTriggerEvent = Database['public']['Enums']['achievement_trigger_event']
export type AchievementsRow = Database['public']['Tables']['achievements']['Row']
export type UserAchievementsRow = Database['public']['Tables']['user_achievements']['Row']
export type AchievementEventsRow = Database['public']['Tables']['user_achievements']['Row']
export type DailyTaskKind = string
export type DailyAssignmentsRow = Database['public']['Tables']['daily_assignments']['Row']
export type DailyTasksRow = Database['public']['Tables']['daily_tasks']['Row']
export type UserDailyProgressRow = Database['public']['Tables']['user_daily_progress']['Row']
export type UserDailyStreaksRow = Database['public']['Tables']['user_daily_streaks']['Row']