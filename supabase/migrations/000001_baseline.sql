SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE SCHEMA IF NOT EXISTS "public";

ALTER SCHEMA "public" OWNER TO "pg_database_owner";

COMMENT ON SCHEMA "public" IS 'standard public schema';

CREATE OR REPLACE FUNCTION "public"."create_profile_for_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."create_profile_for_new_user"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."set_catcher_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  NEW.catcher_id := auth.uid();
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."set_catcher_id"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."set_fursuit_owner"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  NEW.owner_id := auth.uid();
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."set_fursuit_owner"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."touch_conventions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

ALTER FUNCTION "public"."touch_conventions_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_profiles_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_profiles_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

CREATE TABLE IF NOT EXISTS "public"."catches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "catcher_id" "uuid" NOT NULL,
    "fursuit_id" "uuid" NOT NULL,
    "caught_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."catches" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."conventions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "location" "text",
    "start_date" "date",
    "end_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."conventions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."fursuit_conventions" (
    "fursuit_id" "uuid" NOT NULL,
    "convention_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."fursuit_conventions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."fursuits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "species" "text",
    "unique_code" "text" NOT NULL,
    CONSTRAINT "fursuits_unique_code_check" CHECK (("length"("unique_code") < 9))
);

ALTER TABLE "public"."fursuits" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."profile_conventions" (
    "profile_id" "uuid" NOT NULL,
    "convention_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."profile_conventions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text",
    "bio" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."profiles" OWNER TO "postgres";

ALTER TABLE ONLY "public"."catches"
    ADD CONSTRAINT "catches_catcher_id_fursuit_id_key" UNIQUE ("catcher_id", "fursuit_id");

ALTER TABLE ONLY "public"."catches"
    ADD CONSTRAINT "catches_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."conventions"
    ADD CONSTRAINT "conventions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."conventions"
    ADD CONSTRAINT "conventions_slug_key" UNIQUE ("slug");

ALTER TABLE ONLY "public"."fursuit_conventions"
    ADD CONSTRAINT "fursuit_conventions_pkey" PRIMARY KEY ("fursuit_id", "convention_id");

ALTER TABLE ONLY "public"."fursuits"
    ADD CONSTRAINT "fursuits_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."fursuits"
    ADD CONSTRAINT "fursuits_unique_code_key" UNIQUE ("unique_code");

ALTER TABLE ONLY "public"."profile_conventions"
    ADD CONSTRAINT "profile_conventions_pkey" PRIMARY KEY ("profile_id", "convention_id");

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");

CREATE INDEX "fursuit_conventions_convention_idx" ON "public"."fursuit_conventions" USING "btree" ("convention_id");

CREATE INDEX "profile_conventions_convention_idx" ON "public"."profile_conventions" USING "btree" ("convention_id");

CREATE OR REPLACE TRIGGER "before_insert_catcher_id" BEFORE INSERT ON "public"."catches" FOR EACH ROW EXECUTE FUNCTION "public"."set_catcher_id"();

CREATE OR REPLACE TRIGGER "before_insert_fursuit_owner" BEFORE INSERT ON "public"."fursuits" FOR EACH ROW EXECUTE FUNCTION "public"."set_fursuit_owner"();

CREATE OR REPLACE TRIGGER "set_conventions_updated_at" BEFORE UPDATE ON "public"."conventions" FOR EACH ROW EXECUTE FUNCTION "public"."touch_conventions_updated_at"();

CREATE OR REPLACE TRIGGER "set_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_profiles_updated_at"();

ALTER TABLE ONLY "public"."catches"
    ADD CONSTRAINT "catches_catcher_id_fkey" FOREIGN KEY ("catcher_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."catches"
    ADD CONSTRAINT "catches_fursuit_id_fkey" FOREIGN KEY ("fursuit_id") REFERENCES "public"."fursuits"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."fursuit_conventions"
    ADD CONSTRAINT "fursuit_conventions_convention_id_fkey" FOREIGN KEY ("convention_id") REFERENCES "public"."conventions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."fursuit_conventions"
    ADD CONSTRAINT "fursuit_conventions_fursuit_id_fkey" FOREIGN KEY ("fursuit_id") REFERENCES "public"."fursuits"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."fursuits"
    ADD CONSTRAINT "fursuits_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."profile_conventions"
    ADD CONSTRAINT "profile_conventions_convention_id_fkey" FOREIGN KEY ("convention_id") REFERENCES "public"."conventions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."profile_conventions"
    ADD CONSTRAINT "profile_conventions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

CREATE POLICY "Anyone can read conventions" ON "public"."conventions" FOR SELECT USING (true);

CREATE POLICY "Anyone can read fursuit convention opt-ins" ON "public"."fursuit_conventions" FOR SELECT USING (true);

CREATE POLICY "Fursuits are viewable by everyone" ON "public"."fursuits" FOR SELECT USING (true);

CREATE POLICY "Players can opt into conventions" ON "public"."profile_conventions" FOR INSERT WITH CHECK (("auth"."uid"() = "profile_id"));

CREATE POLICY "Players can opt out of conventions" ON "public"."profile_conventions" FOR DELETE USING (("auth"."uid"() = "profile_id"));

CREATE POLICY "Players can view their own convention opt-ins" ON "public"."profile_conventions" FOR SELECT USING (("auth"."uid"() = "profile_id"));

CREATE POLICY "Profiles are viewable by everyone" ON "public"."profiles" FOR SELECT USING (true);

CREATE POLICY "Suit owners can assign conventions" ON "public"."fursuit_conventions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."fursuits" "f"
  WHERE (("f"."id" = "fursuit_conventions"."fursuit_id") AND ("f"."owner_id" = "auth"."uid"())))));

CREATE POLICY "Suit owners can remove conventions" ON "public"."fursuit_conventions" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."fursuits" "f"
  WHERE (("f"."id" = "fursuit_conventions"."fursuit_id") AND ("f"."owner_id" = "auth"."uid"())))));

CREATE POLICY "Users can delete their own catches" ON "public"."catches" FOR DELETE USING (("catcher_id" = "auth"."uid"()));

CREATE POLICY "Users can delete their own fursuits" ON "public"."fursuits" FOR DELETE USING (("auth"."uid"() = "owner_id"));

CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));

CREATE POLICY "Users can insert their own catches" ON "public"."catches" FOR INSERT WITH CHECK (("catcher_id" = "auth"."uid"()));

CREATE POLICY "Users can insert their own fursuits" ON "public"."fursuits" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));

CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));

CREATE POLICY "Users can update their own fursuits" ON "public"."fursuits" FOR UPDATE USING (("auth"."uid"() = "owner_id"));

CREATE POLICY "Users can view relevant catches" ON "public"."catches" FOR SELECT USING ((("catcher_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."fursuits" "f"
  WHERE (("f"."id" = "catches"."fursuit_id") AND ("f"."owner_id" = "auth"."uid"()))))));

ALTER TABLE "public"."catches" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."conventions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."fursuit_conventions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."fursuits" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."profile_conventions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

GRANT ALL ON FUNCTION "public"."create_profile_for_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_profile_for_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_profile_for_new_user"() TO "service_role";

GRANT ALL ON FUNCTION "public"."set_catcher_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_catcher_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_catcher_id"() TO "service_role";

GRANT ALL ON FUNCTION "public"."set_fursuit_owner"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_fursuit_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_fursuit_owner"() TO "service_role";

GRANT ALL ON FUNCTION "public"."touch_conventions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_conventions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_conventions_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_profiles_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_profiles_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_profiles_updated_at"() TO "service_role";

GRANT ALL ON TABLE "public"."catches" TO "anon";
GRANT ALL ON TABLE "public"."catches" TO "authenticated";
GRANT ALL ON TABLE "public"."catches" TO "service_role";

GRANT ALL ON TABLE "public"."conventions" TO "anon";
GRANT ALL ON TABLE "public"."conventions" TO "authenticated";
GRANT ALL ON TABLE "public"."conventions" TO "service_role";

GRANT ALL ON TABLE "public"."fursuit_conventions" TO "anon";
GRANT ALL ON TABLE "public"."fursuit_conventions" TO "authenticated";
GRANT ALL ON TABLE "public"."fursuit_conventions" TO "service_role";

GRANT ALL ON TABLE "public"."fursuits" TO "anon";
GRANT ALL ON TABLE "public"."fursuits" TO "authenticated";
GRANT ALL ON TABLE "public"."fursuits" TO "service_role";

GRANT ALL ON TABLE "public"."profile_conventions" TO "anon";
GRANT ALL ON TABLE "public"."profile_conventions" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_conventions" TO "service_role";

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

RESET ALL;