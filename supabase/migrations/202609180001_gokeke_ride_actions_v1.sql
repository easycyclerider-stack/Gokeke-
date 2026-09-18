create or replace function public.request_ride(
  p_passenger_id uuid,p_vehicle_type public.vehicle_type,p_pickup_address text,p_destination_address text,
  p_pickup_lat double precision,p_pickup_long double precision,p_destination_lat double precision,p_destination_long double precision,
  p_estimated_distance_km numeric,p_estimated_duration_minutes integer,p_payment_method public.payment_method default 'cash'
) returns public.rides language plpgsql security invoker set search_path=public as $$
declare v_ride public.rides; v_fare record;
begin
 if auth.uid() is null or auth.uid()<>p_passenger_id then raise exception 'Unauthorized'; end if;
 select * into v_fare from public.calculate_ride_fare(p_vehicle_type,p_estimated_distance_km,p_estimated_duration_minutes);
 insert into public.rides(passenger_id,vehicle_type,status,pickup_address,destination_address,pickup_location,destination_location,estimated_distance_km,estimated_duration_minutes,estimated_fare,payment_method)
 values(p_passenger_id,p_vehicle_type,'requested',p_pickup_address,p_destination_address,
 st_setsrid(st_makepoint(p_pickup_long,p_pickup_lat),4326)::geography,st_setsrid(st_makepoint(p_destination_long,p_destination_lat),4326)::geography,
 p_estimated_distance_km,p_estimated_duration_minutes,v_fare.fare,p_payment_method) returning * into v_ride;
 insert into public.ride_events(ride_id,actor_id,status) values(v_ride.id,p_passenger_id,'requested'); return v_ride;
end $$;

create or replace function public.accept_ride(p_ride_id uuid,p_driver_id uuid,p_vehicle_id uuid)
returns public.rides language plpgsql security invoker set search_path=public as $$
declare v_ride public.rides;
begin
 if auth.uid() is null or auth.uid()<>p_driver_id then raise exception 'Unauthorized'; end if;
 update public.rides set driver_id=p_driver_id,vehicle_id=p_vehicle_id,status='driver_assigned',accepted_at=now(),updated_at=now()
 where id=p_ride_id and status='requested' returning * into v_ride;
 if v_ride.id is null then raise exception 'Ride unavailable'; end if;
 insert into public.ride_events(ride_id,actor_id,status) values(v_ride.id,p_driver_id,'driver_assigned'); return v_ride;
end $$;

create or replace function public.update_ride_status(p_ride_id uuid,p_actor_id uuid,p_status public.ride_status,p_reason text default null)
returns public.rides language plpgsql security invoker set search_path=public as $$
declare v_ride public.rides;
begin
 if auth.uid() is null or auth.uid()<>p_actor_id then raise exception 'Unauthorized'; end if;
 update public.rides set status=p_status,cancellation_reason=case when p_status='cancelled' then p_reason else cancellation_reason end,
 started_at=case when p_status='in_progress' then coalesce(started_at,now()) else started_at end,
 completed_at=case when p_status='completed' then coalesce(completed_at,now()) else completed_at end,
 cancelled_at=case when p_status='cancelled' then coalesce(cancelled_at,now()) else cancelled_at end,
 final_fare=case when p_status='completed' then coalesce(final_fare,estimated_fare) else final_fare end,updated_at=now()
 where id=p_ride_id and (passenger_id=p_actor_id or driver_id=p_actor_id) returning * into v_ride;
 if v_ride.id is null then raise exception 'Ride not found or unauthorized'; end if;
 insert into public.ride_events(ride_id,actor_id,status,metadata) values(v_ride.id,p_actor_id,p_status,jsonb_build_object('reason',p_reason)); return v_ride;
end $$;

grant execute on function public.request_ride(uuid,public.vehicle_type,text,text,double precision,double precision,double precision,double precision,numeric,integer,public.payment_method) to authenticated;
grant execute on function public.accept_ride(uuid,uuid,uuid) to authenticated;
grant execute on function public.update_ride_status(uuid,uuid,public.ride_status,text) to authenticated;