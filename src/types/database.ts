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
        ]
      }
      conventions: {
        Row: {
          config: Json
          created_at: string
          end_date: string | null
          id: string
          location: string | null
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
          id?: string
          location?: string | null
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
          id?: string
          location?: string | null
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
          species: string | null
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
          species?: string | null
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
          species?: string | null
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
      nfc_tags: {
        Row: {
          fursuit_id: string | null
          linked_at: string | null
          registered_at: string
          registered_by_user_id: string
          status: string
          uid: string
          updated_at: string
        }
        Insert: {
          fursuit_id?: string | null
          linked_at?: string | null
          registered_at?: string
          registered_by_user_id: string
          status?: string
          uid: string
          updated_at?: string
        }
        Update: {
          fursuit_id?: string | null
          linked_at?: string | null
          registered_at?: string
          registered_by_user_id?: string
          status?: string
          uid?: string
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
            foreignKeyName: "nfc_tags_registered_by_user_id_fkey"
            columns: ["registered_by_user_id"]
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
          profile_id: string
        }
        Insert: {
          convention_id: string
          created_at?: string
          profile_id: string
        }
        Update: {
          convention_id?: string
          created_at?: string
          profile_id?: string
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
          id: string
          is_new: boolean
          is_suspended: boolean
          onboarding_completed: boolean
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
          id: string
          is_new?: boolean
          is_suspended?: boolean
          onboarding_completed?: boolean
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
          id?: string
          is_new?: boolean
          is_suspended?: boolean
          onboarding_completed?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          suspended_until?: string | null
          suspension_reason?: string | null
          updated_at?: string | null
          username?: string | null
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
            referencedRelation: "nfc_tags"
            referencedColumns: ["uid"]
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
    }
    Views: {
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
      calculate_catch_expiration:
        | { Args: { convention_id_param: string }; Returns: string }
        | { Args: never; Returns: string }
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
      expire_moderation_actions: { Args: never; Returns: undefined }
      expire_pending_catches: { Args: never; Returns: Json }
      finish_onboarding: { Args: { target_user_id?: string }; Returns: Json }
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
      grant_achievements_batch: { Args: { awards: Json }; Returns: Json }
      is_admin: { Args: { user_id: string }; Returns: boolean }
      is_event_staff: {
        Args: { convention_id: string; user_id: string }
        Returns: boolean
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
      ],
      catch_mode: ["AUTO_ACCEPT", "MANUAL_APPROVAL"],
      catch_status: ["PENDING", "ACCEPTED", "REJECTED", "EXPIRED"],
      user_role: ["player", "staff", "moderator", "organizer", "owner"],
    },
  },
} as const

// Convenience type exports
export type AchievementsRow = Database['public']['Tables']['achievements']['Row']
export type AchievementEventsRow = Database['public']['Tables']['achievements']['Row']
export type UserAchievementsRow = Database['public']['Tables']['user_achievements']['Row']
export type AchievementCategory = Database['public']['Enums']['achievement_category']
export type AchievementRecipientRole = Database['public']['Enums']['achievement_recipient_role']
export type AchievementTriggerEvent = Database['public']['Enums']['achievement_trigger_event']

export type DailyTasksRow = Database['public']['Tables']['daily_tasks']['Row']
export type DailyAssignmentsRow = Database['public']['Tables']['daily_assignments']['Row']
export type UserDailyProgressRow = Database['public']['Tables']['user_daily_progress']['Row']
export type UserDailyStreaksRow = Database['public']['Tables']['user_daily_streaks']['Row']
export type DailyTaskKind = string

export type FursuitsRow = Database['public']['Tables']['fursuits']['Row']
export type FursuitsInsert = Database['public']['Tables']['fursuits']['Insert']
export type FursuitBiosInsert = Database['public']['Tables']['fursuit_bios']['Insert']
export type FursuitSocialLink = {
  label: string
  url: string
}

export type CatchMode = Database['public']['Enums']['catch_mode']
export type CatchStatus = Database['public']['Enums']['catch_status']
