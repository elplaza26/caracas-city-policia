create table public.police_absence_requests (
 id uuid primary key default gen_random_uuid(), request_key text not null unique,
 discord_user_id text not null check(discord_user_id ~ '^[0-9]{17,20}$'), discord_username text not null,
 full_name text not null, plate text not null, unit text not null,
 start_date date not null, end_date date not null, reason text not null check(length(reason) between 3 and 4000),
 status text not null default 'approved' check(status in ('pending','approved','rejected','cancelled')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 reviewed_by text, reviewed_at timestamptz, review_reason text,
 check(end_date>=start_date)
);
create index police_absences_member_dates on public.police_absence_requests(discord_user_id,start_date,end_date) where status in ('pending','approved');
create index police_absences_status_date on public.police_absence_requests(status,created_at desc,id desc);
alter table public.police_absence_requests enable row level security;
revoke all on public.police_absence_requests from anon,authenticated;
grant select,insert,update on public.police_absence_requests to service_role;

create function public.submit_police_absence(p_user text,p_username text,p_request_key text,p_start date,p_end date,p_reason text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare person public.police_personnel; existing public.police_absence_requests; created public.police_absence_requests;
begin
 if p_user !~ '^[0-9]{17,20}$' or p_request_key is null or length(p_request_key) not between 1 and 100 or p_start is null or p_end is null or p_end<p_start or p_reason is null or length(trim(p_reason)) not between 3 and 4000 then
  return jsonb_build_object('ok',false,'error','Revisa las fechas y escribe un motivo de al menos 3 caracteres.');
 end if;
 perform pg_advisory_xact_lock(hashtextextended('absence:'||p_user,0));
 select * into existing from public.police_absence_requests where request_key=p_request_key and discord_user_id=p_user;
 if found then return jsonb_build_object('ok',true,'id',existing.id,'existing',true); end if;
 select * into person from public.police_personnel where discord_user_id=p_user and status='active';
 if not found then return jsonb_build_object('ok',false,'error','Necesitas una ficha de Policía activa en la web. Contacta con UCOP.');end if;
 if exists(select from public.police_absence_requests where discord_user_id=p_user and status in ('pending','approved') and start_date<=p_end and end_date>=p_start) then
  return jsonb_build_object('ok',false,'error','Ya tienes una ausencia pendiente o aprobada que coincide con estas fechas. Revisa Mis ausencias o contacta con UCOP.');
 end if;
 insert into public.police_absence_requests(request_key,discord_user_id,discord_username,full_name,plate,unit,start_date,end_date,reason)
 values(p_request_key,p_user,left(p_username,100),person.full_name,coalesce(person.plate,''),person.unit,p_start,p_end,trim(p_reason)) returning * into created;
 return jsonb_build_object('ok',true,'id',created.id);
end $$;
revoke all on function public.submit_police_absence(text,text,text,date,date,text) from public,anon,authenticated;
grant execute on function public.submit_police_absence(text,text,text,date,date,text) to service_role;

create function public.police_absence_summary() returns jsonb language sql stable security invoker set search_path=public as $$
 with today as (select (now() at time zone 'Europe/Paris')::date as day),
 active_absences as (
  select a.id,a.discord_user_id,p.full_name,p.plate,a.start_date,a.end_date from public.police_absence_requests a join public.police_personnel p using(discord_user_id),today
  where a.status='approved' and p.status='active' and a.start_date<=today.day and a.end_date>=today.day
 ), people as(select count(*) as total from public.police_personnel where status='active')
 select jsonb_build_object('today',(select day from today),'active_personnel',(select total from people),
 'absent', (select count(distinct discord_user_id) from active_absences),
 'available',(select total from people)-(select count(distinct discord_user_id) from active_absences),
 'scheduled',(select count(*) from public.police_absence_requests,today where status='approved' and start_date>today.day and exists(select from public.police_personnel p where p.discord_user_id=police_absence_requests.discord_user_id and p.status='active')),'pending',(select count(*) from public.police_absence_requests where status='pending'),
 'current',coalesce((select jsonb_agg(active_absences order by full_name) from active_absences),'[]'::jsonb));
$$;
revoke all on function public.police_absence_summary() from public,anon,authenticated;
grant execute on function public.police_absence_summary() to service_role;

create function public.register_police_absence(p_user text,p_request_key text,p_start date,p_end date,p_reason text,p_actor text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb; found_status text;
begin
 result:=public.submit_police_absence(p_user,'Registro administrativo',p_request_key,p_start,p_end,p_reason);
 if not (result->>'ok')::boolean then return result;end if;
 select status into found_status from public.police_absence_requests where id=(result->>'id')::uuid for update;
 if found_status='pending' then
  update public.police_absence_requests set status='approved',reviewed_by=p_actor,reviewed_at=now(),updated_at=now(),review_reason='Registrada desde la web' where id=(result->>'id')::uuid;
 elsif found_status<>'approved' then return jsonb_build_object('ok',false,'error','Este registro ya fue revisado. Consulta el historial antes de repetir.');end if;
 return result;
end $$;
revoke all on function public.register_police_absence(text,text,date,date,text,text) from public,anon,authenticated;
grant execute on function public.register_police_absence(text,text,date,date,text,text) to service_role;

create function public.police_absence_roster(p_search text default '',p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path=public as $$
 with today as(select (now() at time zone 'Europe/Paris')::date as day),
 people as(select p.discord_user_id,p.full_name,p.plate,p.rank_name,p.unit,p.status,
 (select count(*) from public.police_absence_requests a where a.discord_user_id=p.discord_user_id) as absence_count,
 exists(select from public.police_absence_requests a,today where a.discord_user_id=p.discord_user_id and a.status='approved' and a.start_date<=today.day and a.end_date>=today.day) as on_absence
 from public.police_personnel p where p_search='' or p.full_name ilike '%'||left(p_search,100)||'%' or p.plate ilike '%'||left(p_search,100)||'%'),
 page as(select * from people order by full_name,discord_user_id limit 25 offset greatest(0,p_offset))
 select jsonb_build_object('total',(select count(*) from people),'people',coalesce((select jsonb_agg(page order by full_name,discord_user_id) from page),'[]'::jsonb));
$$;
revoke all on function public.police_absence_roster(text,integer) from public,anon,authenticated;
grant execute on function public.police_absence_roster(text,integer) to service_role;
