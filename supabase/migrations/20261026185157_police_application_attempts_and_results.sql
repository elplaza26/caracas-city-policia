alter table public.police_applications
  add column if not exists attempt_number integer,
  add column if not exists discord_message_id text;

with numbered as (
  select id, row_number() over (partition by discord_user_id order by created_at, id) as attempt_number
  from public.police_applications
)
update public.police_applications as application
set attempt_number = numbered.attempt_number
from numbered
where application.id = numbered.id
  and application.attempt_number is null;

alter table public.police_applications
  alter column attempt_number set not null,
  add constraint police_applications_attempt_number_positive check (attempt_number > 0);

create unique index if not exists police_applications_user_attempt_unique
  on public.police_applications (discord_user_id, attempt_number);

create or replace function public.submit_police_application(
  p_discord_user_id text,
  p_discord_username text,
  p_full_name text,
  p_previous_experience text,
  p_motivation text,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_count integer;
  next_attempt integer;
  created_application public.police_applications;
begin
  if p_discord_user_id !~ '^[0-9]{17,20}$' then
    return jsonb_build_object('ok', false, 'message', 'No se pudo validar tu usuario de Discord.');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_discord_user_id, 0));

  if exists (select 1 from public.police_applications where discord_user_id = p_discord_user_id and status = 'accepted') then
    return jsonb_build_object('ok', false, 'already_accepted', true, 'message', 'Ya formas parte de PRIME POLICE.');
  end if;

  if exists (select 1 from public.police_applications where discord_user_id = p_discord_user_id and status = 'pending') then
    return jsonb_build_object('ok', false, 'pending', true, 'message', 'Ya tienes una postulación pendiente de revisión.');
  end if;

  select count(*) into existing_count
  from public.police_applications
  where discord_user_id = p_discord_user_id;

  if existing_count >= 3 then
    return jsonb_build_object('ok', false, 'limit_reached', true, 'attempts_used', existing_count, 'message', 'Has alcanzado el máximo de 3 intentos de postulación.');
  end if;

  next_attempt := existing_count + 1;
  insert into public.police_applications (
    discord_user_id, discord_username, full_name, age, previous_experience,
    motivation, availability, answers, status, discord_guild_id, attempt_number
  ) values (
    p_discord_user_id, coalesce(p_discord_username, ''), coalesce(p_full_name, ''), null,
    coalesce(p_previous_experience, ''), coalesce(p_motivation, ''), '',
    coalesce(p_answers, '{}'::jsonb), 'pending', '1539970134469378068', next_attempt
  ) returning * into created_application;

  return jsonb_build_object(
    'ok', true,
    'attempt_number', next_attempt,
    'attempts_remaining', 3 - next_attempt,
    'application', to_jsonb(created_application)
  );
end;
$$;

revoke all on function public.submit_police_application(text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_police_application(text, text, text, text, text, jsonb) to service_role;

alter table public.police_personnel
  add column if not exists name_ooc text not null default '',
  add column if not exists unit text not null default 'UCOP';

update public.police_personnel
set name_ooc = discord_username
where name_ooc = '';

comment on column public.police_personnel.unit is
  'Prime Police administrative unit recorded in this personnel registry.';

comment on column public.police_applications.attempt_number is
  'Sequential application attempt for this Discord user; new applications are capped at three.';
