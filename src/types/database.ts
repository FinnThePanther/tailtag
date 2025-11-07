export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13.0.5";
  };
  public: {
    Tables: {
      achievement_events: {
        Row: {
          created_at: string;
          event_type: Database["public"]["Enums"]["achievement_trigger_event"];
          id: string;
          payload: Json;
          processed_at: string | null;
        };
        Insert: {
          created_at?: string;
          event_type: Database["public"]["Enums"]["achievement_trigger_event"];
          id?: string;
          payload: Json;
          processed_at?: string | null;
        };
        Update: {
          created_at?: string;
          event_type?: Database["public"]["Enums"]["achievement_trigger_event"];
          id?: string;
          payload?: Json;
          processed_at?: string | null;
        };
        Relationships: [];
      };
      achievements: {
        Row: {
          category: Database["public"]["Enums"]["achievement_category"];
          created_at: string;
          description: string;
          id: string;
          is_active: boolean;
          key: string;
          name: string;
          recipient_role: Database["public"]["Enums"]["achievement_recipient_role"];
          trigger_event: Database["public"]["Enums"]["achievement_trigger_event"];
          updated_at: string;
        };
        Insert: {
          category: Database["public"]["Enums"]["achievement_category"];
          created_at?: string;
          description: string;
          id?: string;
          is_active?: boolean;
          key: string;
          name: string;
          recipient_role: Database["public"]["Enums"]["achievement_recipient_role"];
          trigger_event: Database["public"]["Enums"]["achievement_trigger_event"];
          updated_at?: string;
        };
        Update: {
          category?: Database["public"]["Enums"]["achievement_category"];
          created_at?: string;
          description?: string;
          id?: string;
          is_active?: boolean;
          key?: string;
          name?: string;
          recipient_role?: Database["public"]["Enums"]["achievement_recipient_role"];
          trigger_event?: Database["public"]["Enums"]["achievement_trigger_event"];
          updated_at?: string;
        };
        Relationships: [];
      };
      catches: {
        Row: {
          catcher_id: string;
          caught_at: string | null;
          catch_number: number | null;
          convention_id: string | null;
          fursuit_id: string;
          is_tutorial: boolean;
          id: string;
        };
        Insert: {
          catcher_id: string;
          caught_at?: string | null;
          catch_number?: number | null;
          convention_id?: string | null;
          fursuit_id: string;
          is_tutorial?: boolean;
          id?: string;
        };
        Update: {
          catcher_id?: string;
          caught_at?: string | null;
          catch_number?: number | null;
          convention_id?: string | null;
          fursuit_id?: string;
          is_tutorial?: boolean;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "catches_catcher_id_fkey";
            columns: ["catcher_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "catches_fursuit_id_fkey";
            columns: ["fursuit_id"];
            isOneToOne: false;
            referencedRelation: "fursuits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "catches_convention_id_fkey";
            columns: ["convention_id"];
            isOneToOne: false;
            referencedRelation: "conventions";
            referencedColumns: ["id"];
          },
        ];
      };
      conventions: {
        Row: {
          created_at: string;
          end_date: string | null;
          id: string;
          location: string | null;
          name: string;
          slug: string;
          start_date: string | null;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          location?: string | null;
          name: string;
          slug: string;
          start_date?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          location?: string | null;
          name?: string;
          slug?: string;
          start_date?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      daily_assignments: {
        Row: {
          convention_id: string;
          created_at: string;
          day: string;
          id: string;
          position: number;
          task_id: string;
          updated_at: string;
        };
        Insert: {
          convention_id: string;
          created_at?: string;
          day: string;
          id?: string;
          position: number;
          task_id: string;
          updated_at?: string;
        };
        Update: {
          convention_id?: string;
          created_at?: string;
          day?: string;
          id?: string;
          position?: number;
          task_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_assignments_convention_id_fkey";
            columns: ["convention_id"];
            isOneToOne: false;
            referencedRelation: "conventions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_assignments_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "daily_tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_tasks: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          is_active: boolean;
          kind: string;
          metadata: Json;
          name: string;
          requirement: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description: string;
          id?: string;
          is_active?: boolean;
          kind: string;
          metadata?: Json;
          name: string;
          requirement: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          is_active?: boolean;
          kind?: string;
          metadata?: Json;
          name?: string;
          requirement?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      fursuit_color_assignments: {
        Row: {
          color_id: string;
          created_at: string;
          fursuit_id: string;
          id: string;
          position: number;
        };
        Insert: {
          color_id: string;
          created_at?: string;
          fursuit_id: string;
          id?: string;
          position: number;
        };
        Update: {
          color_id?: string;
          created_at?: string;
          fursuit_id?: string;
          id?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "fursuit_color_assignments_color_id_fkey";
            columns: ["color_id"];
            isOneToOne: false;
            referencedRelation: "fursuit_colors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fursuit_color_assignments_fursuit_id_fkey";
            columns: ["fursuit_id"];
            isOneToOne: false;
            referencedRelation: "fursuits";
            referencedColumns: ["id"];
          },
        ];
      };
      fursuit_colors: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          normalized_name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          normalized_name?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          normalized_name?: string;
        };
        Relationships: [];
      };
      fursuit_bios: {
        Row: {
          ask_me_about: string;
          created_at: string;
          fun_fact: string;
          fursuit_id: string;
          fursuit_name: string;
          fursuit_colors: string[];
          fursuit_species: string;
          id: string;
          likes_and_interests: string;
          owner_name: string;
          pronouns: string;
          social_links: Json;
          tagline: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          ask_me_about: string;
          created_at?: string;
          fun_fact: string;
          fursuit_id: string;
          fursuit_name: string;
          fursuit_colors?: string[];
          fursuit_species: string;
          id?: string;
          likes_and_interests: string;
          owner_name: string;
          pronouns: string;
          social_links?: Json;
          tagline: string;
          updated_at?: string;
          version: number;
        };
        Update: {
          ask_me_about?: string;
          created_at?: string;
          fun_fact?: string;
          fursuit_id?: string;
          fursuit_name?: string;
          fursuit_colors?: string[];
          fursuit_species?: string;
          id?: string;
          likes_and_interests?: string;
          owner_name?: string;
          pronouns?: string;
          social_links?: Json;
          tagline?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "fursuit_bios_fursuit_id_fkey";
            columns: ["fursuit_id"];
            isOneToOne: false;
            referencedRelation: "fursuits";
            referencedColumns: ["id"];
          },
        ];
      };
      fursuit_conventions: {
        Row: {
          convention_id: string;
          created_at: string;
          fursuit_id: string;
        };
        Insert: {
          convention_id: string;
          created_at?: string;
          fursuit_id: string;
        };
        Update: {
          convention_id?: string;
          created_at?: string;
          fursuit_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fursuit_conventions_convention_id_fkey";
            columns: ["convention_id"];
            isOneToOne: false;
            referencedRelation: "conventions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fursuit_conventions_fursuit_id_fkey";
            columns: ["fursuit_id"];
            isOneToOne: false;
            referencedRelation: "fursuits";
            referencedColumns: ["id"];
          },
        ];
      };
      fursuit_species: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          normalized_name: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          normalized_name?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          normalized_name?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      fursuits: {
        Row: {
          avatar_url: string | null;
          catch_count: number;
          created_at: string | null;
          description: string | null;
          id: string;
          is_tutorial: boolean;
          name: string;
          owner_id: string;
          species: string | null;
          species_id: string | null;
          unique_code: string;
        };
        Insert: {
          avatar_url?: string | null;
          catch_count?: number;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          is_tutorial?: boolean;
          name: string;
          owner_id: string;
          species?: string | null;
          species_id?: string | null;
          unique_code: string;
        };
        Update: {
          avatar_url?: string | null;
          catch_count?: number;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          is_tutorial?: boolean;
          name?: string;
          owner_id?: string;
          species?: string | null;
          species_id?: string | null;
          unique_code?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fursuits_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fursuits_species_id_fkey";
            columns: ["species_id"];
            isOneToOne: false;
            referencedRelation: "fursuit_species";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          payload: Json;
          type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          payload: Json;
          type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          payload?: Json;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_conventions: {
        Row: {
          convention_id: string;
          created_at: string;
          profile_id: string;
        };
        Insert: {
          convention_id: string;
          created_at?: string;
          profile_id: string;
        };
        Update: {
          convention_id?: string;
          created_at?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_conventions_convention_id_fkey";
            columns: ["convention_id"];
            isOneToOne: false;
            referencedRelation: "conventions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_conventions_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string | null;
          id: string;
          is_new: boolean;
          onboarding_completed: boolean;
          updated_at: string | null;
          username: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string | null;
          id: string;
          is_new?: boolean;
          onboarding_completed?: boolean;
          updated_at?: string | null;
          username?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string | null;
          id?: string;
          is_new?: boolean;
          onboarding_completed?: boolean;
          updated_at?: string | null;
          username?: string | null;
        };
        Relationships: [];
      };
      user_achievements: {
        Row: {
          achievement_id: string;
          context: Json;
          id: string;
          unlocked_at: string;
          user_id: string;
        };
        Insert: {
          achievement_id: string;
          context?: Json;
          id?: string;
          unlocked_at?: string;
          user_id: string;
        };
        Update: {
          achievement_id?: string;
          context?: Json;
          id?: string;
          unlocked_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey";
            columns: ["achievement_id"];
            isOneToOne: false;
            referencedRelation: "achievements";
            referencedColumns: ["id"];
          },
        ];
      };
      user_daily_progress: {
        Row: {
          completed_at: string | null;
          convention_id: string;
          created_at: string;
          current_count: number;
          day: string;
          is_completed: boolean;
          task_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          convention_id: string;
          created_at?: string;
          current_count?: number;
          day: string;
          is_completed?: boolean;
          task_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          convention_id?: string;
          created_at?: string;
          current_count?: number;
          day?: string;
          is_completed?: boolean;
          task_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_daily_progress_convention_id_fkey";
            columns: ["convention_id"];
            isOneToOne: false;
            referencedRelation: "conventions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_daily_progress_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "daily_tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      user_daily_streaks: {
        Row: {
          best_streak: number;
          convention_id: string;
          created_at: string;
          current_streak: number;
          last_completed_day: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          best_streak?: number;
          convention_id: string;
          created_at?: string;
          current_streak?: number;
          last_completed_day?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          best_streak?: number;
          convention_id?: string;
          created_at?: string;
          current_streak?: number;
          last_completed_day?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_daily_streaks_convention_id_fkey";
            columns: ["convention_id"];
            isOneToOne: false;
            referencedRelation: "conventions";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      record_leaderboard_refresh: {
        Args: {
          convention_id: string;
        };
        Returns: undefined;
      };
      grant_getting_started_achievement: {
        Args: {
          target_user_id?: string | null;
        };
        Returns: boolean;
      };
      finish_onboarding: {
        Args: {
          target_user_id?: string | null;
        };
        Returns: Json;
      };
    };
    Enums: {
      achievement_category:
        | "catching"
        | "variety"
        | "dedication"
        | "fursuiter"
        | "fun"
        | "meta";
      achievement_recipient_role: "catcher" | "fursuit_owner" | "any";
      achievement_trigger_event:
        | "catch.created"
        | "profile.updated"
        | "convention.checkin"
        | "leaderboard.refreshed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R;
    }
    ? R
    : never
  : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I;
    }
    ? I
    : never
  : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U;
    }
    ? U
    : never
  : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never;

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
    },
  },
} as const;

export type AchievementCategory = Database["public"]["Enums"]["achievement_category"];
export type AchievementRecipientRole = Database["public"]["Enums"]["achievement_recipient_role"];
export type AchievementTriggerEvent = Database["public"]["Enums"]["achievement_trigger_event"];

export type AchievementEventsRow = Database["public"]["Tables"]["achievement_events"]["Row"];
export type AchievementsRow = Database["public"]["Tables"]["achievements"]["Row"];
export type UserAchievementsRow = Database["public"]["Tables"]["user_achievements"]["Row"];

export type DailyAssignmentsRow = Database["public"]["Tables"]["daily_assignments"]["Row"];
export type DailyTasksRow = Database["public"]["Tables"]["daily_tasks"]["Row"];
export type UserDailyProgressRow = Database["public"]["Tables"]["user_daily_progress"]["Row"];
export type UserDailyStreaksRow = Database["public"]["Tables"]["user_daily_streaks"]["Row"];

export type FursuitsRow = Database["public"]["Tables"]["fursuits"]["Row"];
export type FursuitsInsert = Database["public"]["Tables"]["fursuits"]["Insert"];
export type FursuitBiosInsert = Database["public"]["Tables"]["fursuit_bios"]["Insert"];
export type FursuitColorAssignmentsRow =
  Database["public"]["Tables"]["fursuit_color_assignments"]["Row"];
export type FursuitColorAssignmentsInsert =
  Database["public"]["Tables"]["fursuit_color_assignments"]["Insert"];
export type FursuitColorAssignmentsUpdate =
  Database["public"]["Tables"]["fursuit_color_assignments"]["Update"];
export type FursuitColorsRow = Database["public"]["Tables"]["fursuit_colors"]["Row"];
export type FursuitColorsInsert = Database["public"]["Tables"]["fursuit_colors"]["Insert"];
export type FursuitColorsUpdate = Database["public"]["Tables"]["fursuit_colors"]["Update"];
export type NotificationsRow = Database["public"]["Tables"]["notifications"]["Row"];
export type NotificationsInsert = Database["public"]["Tables"]["notifications"]["Insert"];
export type NotificationsUpdate = Database["public"]["Tables"]["notifications"]["Update"];

export type FursuitSocialLink = {
  label: string;
  url: string;
};

export type DailyTaskKind = Database["public"]["Tables"]["daily_tasks"]["Row"]["kind"];
