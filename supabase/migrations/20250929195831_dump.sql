--
-- PostgreSQL database dump
--

-- \restrict UGXJ8QXoDO5OzgmTCBosv0oobF2pWyhbFkWXyy1Xfln0E1fvJOUFC9jKy6M1Z7w

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
-- SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: create_profile_for_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."create_profile_for_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;$$;


ALTER FUNCTION "public"."create_profile_for_new_user"() OWNER TO "postgres";

--
-- Name: set_catcher_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_catcher_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$BEGIN
  NEW.catcher_id := auth.uid();
  RETURN NEW;
END;$$;


ALTER FUNCTION "public"."set_catcher_id"() OWNER TO "postgres";

--
-- Name: set_fursuit_bios_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_fursuit_bios_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;


ALTER FUNCTION "public"."set_fursuit_bios_updated_at"() OWNER TO "postgres";

--
-- Name: set_fursuit_owner(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_fursuit_owner"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$BEGIN
  NEW.owner_id := auth.uid();
  RETURN NEW;
END;$$;


ALTER FUNCTION "public"."set_fursuit_owner"() OWNER TO "postgres";

--
-- Name: set_fursuit_species_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_fursuit_species_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;


ALTER FUNCTION "public"."set_fursuit_species_updated_at"() OWNER TO "postgres";

--
-- Name: touch_conventions_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."touch_conventions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$begin
  new.updated_at = now();
  return new;
end;$$;


ALTER FUNCTION "public"."touch_conventions_updated_at"() OWNER TO "postgres";

--
-- Name: update_profiles_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_profiles_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;$$;


ALTER FUNCTION "public"."update_profiles_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: catches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."catches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "catcher_id" "uuid" NOT NULL,
    "fursuit_id" "uuid" NOT NULL,
    "caught_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."catches" OWNER TO "postgres";

--
-- Name: conventions; Type: TABLE; Schema: public; Owner: postgres
--

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

--
-- Name: fursuit_bios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."fursuit_bios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fursuit_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "fursuit_name" "text" NOT NULL,
    "fursuit_species" "text" NOT NULL,
    "owner_name" "text" NOT NULL,
    "pronouns" "text" NOT NULL,
    "tagline" "text" NOT NULL,
    "fun_fact" "text" NOT NULL,
    "likes_and_interests" "text" NOT NULL,
    "ask_me_about" "text" NOT NULL,
    "social_links" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fursuit_bios_social_links_array_check" CHECK (("jsonb_typeof"("social_links") = 'array'::"text")),
    CONSTRAINT "fursuit_bios_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."fursuit_bios" OWNER TO "postgres";

--
-- Name: fursuit_conventions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."fursuit_conventions" (
    "fursuit_id" "uuid" NOT NULL,
    "convention_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fursuit_conventions" OWNER TO "postgres";

--
-- Name: fursuit_species; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."fursuit_species" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "normalized_name" "text" GENERATED ALWAYS AS ("lower"("regexp_replace"("btrim"("name"), '\s+'::"text", ' '::"text", 'g'::"text"))) STORED,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "fursuit_species_name_length_check" CHECK ((("char_length"("btrim"("name")) >= 2) AND ("char_length"("btrim"("name")) <= 120)))
);


ALTER TABLE "public"."fursuit_species" OWNER TO "postgres";

--
-- Name: fursuits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."fursuits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "species" "text",
    "unique_code" "text" NOT NULL,
    "species_id" "uuid",
    CONSTRAINT "fursuits_unique_code_check" CHECK (("length"("unique_code") < 9))
);


ALTER TABLE "public"."fursuits" OWNER TO "postgres";

--
-- Name: profile_conventions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."profile_conventions" (
    "profile_id" "uuid" NOT NULL,
    "convention_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profile_conventions" OWNER TO "postgres";

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text",
    "bio" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";

--
-- Name: catches catches_catcher_id_fursuit_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."catches"
    ADD CONSTRAINT "catches_catcher_id_fursuit_id_key" UNIQUE ("catcher_id", "fursuit_id");


--
-- Name: catches catches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."catches"
    ADD CONSTRAINT "catches_pkey" PRIMARY KEY ("id");


--
-- Name: conventions conventions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."conventions"
    ADD CONSTRAINT "conventions_pkey" PRIMARY KEY ("id");


--
-- Name: conventions conventions_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."conventions"
    ADD CONSTRAINT "conventions_slug_key" UNIQUE ("slug");


--
-- Name: fursuit_bios fursuit_bios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fursuit_bios"
    ADD CONSTRAINT "fursuit_bios_pkey" PRIMARY KEY ("id");


--
-- Name: fursuit_conventions fursuit_conventions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fursuit_conventions"
    ADD CONSTRAINT "fursuit_conventions_pkey" PRIMARY KEY ("fursuit_id", "convention_id");


--
-- Name: fursuit_species fursuit_species_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fursuit_species"
    ADD CONSTRAINT "fursuit_species_pkey" PRIMARY KEY ("id");


--
-- Name: fursuits fursuits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fursuits"
    ADD CONSTRAINT "fursuits_pkey" PRIMARY KEY ("id");


--
-- Name: fursuits fursuits_unique_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fursuits"
    ADD CONSTRAINT "fursuits_unique_code_key" UNIQUE ("unique_code");


--
-- Name: profile_conventions profile_conventions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profile_conventions"
    ADD CONSTRAINT "profile_conventions_pkey" PRIMARY KEY ("profile_id", "convention_id");


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");


--
-- Name: fursuit_bios_fursuit_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "fursuit_bios_fursuit_id_idx" ON "public"."fursuit_bios" USING "btree" ("fursuit_id");


--
-- Name: fursuit_bios_unique_fursuit_version; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "fursuit_bios_unique_fursuit_version" ON "public"."fursuit_bios" USING "btree" ("fursuit_id", "version");


--
-- Name: fursuit_conventions_convention_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "fursuit_conventions_convention_idx" ON "public"."fursuit_conventions" USING "btree" ("convention_id");


--
-- Name: fursuit_species_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "fursuit_species_created_at_idx" ON "public"."fursuit_species" USING "btree" ("created_at" DESC);


--
-- Name: fursuit_species_normalized_name_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "fursuit_species_normalized_name_unique" ON "public"."fursuit_species" USING "btree" ("normalized_name");


--
-- Name: fursuits_species_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "fursuits_species_id_idx" ON "public"."fursuits" USING "btree" ("species_id");


--
-- Name: profile_conventions_convention_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "profile_conventions_convention_idx" ON "public"."profile_conventions" USING "btree" ("convention_id");


--
-- Name: catches before_insert_catcher_id; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "before_insert_catcher_id" BEFORE INSERT ON "public"."catches" FOR EACH ROW EXECUTE FUNCTION "public"."set_catcher_id"();


--
-- Name: fursuits before_insert_fursuit_owner; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "before_insert_fursuit_owner" BEFORE INSERT ON "public"."fursuits" FOR EACH ROW EXECUTE FUNCTION "public"."set_fursuit_owner"();


--
-- Name: conventions set_conventions_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_conventions_updated_at" BEFORE UPDATE ON "public"."conventions" FOR EACH ROW EXECUTE FUNCTION "public"."touch_conventions_updated_at"();


--
-- Name: fursuit_bios set_fursuit_bios_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_fursuit_bios_updated_at" BEFORE UPDATE ON "public"."fursuit_bios" FOR EACH ROW EXECUTE FUNCTION "public"."set_fursuit_bios_updated_at"();


--
-- Name: fursuit_species set_fursuit_species_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_fursuit_species_updated_at" BEFORE UPDATE ON "public"."fursuit_species" FOR EACH ROW EXECUTE FUNCTION "public"."set_fursuit_species_updated_at"();


--
-- Name: profiles set_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_profiles_updated_at"();


--
-- Name: catches catches_catcher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."catches"
    ADD CONSTRAINT "catches_catcher_id_fkey" FOREIGN KEY ("catcher_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: catches catches_fursuit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."catches"
    ADD CONSTRAINT "catches_fursuit_id_fkey" FOREIGN KEY ("fursuit_id") REFERENCES "public"."fursuits"("id") ON DELETE CASCADE;


--
-- Name: fursuit_bios fursuit_bios_fursuit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fursuit_bios"
    ADD CONSTRAINT "fursuit_bios_fursuit_id_fkey" FOREIGN KEY ("fursuit_id") REFERENCES "public"."fursuits"("id") ON DELETE CASCADE;


--
-- Name: fursuit_conventions fursuit_conventions_convention_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fursuit_conventions"
    ADD CONSTRAINT "fursuit_conventions_convention_id_fkey" FOREIGN KEY ("convention_id") REFERENCES "public"."conventions"("id") ON DELETE CASCADE;


--
-- Name: fursuit_conventions fursuit_conventions_fursuit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fursuit_conventions"
    ADD CONSTRAINT "fursuit_conventions_fursuit_id_fkey" FOREIGN KEY ("fursuit_id") REFERENCES "public"."fursuits"("id") ON DELETE CASCADE;


--
-- Name: fursuits fursuits_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fursuits"
    ADD CONSTRAINT "fursuits_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: fursuits fursuits_species_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fursuits"
    ADD CONSTRAINT "fursuits_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "public"."fursuit_species"("id") ON DELETE RESTRICT;


--
-- Name: profile_conventions profile_conventions_convention_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profile_conventions"
    ADD CONSTRAINT "profile_conventions_convention_id_fkey" FOREIGN KEY ("convention_id") REFERENCES "public"."conventions"("id") ON DELETE CASCADE;


--
-- Name: profile_conventions profile_conventions_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profile_conventions"
    ADD CONSTRAINT "profile_conventions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: conventions Anyone can read conventions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Anyone can read conventions" ON "public"."conventions" FOR SELECT USING (true);


--
-- Name: fursuit_conventions Anyone can read fursuit convention opt-ins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Anyone can read fursuit convention opt-ins" ON "public"."fursuit_conventions" FOR SELECT USING (true);


--
-- Name: fursuits Fursuits are viewable by everyone; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Fursuits are viewable by everyone" ON "public"."fursuits" FOR SELECT USING (true);


--
-- Name: profile_conventions Players can opt into conventions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Players can opt into conventions" ON "public"."profile_conventions" FOR INSERT WITH CHECK (("auth"."uid"() = "profile_id"));


--
-- Name: profile_conventions Players can opt out of conventions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Players can opt out of conventions" ON "public"."profile_conventions" FOR DELETE USING (("auth"."uid"() = "profile_id"));


--
-- Name: profile_conventions Players can view their own convention opt-ins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Players can view their own convention opt-ins" ON "public"."profile_conventions" FOR SELECT USING (("auth"."uid"() = "profile_id"));


--
-- Name: profiles Profiles are viewable by everyone; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Profiles are viewable by everyone" ON "public"."profiles" FOR SELECT USING (true);


--
-- Name: fursuit_conventions Suit owners can assign conventions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Suit owners can assign conventions" ON "public"."fursuit_conventions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."fursuits" "f"
  WHERE (("f"."id" = "fursuit_conventions"."fursuit_id") AND ("f"."owner_id" = "auth"."uid"())))));


--
-- Name: fursuit_conventions Suit owners can remove conventions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Suit owners can remove conventions" ON "public"."fursuit_conventions" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."fursuits" "f"
  WHERE (("f"."id" = "fursuit_conventions"."fursuit_id") AND ("f"."owner_id" = "auth"."uid"())))));


--
-- Name: catches Users can delete their own catches; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own catches" ON "public"."catches" FOR DELETE USING (("catcher_id" = "auth"."uid"()));


--
-- Name: fursuits Users can delete their own fursuits; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own fursuits" ON "public"."fursuits" FOR DELETE USING (("auth"."uid"() = "owner_id"));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));


--
-- Name: catches Users can insert their own catches; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their own catches" ON "public"."catches" FOR INSERT WITH CHECK (("catcher_id" = "auth"."uid"()));


--
-- Name: fursuits Users can insert their own fursuits; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their own fursuits" ON "public"."fursuits" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));


--
-- Name: fursuits Users can update their own fursuits; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own fursuits" ON "public"."fursuits" FOR UPDATE USING (("auth"."uid"() = "owner_id"));


--
-- Name: catches Users can view relevant catches; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view relevant catches" ON "public"."catches" FOR SELECT USING ((("catcher_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."fursuits" "f"
  WHERE (("f"."id" = "catches"."fursuit_id") AND ("f"."owner_id" = "auth"."uid"()))))));


--
-- Name: catches; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."catches" ENABLE ROW LEVEL SECURITY;

--
-- Name: conventions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."conventions" ENABLE ROW LEVEL SECURITY;

--
-- Name: fursuit_bios; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."fursuit_bios" ENABLE ROW LEVEL SECURITY;

--
-- Name: fursuit_bios fursuit_bios_insert_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fursuit_bios_insert_owner" ON "public"."fursuit_bios" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."fursuits" "f"
  WHERE (("f"."id" = "fursuit_bios"."fursuit_id") AND ("f"."owner_id" = "auth"."uid"())))));


--
-- Name: fursuit_bios fursuit_bios_select_all_authenticated; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fursuit_bios_select_all_authenticated" ON "public"."fursuit_bios" FOR SELECT TO "authenticated" USING (true);


--
-- Name: fursuit_bios fursuit_bios_update_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fursuit_bios_update_owner" ON "public"."fursuit_bios" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."fursuits" "f"
  WHERE (("f"."id" = "fursuit_bios"."fursuit_id") AND ("f"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."fursuits" "f"
  WHERE (("f"."id" = "fursuit_bios"."fursuit_id") AND ("f"."owner_id" = "auth"."uid"())))));


--
-- Name: fursuit_conventions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."fursuit_conventions" ENABLE ROW LEVEL SECURITY;

--
-- Name: fursuit_species; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."fursuit_species" ENABLE ROW LEVEL SECURITY;

--
-- Name: fursuit_species fursuit_species_insert_authenticated; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fursuit_species_insert_authenticated" ON "public"."fursuit_species" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));


--
-- Name: fursuit_species fursuit_species_read_access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fursuit_species_read_access" ON "public"."fursuit_species" FOR SELECT USING (true);


--
-- Name: fursuits; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."fursuits" ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_conventions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."profile_conventions" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "create_profile_for_new_user"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."create_profile_for_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_profile_for_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_profile_for_new_user"() TO "service_role";


--
-- Name: FUNCTION "set_catcher_id"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_catcher_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_catcher_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_catcher_id"() TO "service_role";


--
-- Name: FUNCTION "set_fursuit_bios_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_fursuit_bios_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_fursuit_bios_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_fursuit_bios_updated_at"() TO "service_role";


--
-- Name: FUNCTION "set_fursuit_owner"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_fursuit_owner"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_fursuit_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_fursuit_owner"() TO "service_role";


--
-- Name: FUNCTION "set_fursuit_species_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_fursuit_species_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_fursuit_species_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_fursuit_species_updated_at"() TO "service_role";


--
-- Name: FUNCTION "touch_conventions_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."touch_conventions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_conventions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_conventions_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_profiles_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_profiles_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_profiles_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_profiles_updated_at"() TO "service_role";


--
-- Name: TABLE "catches"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."catches" TO "anon";
GRANT ALL ON TABLE "public"."catches" TO "authenticated";
GRANT ALL ON TABLE "public"."catches" TO "service_role";


--
-- Name: TABLE "conventions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."conventions" TO "anon";
GRANT ALL ON TABLE "public"."conventions" TO "authenticated";
GRANT ALL ON TABLE "public"."conventions" TO "service_role";


--
-- Name: TABLE "fursuit_bios"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."fursuit_bios" TO "anon";
GRANT ALL ON TABLE "public"."fursuit_bios" TO "authenticated";
GRANT ALL ON TABLE "public"."fursuit_bios" TO "service_role";


--
-- Name: TABLE "fursuit_conventions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."fursuit_conventions" TO "anon";
GRANT ALL ON TABLE "public"."fursuit_conventions" TO "authenticated";
GRANT ALL ON TABLE "public"."fursuit_conventions" TO "service_role";


--
-- Name: TABLE "fursuit_species"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."fursuit_species" TO "anon";
GRANT ALL ON TABLE "public"."fursuit_species" TO "authenticated";
GRANT ALL ON TABLE "public"."fursuit_species" TO "service_role";


--
-- Name: TABLE "fursuits"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."fursuits" TO "anon";
GRANT ALL ON TABLE "public"."fursuits" TO "authenticated";
GRANT ALL ON TABLE "public"."fursuits" TO "service_role";


--
-- Name: TABLE "profile_conventions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."profile_conventions" TO "anon";
GRANT ALL ON TABLE "public"."profile_conventions" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_conventions" TO "service_role";


--
-- Name: TABLE "profiles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

-- \unrestrict UGXJ8QXoDO5OzgmTCBosv0oobF2pWyhbFkWXyy1Xfln0E1fvJOUFC9jKy6M1Z7w

RESET ALL;
