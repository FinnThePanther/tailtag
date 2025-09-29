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
  species_id: string | null;
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
  species_id?: string | null;
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
  species_id?: string | null;
  avatar_url?: string | null;
  unique_code?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface FursuitSpeciesRow {
  id: string;
  name: string;
  normalized_name: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface FursuitSpeciesInsert {
  id?: string;
  name: string;
  normalized_name?: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface FursuitSpeciesUpdate {
  id?: string;
  name?: string;
  normalized_name?: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ConventionsRow {
  id: string;
  slug: string;
  name: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ConventionsInsert {
  id?: string;
  slug: string;
  name: string;
  location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ConventionsUpdate {
  id?: string;
  slug?: string;
  name?: string;
  location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ProfileConventionsRow {
  profile_id: string;
  convention_id: string;
  created_at: string | null;
}

export interface ProfileConventionsInsert {
  profile_id: string;
  convention_id: string;
  created_at?: string | null;
}

export interface ProfileConventionsUpdate {
  profile_id?: string;
  convention_id?: string;
  created_at?: string | null;
}

export interface FursuitConventionsRow {
  fursuit_id: string;
  convention_id: string;
  created_at: string | null;
}

export interface FursuitConventionsInsert {
  fursuit_id: string;
  convention_id: string;
  created_at?: string | null;
}

export interface FursuitConventionsUpdate {
  fursuit_id?: string;
  convention_id?: string;
  created_at?: string | null;
}

export type FursuitSocialLink = {
  label: string;
  url: string;
};

export interface FursuitBiosRow {
  id: string;
  fursuit_id: string;
  version: number;
  fursuit_name: string;
  fursuit_species: string;
  owner_name: string;
  pronouns: string;
  tagline: string;
  fun_fact: string;
  likes_and_interests: string;
  ask_me_about: string;
  social_links: Json;
  created_at: string | null;
  updated_at: string | null;
}

export interface FursuitBiosInsert {
  id?: string;
  fursuit_id: string;
  version: number;
  fursuit_name: string;
  fursuit_species: string;
  owner_name: string;
  pronouns: string;
  tagline: string;
  fun_fact: string;
  likes_and_interests: string;
  ask_me_about: string;
  social_links?: Json;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface FursuitBiosUpdate {
  id?: string;
  fursuit_id?: string;
  version?: number;
  fursuit_name?: string;
  fursuit_species?: string;
  owner_name?: string;
  pronouns?: string;
  tagline?: string;
  fun_fact?: string;
  likes_and_interests?: string;
  ask_me_about?: string;
  social_links?: Json;
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
          },
          {
            foreignKeyName: 'fursuits_species_id_fkey';
            columns: ['species_id'];
            referencedRelation: 'fursuit_species';
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
      conventions: {
        Row: ConventionsRow;
        Insert: ConventionsInsert;
        Update: ConventionsUpdate;
        Relationships: [];
      };
      profile_conventions: {
        Row: ProfileConventionsRow;
        Insert: ProfileConventionsInsert;
        Update: ProfileConventionsUpdate;
        Relationships: [
          {
            foreignKeyName: 'profile_conventions_profile_id_fkey';
            columns: ['profile_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profile_conventions_convention_id_fkey';
            columns: ['convention_id'];
            referencedRelation: 'conventions';
            referencedColumns: ['id'];
          }
        ];
      };
      fursuit_conventions: {
        Row: FursuitConventionsRow;
        Insert: FursuitConventionsInsert;
        Update: FursuitConventionsUpdate;
        Relationships: [
          {
            foreignKeyName: 'fursuit_conventions_fursuit_id_fkey';
            columns: ['fursuit_id'];
            referencedRelation: 'fursuits';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fursuit_conventions_convention_id_fkey';
            columns: ['convention_id'];
            referencedRelation: 'conventions';
            referencedColumns: ['id'];
          }
        ];
      };
      fursuit_bios: {
        Row: FursuitBiosRow;
        Insert: FursuitBiosInsert;
        Update: FursuitBiosUpdate;
        Relationships: [
          {
            foreignKeyName: 'fursuit_bios_fursuit_id_fkey';
            columns: ['fursuit_id'];
            referencedRelation: 'fursuits';
            referencedColumns: ['id'];
          }
        ];
      };
      fursuit_species: {
        Row: FursuitSpeciesRow;
        Insert: FursuitSpeciesInsert;
        Update: FursuitSpeciesUpdate;
        Relationships: [];
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
