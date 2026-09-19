-- Fully verified driver invariant
create or replace function public.driver_is_fully_verified(p_driver_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.drivers d
 where d.id=p_driver_id and d.status='approved'
 and d.license_number is not null
 and nullif(trim(d.license_document_url),'') is not null
 and nullif(trim(d.id_document_url),'') is not null
 and exists(select 1 from public.vehicles v where v.driver_id=d.id and v.is_active=true));
$$;
revoke all on function public.driver_is_fully_verified(uuid) from public;
grant execute on function public.driver_is_fully_verified(uuid) to authenticated;

create or replace function public.set_driver_online(p_online boolean)
returns public.drivers language plpgsql security definer set search_path=public as $$
declare d public.drivers;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 select * into d from drivers where id=auth.uid() for update;
 if not found then raise exception 'Driver profile not found'; end if;
 if p_online and not public.driver_is_fully_verified(auth.uid()) then raise exception 'Complete driver and vehicle verification before going online'; end if;
 update drivers set is_online=p_online,updated_at=now() where id=auth.uid() returning * into d;
 return d;
end $$;
revoke all on function public.set_driver_online(boolean) from public;
grant execute on function public.set_driver_online(boolean) to authenticated;

create or replace function public.nearby_available_drivers(p_lat double precision,p_long double precision,p_vehicle_type public.vehicle_type,p_radius_meters double precision default 5000)
returns table(driver_id uuid,vehicle_id uuid,vehicle_type public.vehicle_type,distance_meters double precision)
language sql stable security invoker set search_path=public as $$
 select d.id,v.id,v.type,st_distance(d.current_location,st_point(p_long,p_lat)::geography)
 from public.drivers d join public.vehicles v on v.driver_id=d.id
 where public.driver_is_fully_verified(d.id) and d.is_online=true and d.current_location is not null
 and v.is_active=true and v.type=p_vehicle_type
 and st_dwithin(d.current_location,st_point(p_long,p_lat)::geography,p_radius_meters)
 order by d.current_location operator(<->) st_point(p_long,p_lat)::geography;
$$;
revoke all on function public.nearby_available_drivers(double precision,double precision,public.vehicle_type,double precision) from public;
grant execute on function public.nearby_available_drivers(double precision,double precision,public.vehicle_type,double precision) to authenticated;

create or replace function public.accept_ride(p_ride_id uuid,p_driver_id uuid,p_vehicle_id uuid)
returns public.rides language plpgsql security definer set search_path=public as $$
declare r public.rides;
begin
 if auth.uid() is null or auth.uid()<>p_driver_id then raise exception 'Not authorized'; end if;
 if not public.driver_is_fully_verified(p_driver_id) then raise exception 'Driver verification is incomplete'; end if;
 if not exists(select 1 from drivers where id=p_driver_id and is_online) then raise exception 'Driver is offline'; end if;
 if not exists(select 1 from vehicles where id=p_vehicle_id and driver_id=p_driver_id and is_active) then raise exception 'Invalid active vehicle'; end if;
 select * into r from rides where id=p_ride_id for update;
 if not found or r.status<>'requested' then raise exception 'Ride is no longer available'; end if;
 if not exists(select 1 from ride_offers where ride_id=p_ride_id and driver_id=p_driver_id and vehicle_id=p_vehicle_id and status='pending' and expires_at>now()) then raise exception 'Ride offer expired or unavailable'; end if;
 update rides set driver_id=p_driver_id,vehicle_id=p_vehicle_id,status='driver_assigned',accepted_at=now(),updated_at=now() where id=p_ride_id returning * into r;
 update ride_offers set status='accepted',responded_at=now() where ride_id=p_ride_id and driver_id=p_driver_id;
 update ride_offers set status='expired',responded_at=coalesce(responded_at,now()) where ride_id=p_ride_id and driver_id<>p_driver_id and status='pending';
 insert into ride_events(ride_id,actor_id,status,metadata) values(r.id,p_driver_id,'driver_assigned',jsonb_build_object('vehicle_id',p_vehicle_id));
 insert into notifications(user_id,title,body,type,data) values(r.passenger_id,'Driver matched','A fully verified GoKeke driver accepted your ride.','ride_assigned',jsonb_build_object('ride_id',r.id,'driver_id',p_driver_id));
 return r;
end $$;
revoke all on function public.accept_ride(uuid,uuid,uuid) from public;
grant execute on function public.accept_ride(uuid,uuid,uuid) to authenticated;