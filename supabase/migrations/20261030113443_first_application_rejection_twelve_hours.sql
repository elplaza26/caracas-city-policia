-- Rejections start the cooldown at review time, never at submission time.
-- Keep the per-user transaction lock and three-attempt cap.
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
security invoker
set search_path = public, pg_temp
as $$
declare
  existing_count integer;
  next_attempt integer;
  rejection_count integer;
  last_rejected_at timestamptz;
  retry_at timestamptz;
  wait_hours integer;
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

  select count(*), max(coalesce(reviewed_at, created_at))
  into rejection_count, last_rejected_at
  from public.police_applications
  where discord_user_id = p_discord_user_id and status = 'rejected';

  if rejection_count > 0 then
    wait_hours := case when rejection_count = 1 then 12 else 48 end;
    retry_at := last_rejected_at + make_interval(hours => wait_hours);
    if clock_timestamp() < retry_at then
      return jsonb_build_object(
        'ok', false, 'cooldown', true, 'retry_at', retry_at,
        'wait_hours', wait_hours, 'attempts_used', existing_count,
        'retry_after_seconds', ceil(extract(epoch from (retry_at - clock_timestamp()))),
        'message', 'Tras el ' || case when rejection_count = 1 then 'primer' else 'segundo' end ||
          ' rechazo debes esperar ' || wait_hours || ' horas antes de volver a postularte.'
      );
    end if;
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

