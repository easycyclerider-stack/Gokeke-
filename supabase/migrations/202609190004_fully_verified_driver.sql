-- Single source of truth for verified dispatch eligibility
create or replace view public.verified_driver_dispatch as
select d.id as driver_id,v.id as vehicle_id,v.type as vehicle_type,d.current_location
from public.drivers d join public.vehicles v on v.driver_id=d.id and v.is_active=true
where d.status='approved' and d.verified_at is not null and d.is_online=true and d.current_location is not null;
revoke all on public.verified_driver_dispatch from anon;
grant select on public.verified_driver_dispatch to authenticated;

create or replace function public.is_driver_fully_verified(p_driver_id uuid)
returns boolean language sql stable security invoker set search_path=public as $$
select exists(select 1 from public.verified_driver_dispatch where driver_id=p_driver_id);
$$;
revoke all on function public.is_driver_fully_verified(uuid) from public;
grant execute on function public.is_driver_fully_verified(uuid) to authenticated;