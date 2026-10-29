-- Only the authenticated server may remove duty records; anonymous clients retain no access.
grant delete on public.police_duty_shifts to service_role;
