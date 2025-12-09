export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string | null
          bio: string | null
          avatar_url: string | null
          created_at: string | null
          updated_at: string | null
          onboarding_completed: boolean
          is_new: boolean
          default_catch_mode: string
          role: Database["public"]["Enums"]["user_role"]
          is_suspended: boolean
          suspended_until: string | null
          suspension_reason: string | null
        }
        Insert: {
          id: string
          username?: string | null
          bio?: string | null
          avatar_url?: string | null
          created_at?: string | null
          updated_at?: string | null
          onboarding_completed?: boolean
          is_new?: boolean
          default_catch_mode?: string
          role?: Database["public"]["Enums"]["user_role"]
          is_suspended?: boolean
          suspended_until?: string | null
          suspension_reason?: string | null
        }
        Update: {
          id?: string
          username?: string | null
          bio?: string | null
          avatar_url?: string | null
          created_at?: string | null
          updated_at?: string | null
          onboarding_completed?: boolean
          is_new?: boolean
          default_catch_mode?: string
          role?: Database["public"]["Enums"]["user_role"]
          is_suspended?: boolean
          suspended_until?: string | null
          suspension_reason?: string | null
        }
        Relationships: []
      }
      conventions: {
        Row: {
          id: string
          name: string
          slug: string
          location: string | null
          start_date: string | null
          end_date: string | null
          created_at: string
          updated_at: string
          timezone: string
          config: Json
        }
        Insert: {
          id?: string
          name: string
          slug: string
          location?: string | null
          start_date?: string | null
          end_date?: string | null
          created_at?: string
          updated_at?: string
          timezone?: string
          config?: Json
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          location?: string | null
          start_date?: string | null
          end_date?: string | null
          created_at?: string
          updated_at?: string
          timezone?: string
          config?: Json
        }
        Relationships: []
      }
      achievements: {
        Row: {
          id: string
          key: string
          name: string
          description: string
          category: Database["public"]["Enums"]["achievement_category"]
          recipient_role: Database["public"]["Enums"]["achievement_recipient_role"]
          trigger_event: Database["public"]["Enums"]["achievement_trigger_event"]
          is_active: boolean
          created_at: string
          updated_at: string
          rule_id: string | null
          reset_mode: string
          reset_timezone: string
          reset_grace_minutes: number
        }
        Insert: {
          id?: string
          key: string
          name: string
          description: string
          category: Database["public"]["Enums"]["achievement_category"]
          recipient_role: Database["public"]["Enums"]["achievement_recipient_role"]
          trigger_event: Database["public"]["Enums"]["achievement_trigger_event"]
          is_active?: boolean
          created_at?: string
          updated_at?: string
          rule_id?: string | null
          reset_mode?: string
          reset_timezone?: string
          reset_grace_minutes?: number
        }
        Update: {
          id?: string
          key?: string
          name?: string
          description?: string
          category?: Database["public"]["Enums"]["achievement_category"]
          recipient_role?: Database["public"]["Enums"]["achievement_recipient_role"]
          trigger_event?: Database["public"]["Enums"]["achievement_trigger_event"]
          is_active?: boolean
          created_at?: string
          updated_at?: string
          rule_id?: string | null
          reset_mode?: string
          reset_timezone?: string
          reset_grace_minutes?: number
        }
        Relationships: []
      }
      event_staff: {
        Row: {
          id: string
          profile_id: string
          convention_id: string
          role: Database["public"]["Enums"]["user_role"]
          status: string
          assigned_at: string
          assigned_by_user_id: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          convention_id: string
          role: Database["public"]["Enums"]["user_role"]
          status?: string
          assigned_at?: string
          assigned_by_user_id?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          convention_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: string
          assigned_at?: string
          assigned_by_user_id?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          actor_id: string
          action: string
          entity_type: string
          entity_id: string | null
          diff: Json | null
          context: Json | null
          ip_address: unknown
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_id: string
          action: string
          entity_type: string
          entity_id?: string | null
          diff?: Json | null
          context?: Json | null
          ip_address?: unknown
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          actor_id?: string
          action?: string
          entity_type?: string
          entity_id?: string | null
          diff?: Json | null
          context?: Json | null
          ip_address?: unknown
          user_agent?: string | null
          created_at?: string
        }
        Relationships: []
      }
      admin_error_log: {
        Row: {
          id: string
          convention_id: string | null
          error_type: string
          error_message: string
          context: Json | null
          severity: string
          occurred_at: string
          created_at: string
        }
        Insert: {
          id?: string
          convention_id?: string | null
          error_type: string
          error_message: string
          context?: Json | null
          severity: string
          occurred_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          convention_id?: string | null
          error_type?: string
          error_message?: string
          context?: Json | null
          severity?: string
          occurred_at?: string
          created_at?: string
        }
        Relationships: []
      }
      tag_activity: {
        Row: {
          id: string
          tag_uid: string
          seen_at: string
          convention_id: string | null
          catcher_id: string | null
          device_id: string | null
          location: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          tag_uid: string
          seen_at?: string
          convention_id?: string | null
          catcher_id?: string | null
          device_id?: string | null
          location?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          tag_uid?: string
          seen_at?: string
          convention_id?: string | null
          catcher_id?: string | null
          device_id?: string | null
          location?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      user_moderation_actions: {
        Row: {
          id: string
          user_id: string
          action_type: string
          scope: string
          convention_id: string | null
          reason: string
          internal_notes: string | null
          duration_hours: number | null
          expires_at: string | null
          is_active: boolean
          applied_by_user_id: string
          revoked_by_user_id: string | null
          revoked_at: string | null
          revoke_reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          action_type: string
          scope?: string
          convention_id?: string | null
          reason: string
          internal_notes?: string | null
          duration_hours?: number | null
          expires_at?: string | null
          is_active?: boolean
          applied_by_user_id: string
          revoked_by_user_id?: string | null
          revoked_at?: string | null
          revoke_reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          action_type?: string
          scope?: string
          convention_id?: string | null
          reason?: string
          internal_notes?: string | null
          duration_hours?: number | null
          expires_at?: string | null
          is_active?: boolean
          applied_by_user_id?: string
          revoked_by_user_id?: string | null
          revoked_at?: string | null
          revoke_reason?: string | null
          created_at?: string
        }
        Relationships: []
      }
      user_reports: {
        Row: {
          id: string
          reporter_id: string
          reported_user_id: string | null
          reported_fursuit_id: string | null
          report_type: string
          severity: string
          description: string
          status: string
          convention_id: string | null
          resolved_by_user_id: string | null
          resolved_at: string | null
          resolution_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          reporter_id: string
          reported_user_id?: string | null
          reported_fursuit_id?: string | null
          report_type: string
          severity?: string
          description: string
          status?: string
          convention_id?: string | null
          resolved_by_user_id?: string | null
          resolved_at?: string | null
          resolution_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          reporter_id?: string
          reported_user_id?: string | null
          reported_fursuit_id?: string | null
          report_type?: string
          severity?: string
          description?: string
          status?: string
          convention_id?: string | null
          resolved_by_user_id?: string | null
          resolved_at?: string | null
          resolution_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      fursuit_moderation_queue: {
        Row: {
          id: string
          fursuit_id: string
          flag_reason: string
          status: string
          flagged_content: Json
          moderator_notes: string | null
          action_taken: string | null
          flagged_by_user_id: string | null
          reviewed_by_user_id: string | null
          reviewed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          fursuit_id: string
          flag_reason: string
          status?: string
          flagged_content: Json
          moderator_notes?: string | null
          action_taken?: string | null
          flagged_by_user_id?: string | null
          reviewed_by_user_id?: string | null
          reviewed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          fursuit_id?: string
          flag_reason?: string
          status?: string
          flagged_content?: Json
          moderator_notes?: string | null
          action_taken?: string | null
          flagged_by_user_id?: string | null
          reviewed_by_user_id?: string | null
          reviewed_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      nfc_tags: {
        Row: {
          uid: string
          fursuit_id: string | null
          registered_by_user_id: string
          status: string
          registered_at: string
          linked_at: string | null
          updated_at: string
        }
        Insert: {
          uid: string
          fursuit_id?: string | null
          registered_by_user_id: string
          status?: string
          registered_at?: string
          linked_at?: string | null
          updated_at?: string
        }
        Update: {
          uid?: string
          fursuit_id?: string | null
          registered_by_user_id?: string
          status?: string
          registered_at?: string
          linked_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fursuits: {
        Row: {
          id: string
          owner_id: string
          name: string
          avatar_url: string | null
          created_at: string | null
          species: string | null
          unique_code: string
          species_id: string | null
          description: string | null
          is_tutorial: boolean
          catch_count: number
          catch_mode: string
          is_flagged: boolean
          flagged_at: string | null
          flagged_reason: string | null
        }
        Insert: {
          id?: string
          owner_id: string
          name: string
          avatar_url?: string | null
          created_at?: string | null
          species?: string | null
          unique_code: string
          species_id?: string | null
          description?: string | null
          is_tutorial?: boolean
          catch_count?: number
          catch_mode?: string
          is_flagged?: boolean
          flagged_at?: string | null
          flagged_reason?: string | null
        }
        Update: {
          id?: string
          owner_id?: string
          name?: string
          avatar_url?: string | null
          created_at?: string | null
          species?: string | null
          unique_code?: string
          species_id?: string | null
          description?: string | null
          is_tutorial?: boolean
          catch_count?: number
          catch_mode?: string
          is_flagged?: boolean
          flagged_at?: string | null
          flagged_reason?: string | null
        }
        Relationships: []
      }
      catches: {
        Row: {
          id: string
          catcher_id: string
          fursuit_id: string
          caught_at: string | null
          is_tutorial: boolean
          catch_number: number | null
          convention_id: string | null
          status: string
          decided_at: string | null
          decided_by_user_id: string | null
          rejection_reason: string | null
          expires_at: string | null
        }
        Insert: {
          id?: string
          catcher_id: string
          fursuit_id: string
          caught_at?: string | null
          is_tutorial?: boolean
          catch_number?: number | null
          convention_id?: string | null
          status?: string
          decided_at?: string | null
          decided_by_user_id?: string | null
          rejection_reason?: string | null
          expires_at?: string | null
        }
        Update: {
          id?: string
          catcher_id?: string
          fursuit_id?: string
          caught_at?: string | null
          is_tutorial?: boolean
          catch_number?: number | null
          convention_id?: string | null
          status?: string
          decided_at?: string | null
          decided_by_user_id?: string | null
          rejection_reason?: string | null
          expires_at?: string | null
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          id: string
          user_id: string
          achievement_id: string
          unlocked_at: string
          context: Json
        }
        Insert: {
          id?: string
          user_id: string
          achievement_id: string
          unlocked_at?: string
          context?: Json
        }
        Update: {
          id?: string
          user_id?: string
          achievement_id?: string
          unlocked_at?: string
          context?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      user_role: "player" | "staff" | "moderator" | "organizer" | "owner"
      achievement_category: "catching" | "variety" | "dedication" | "fursuiter" | "fun" | "meta"
      achievement_recipient_role: "catcher" | "fursuit_owner" | "any"
      achievement_trigger_event: "catch.created" | "profile.updated" | "convention.checkin" | "leaderboard.refreshed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
