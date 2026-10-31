create view public.police_rejected_ai_applications with (security_invoker=true) as
select a.*,r.verdict as ai_review_verdict,r.note as ai_review_note,
 r.reviewed_by_name as ai_reviewed_by_name,r.reviewed_by_discord_id as ai_reviewed_by_discord_id,
 r.created_at as ai_reviewed_at
from public.police_applications a
join lateral (
 select verdict,note,reviewed_by_name,reviewed_by_discord_id,created_at
 from public.police_application_reviews where application_id=a.id
 order by created_at desc,id desc limit 1
) r on true
where a.status='rejected' and r.verdict in ('suspected_ai','declared_ai');
revoke all on public.police_rejected_ai_applications from public,anon,authenticated,service_role;
grant select on public.police_rejected_ai_applications to service_role;
