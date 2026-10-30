create table public.police_personnel_notes (
 id uuid primary key, discord_user_id text not null check(discord_user_id ~ '^[0-9]{17,20}$'),
 content text not null check(length(trim(content)) between 1 and 2000),
 created_by text not null, created_by_name text not null,
 updated_by text not null, updated_by_name text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 archived_at timestamptz, version integer not null default 1 check(version>0)
);
create index police_personnel_notes_member on public.police_personnel_notes(discord_user_id,created_at desc,id desc) where archived_at is null;
create table public.police_personnel_note_versions (
 id uuid primary key default gen_random_uuid(), note_id uuid not null,
 version integer not null, content text not null, archived_at timestamptz,
 changed_by text not null, changed_by_name text not null, changed_at timestamptz not null default now(),
 unique(note_id,version)
);
alter table public.police_personnel_notes enable row level security;
alter table public.police_personnel_note_versions enable row level security;
revoke all on public.police_personnel_notes,public.police_personnel_note_versions from public,anon,authenticated;
grant select,insert,update on public.police_personnel_notes to service_role;
grant select,insert on public.police_personnel_note_versions to service_role;
create index if not exists police_shifts_member_started on public.police_duty_shifts(discord_user_id,started_at desc);
create index if not exists police_absences_member_created on public.police_absence_requests(discord_user_id,created_at desc);

create function public.mutate_police_personnel_note(p_user text,p_note uuid,p_actor text,p_actor_name text,p_content text,p_operation text,p_expected_version integer)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare entry public.police_personnel_notes;
begin
 if p_user is null or p_actor is null or p_user !~ '^[0-9]{17,20}$' or p_actor !~ '^[0-9]{17,20}$' or p_note is null or p_operation is null or p_operation not in ('add','edit','archive') then return jsonb_build_object('ok',false,'error','Observación inválida.');end if;
 if p_operation<>'archive' and coalesce(length(trim(p_content)),0) not between 1 and 2000 then return jsonb_build_object('ok',false,'error','Escribe una observación de entre 1 y 2000 caracteres.');end if;
 perform pg_advisory_xact_lock(hashtextextended('personnel-note:'||p_note::text,0));
 if not exists(select from public.police_personnel where discord_user_id=p_user) then return jsonb_build_object('ok',false,'error','La ficha ya no existe.');end if;
 select * into entry from public.police_personnel_notes where id=p_note for update;
 if p_operation='add' then
  if found then
   if entry.discord_user_id=p_user and entry.content=trim(p_content) and entry.created_by=p_actor then return jsonb_build_object('ok',true,'existing',true,'note',to_jsonb(entry));end if;
   return jsonb_build_object('ok',false,'error','Esta referencia de observación ya está utilizada.');
  end if;
  insert into public.police_personnel_notes(id,discord_user_id,content,created_by,created_by_name,updated_by,updated_by_name)
  values(p_note,p_user,trim(p_content),p_actor,p_actor_name,p_actor,p_actor_name) returning * into entry;
 else
  if not found or entry.discord_user_id<>p_user or entry.archived_at is not null then return jsonb_build_object('ok',false,'error','La observación ya no está disponible. Actualiza la ficha.');end if;
  if p_expected_version is null or p_expected_version<>entry.version then return jsonb_build_object('ok',false,'error','Otro gestor modificó esta observación. Actualiza antes de editarla.');end if;
  update public.police_personnel_notes set content=case when p_operation='edit' then trim(p_content) else content end,
   archived_at=case when p_operation='archive' then now() else null end,updated_by=p_actor,updated_by_name=p_actor_name,updated_at=now(),version=version+1
  where id=p_note returning * into entry;
 end if;
 insert into public.police_personnel_note_versions(note_id,version,content,archived_at,changed_by,changed_by_name)
 values(entry.id,entry.version,entry.content,entry.archived_at,p_actor,p_actor_name);
 insert into public.police_audit_events(action,fields) values(
  case p_operation when 'add' then 'Observación añadida a ficha' when 'edit' then 'Observación editada en ficha' else 'Observación archivada en ficha' end,
  jsonb_build_array(jsonb_build_object('name','Agente','value',p_user),jsonb_build_object('name','Gestor','value',p_actor_name),jsonb_build_object('name','Observación','value',entry.id::text)));
 return jsonb_build_object('ok',true,'note',to_jsonb(entry));
end $$;
revoke all on function public.mutate_police_personnel_note(text,uuid,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.mutate_police_personnel_note(text,uuid,text,text,text,text,integer) to service_role;

create function public.police_personnel_profile_summary(p_user text) returns jsonb language sql security invoker set search_path=public as $$
 with period as (select date_trunc('week',now() at time zone 'Europe/Paris') at time zone 'Europe/Paris' as week_start,(now() at time zone 'Europe/Paris')::date as today),
 duty as (select count(*) as shifts_total,count(*) filter(where started_at<now() and coalesce(ended_at,now())>period.week_start) as shifts_week,
  coalesce(sum(greatest(0,extract(epoch from least(coalesce(ended_at,now()),now())-greatest(started_at,period.week_start)))) filter(where started_at<now() and coalesce(ended_at,now())>period.week_start),0) as week_seconds,
  coalesce(bool_or(ended_at is null),false) as on_duty,max(coalesce(ended_at,started_at)) as last_service
  from public.police_duty_shifts cross join period where discord_user_id=p_user),
 absence as (select count(*) filter(where status='approved') as absence_count,
  coalesce(bool_or(status='approved' and start_date<=period.today and end_date>=period.today),false) as on_absence
  from public.police_absence_requests cross join period where discord_user_id=p_user),
 sanctions as (select count(*) filter(where active and status='active' and action_type='warning') as warnings,
  count(*) filter(where active and status='active' and action_type='strike') as strikes from public.police_sanctions where discord_user_id=p_user)
 select jsonb_build_object('shifts_total',duty.shifts_total,'shifts_week',duty.shifts_week,'week_seconds',duty.week_seconds,'on_duty',duty.on_duty,'last_service',duty.last_service,
 'absence_count',absence.absence_count,'on_absence',absence.on_absence,'warnings',sanctions.warnings,'strikes',sanctions.strikes,
 'days_in_rank',case when person.last_rank_change_at is not null then greatest(0,floor(extract(epoch from now()-person.last_rank_change_at)/86400)) end,
 'notes_count',(select count(*) from public.police_personnel_notes where discord_user_id=p_user and archived_at is null))
 from public.police_personnel person cross join duty cross join absence cross join sanctions where person.discord_user_id=p_user;
$$;
revoke all on function public.police_personnel_profile_summary(text) from public,anon,authenticated;
grant execute on function public.police_personnel_profile_summary(text) to service_role;
