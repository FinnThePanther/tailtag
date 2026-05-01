create table "public"."fursuit_makers" (
  "id" uuid not null default gen_random_uuid(),
  "fursuit_id" uuid not null,
  "maker_name" text not null,
  "normalized_maker_name" text not null,
  "position" smallint not null,
  "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
  "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
);

alter table "public"."fursuit_makers" enable row level security;

create unique index fursuit_makers_pkey on public.fursuit_makers using btree (id);

create unique index fursuit_makers_unique_fursuit_position on public.fursuit_makers using btree (fursuit_id, position);

create unique index fursuit_makers_unique_fursuit_normalized_name on public.fursuit_makers using btree (fursuit_id, normalized_maker_name);

create index fursuit_makers_fursuit_id_idx on public.fursuit_makers using btree (fursuit_id);

create index fursuit_makers_normalized_maker_name_idx on public.fursuit_makers using btree (normalized_maker_name);

alter table "public"."fursuit_makers" add constraint "fursuit_makers_pkey" primary key using index "fursuit_makers_pkey";

alter table "public"."fursuit_makers" add constraint "fursuit_makers_fursuit_id_fkey" foreign key (fursuit_id) references public.fursuits(id) on delete cascade not valid;

alter table "public"."fursuit_makers" validate constraint "fursuit_makers_fursuit_id_fkey";

alter table "public"."fursuit_makers" add constraint "fursuit_makers_maker_name_check" check (char_length(btrim(maker_name)) > 0) not valid;

alter table "public"."fursuit_makers" validate constraint "fursuit_makers_maker_name_check";

alter table "public"."fursuit_makers" add constraint "fursuit_makers_normalized_maker_name_check" check (char_length(btrim(normalized_maker_name)) > 0) not valid;

alter table "public"."fursuit_makers" validate constraint "fursuit_makers_normalized_maker_name_check";

alter table "public"."fursuit_makers" add constraint "fursuit_makers_position_check" check (position > 0) not valid;

alter table "public"."fursuit_makers" validate constraint "fursuit_makers_position_check";

create or replace function public.set_fursuit_makers_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create trigger set_fursuit_makers_updated_at before update on public.fursuit_makers for each row execute function public.set_fursuit_makers_updated_at();

grant delete on table "public"."fursuit_makers" to "anon";
grant insert on table "public"."fursuit_makers" to "anon";
grant references on table "public"."fursuit_makers" to "anon";
grant select on table "public"."fursuit_makers" to "anon";
grant trigger on table "public"."fursuit_makers" to "anon";
grant truncate on table "public"."fursuit_makers" to "anon";
grant update on table "public"."fursuit_makers" to "anon";

grant delete on table "public"."fursuit_makers" to "authenticated";
grant insert on table "public"."fursuit_makers" to "authenticated";
grant references on table "public"."fursuit_makers" to "authenticated";
grant select on table "public"."fursuit_makers" to "authenticated";
grant trigger on table "public"."fursuit_makers" to "authenticated";
grant truncate on table "public"."fursuit_makers" to "authenticated";
grant update on table "public"."fursuit_makers" to "authenticated";

grant delete on table "public"."fursuit_makers" to "service_role";
grant insert on table "public"."fursuit_makers" to "service_role";
grant references on table "public"."fursuit_makers" to "service_role";
grant select on table "public"."fursuit_makers" to "service_role";
grant trigger on table "public"."fursuit_makers" to "service_role";
grant truncate on table "public"."fursuit_makers" to "service_role";
grant update on table "public"."fursuit_makers" to "service_role";

create policy "fursuit_makers_select_all_authenticated"
on "public"."fursuit_makers"
as permissive
for select
to authenticated
using (true);

create policy "fursuit_makers_insert_owner"
on "public"."fursuit_makers"
as permissive
for insert
to authenticated
with check (
  exists (
    select 1
    from public.fursuits
    where fursuits.id = fursuit_makers.fursuit_id
      and fursuits.owner_id = auth.uid()
  )
);

create policy "fursuit_makers_update_owner"
on "public"."fursuit_makers"
as permissive
for update
to authenticated
using (
  exists (
    select 1
    from public.fursuits
    where fursuits.id = fursuit_makers.fursuit_id
      and fursuits.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.fursuits
    where fursuits.id = fursuit_makers.fursuit_id
      and fursuits.owner_id = auth.uid()
  )
);

create policy "fursuit_makers_delete_owner"
on "public"."fursuit_makers"
as permissive
for delete
to authenticated
using (
  exists (
    select 1
    from public.fursuits
    where fursuits.id = fursuit_makers.fursuit_id
      and fursuits.owner_id = auth.uid()
  )
);
