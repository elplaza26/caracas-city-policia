-- A decorative '#' must not make an existing numeric plate sort after the roster.
-- Preserve its number; only normalize its display/storage format.
update public.police_personnel
set plate=lpad(regexp_replace(trim(plate),'^#[[:space:]]*','')::numeric::text,
 greatest(4,length(regexp_replace(trim(plate),'^#[[:space:]]*','')::numeric::text)),'0')
where trim(plate) ~ '^#[[:space:]]*[0-9]+$';
