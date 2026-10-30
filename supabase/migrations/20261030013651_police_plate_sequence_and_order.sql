alter table public.police_personnel
 add column plate_number numeric generated always as (case when trim(plate) ~ '^[0-9]+$' then trim(plate)::numeric end) stored,
 add column plate_key text generated always as (case when trim(plate) ~ '^[0-9]+$' then coalesce(nullif(ltrim(trim(plate),'0'),''),'0') else upper(trim(plate)) end) stored;
create unique index police_personnel_active_plate_unique on public.police_personnel(plate_key) where status='active' and plate_key<>'';
create index police_personnel_plate_order on public.police_personnel(plate_number,plate,discord_user_id);

create table public.police_plate_reservations (
 operation_id uuid primary key, discord_user_id text not null check(discord_user_id ~ '^[0-9]{17,20}$'),
 plate text not null, plate_number numeric not null unique check(plate_number>=0), created_at timestamptz not null default now()
);
alter table public.police_plate_reservations enable row level security;
revoke all on public.police_plate_reservations from public,anon,authenticated;
grant select,insert on public.police_plate_reservations to service_role;

create function public.next_police_plate() returns text language sql security invoker set search_path=public as $$
 select lpad(n::text,greatest(4,length(n::text)),'0') from (
  select greatest(115,coalesce((select max(plate_number) from public.police_personnel),115),coalesce((select max(plate_number) from public.police_plate_reservations),115))+1 as n
 ) candidate;
$$;
revoke all on function public.next_police_plate() from public,anon,authenticated;
grant execute on function public.next_police_plate() to service_role;

create function public.reserve_police_plate(p_operation uuid,p_user text,p_manual text default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare existing public.police_plate_reservations; candidate text; number numeric;
begin
 if p_operation is null or p_user is null or p_user !~ '^[0-9]{17,20}$' then return jsonb_build_object('ok',false,'error','No se pudo identificar el ingreso para asignar placa.');end if;
 if p_manual is not null and trim(p_manual) !~ '^[0-9]{1,30}$' then return jsonb_build_object('ok',false,'error','La placa debe contener solo números.');end if;
 perform pg_advisory_xact_lock(hashtextextended('police-plate-allocation',0));
 select * into existing from public.police_plate_reservations where operation_id=p_operation;
 if found then
  if existing.discord_user_id<>p_user then return jsonb_build_object('ok',false,'error','La referencia de placa pertenece a otro ingreso.');end if;
  if p_manual is not null and trim(p_manual)::numeric<>existing.plate_number then return jsonb_build_object('ok',false,'error','Este ingreso ya tiene una placa reservada. Revisa el resultado antes de cambiarla.');end if;
  return jsonb_build_object('ok',true,'plate',existing.plate);
 end if;
 if p_manual is null then candidate:=public.next_police_plate();
 else candidate:=lpad(trim(p_manual)::numeric::text,greatest(4,length(trim(p_manual)::numeric::text)),'0');end if;
 number:=candidate::numeric;
 if exists(select from public.police_personnel where plate_number=number and status='active' and discord_user_id<>p_user)
 or exists(select from public.police_plate_reservations where plate_number=number) then return jsonb_build_object('ok',false,'error','La placa ya está asignada o reservada para otro ingreso.');end if;
 insert into public.police_plate_reservations(operation_id,discord_user_id,plate,plate_number) values(p_operation,p_user,candidate,number);
 return jsonb_build_object('ok',true,'plate',candidate);
end $$;
revoke all on function public.reserve_police_plate(uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_police_plate(uuid,text,text) to service_role;

create function public.check_police_plate_reservation() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.status='active' and trim(new.plate) ~ '^[0-9]+$' then
  perform pg_advisory_xact_lock(hashtextextended('police-plate-allocation',0));
  if exists(select from public.police_plate_reservations where plate_number=trim(new.plate)::numeric and discord_user_id<>new.discord_user_id) then
   raise exception 'La placa está reservada para otro ingreso.' using errcode='23505';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.check_police_plate_reservation() from public,anon,authenticated;
grant execute on function public.check_police_plate_reservation() to service_role;
create trigger police_personnel_check_plate before insert or update of plate,status on public.police_personnel for each row execute function public.check_police_plate_reservation();
