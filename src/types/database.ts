export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface ProfilesRow {
  id: string;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ProfilesInsert {
  id: string;
  username?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ProfilesUpdate {
  id?: string;
  username?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface FursuitsRow {
  id: string;
  owner_id: string;
  name: string;
  species: string | null;
  avatar_url: string | null;
  unique_code: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface FursuitsInsert {
  id?: string;
  owner_id: string;
  name: string;
  species?: string | null;
  avatar_url?: string | null;
  unique_code: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface FursuitsUpdate {
  id?: string;
  owner_id?: string;
  name?: string;
  species?: string | null;
  avatar_url?: string | null;
  unique_code?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CatchesRow {
  id: string;
  catcher_id: string;
  fursuit_id: string;
  caught_at: string | null;
  created_at: string | null;
}

export interface CatchesInsert {
  id?: string;
  catcher_id: string;
  fursuit_id: string;
  caught_at?: string | null;
  created_at?: string | null;
}

export interface CatchesUpdate {
  id?: string;
  catcher_id?: string;
  fursuit_id?: string;
  caught_at?: string | null;
  created_at?: string | null;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfilesRow;
        Insert: ProfilesInsert;
        Update: ProfilesUpdate;
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey';
            columns: ['id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      fursuits: {
        Row: FursuitsRow;
        Insert: FursuitsInsert;
        Update: FursuitsUpdate;
        Relationships: [
          {
            foreignKeyName: 'fursuits_owner_id_fkey';
            columns: ['owner_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };
      catches: {
        Row: CatchesRow;
        Insert: CatchesInsert;
        Update: CatchesUpdate;
        Relationships: [
          {
            foreignKeyName: 'catches_catcher_id_fkey';
            columns: ['catcher_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catches_fursuit_id_fkey';
            columns: ['fursuit_id'];
            referencedRelation: 'fursuits';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
