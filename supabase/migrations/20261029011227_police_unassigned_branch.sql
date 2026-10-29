alter table public.police_personnel alter column unit set default 'POLICIA';
alter table public.police_duty_shifts drop constraint if exists police_duty_shifts_unit_check;
alter table public.police_duty_shifts add constraint police_duty_shifts_unit_check check(unit in ('POLICIA','UCOP','CIC'));
create or replace function public.police_duty_summary(p_from timestamptz,p_to timestamptz)
returns table(discord_user_id text,full_name text,plate text,unit text,rank_name text,rank_role_id text,shift_count bigint,service_seconds numeric,last_activity timestamptz,open_since timestamptz)
language sql stable security invoker set search_path=public
as $$
 select p.discord_user_id,p.full_name,p.plate,p.unit,p.rank_name,p.rank_role_id,
 count(s.id) filter(where s.started_at<p_to and coalesce(s.ended_at,now())>=p_from),
 coalesce(sum(greatest(0,extract(epoch from (least(coalesce(s.ended_at,now()),p_to)-greatest(s.started_at,p_from))))) filter(where s.started_at<p_to and coalesce(s.ended_at,now())>=p_from),0),
 max(coalesce(s.ended_at,case when s.id is not null then now() end)),min(s.started_at) filter(where s.id is not null and s.ended_at is null)
 from public.police_personnel p left join public.police_duty_shifts s on s.discord_user_id=p.discord_user_id
 where p.status='active' and p.unit in ('POLICIA','UCOP','CIC')
 group by p.discord_user_id,p.full_name,p.plate,p.unit,p.rank_name,p.rank_role_id;
$$;
revoke all on function public.police_duty_summary(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.police_duty_summary(timestamptz,timestamptz) to service_role;
