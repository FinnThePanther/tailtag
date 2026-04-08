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
      catches: {
        Row: {
          catch_number: number | null
          catch_photo_url: string | null
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
          catch_photo_url?: string | null
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
          catch_photo_url?: string | null
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
      fursuit_bios: {
        Row: {
          ask_me_about: string
          created_at: string
          fursuit_id: string
          id: string
          likes_and_interests: string
          owner_name: string
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
          social_links: Json | null
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
          social_links?: Json | null
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
          social_links?: Json | null
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
      archive_gameplay_event_queue_message: {
        Args: { p_message_id: number }
        Returns: boolean
      }
      archive_old_events: { Args: never; Returns: undefined }
      calculate_catch_expiration:
        | { Args: never; Returns: string }
        | { Args: { convention_id_param: string }; Returns: string }
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
      create_catch_with_approval:
        | {
            Args: {
              p_catcher_id: string
              p_convention_id?: string
              p_fursuit_id: string
              p_is_tutorial?: boolean
            }
            Returns: Json
          }
        | {
            Args: {
              p_catcher_id: string
              p_convention_id?: string
              p_force_pending?: boolean
              p_fursuit_id: string
              p_is_tutorial?: boolean
            }
            Returns: Json
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
      execute_data_retention_cleanup: { Args: never; Returns: Json }
      expire_bans: { Args: never; Returns: Json }
      expire_moderation_actions: { Args: never; Returns: undefined }
      expire_pending_catches: { Args: never; Returns: Json }
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
      get_convention_leaderboard: {
        Args: { p_convention_id?: string }
        Returns: {
          catch_count: number
          catcher_id: string
          convention_id: string
          first_catch_at: string
          last_catch_at: string
          unique_fursuits: number
          unique_species: number
          username: string
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
          time_remaining: string
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
      has_visible_gameplay_event_queue_messages: {
        Args: never
        Returns: boolean
      }
      hash_ip_address: { Args: { ip_addr: unknown }; Returns: string }
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
      is_admin: { Args: { user_id: string }; Returns: boolean }
      is_admin_user: { Args: { check_user_id: string }; Returns: boolean }
      is_blocked: {
        Args: { p_user_a: string; p_user_b: string }
        Returns: boolean
      }
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
      process_achievement_queue_if_active: { Args: never; Returns: undefined }
      process_gameplay_queue_if_active: { Args: never; Returns: undefined }
      purge_geo_verification_data: { Args: never; Returns: Json }
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
      refresh_analytics_views: { Args: never; Returns: undefined }
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
