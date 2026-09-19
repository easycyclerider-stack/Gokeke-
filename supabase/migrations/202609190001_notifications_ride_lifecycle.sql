-- GoKeke ride lifecycle notifications and nearest-driver dispatch
-- Applied to the connected GoKeke Supabase project.

create or replace function public.request_ride(p_passenger_id uuid,p_vehicle_type public.vehicle_type,p_pickup_address text,p_destination_address text,p_pickup_lat double precision,p_pickup_long double precision,p_destination_lat double precision,p_destination_long double precision,p_estimated_distance_km numeric,p_estimated_duration_minutes integer,p_payment_method public.payment_method)
returns public.rides language plpgsql security definer set search_path=public as $$
declare r public.rides; d record; f numeric;
begin
 if auth.uid() is null or auth.uid()<>p_passenger_id then raise exception 'Not authorized'; end if;
 if exists(select 1 from rides where passenger_id=p_passenger_id and status in ('requested','driver_assigned','driver_arriving','driver_waiting','in_progress')) then raise exception 'You already have an active ride'; end if;
 select fare into f from calculate_ride_fare(p_vehicle_type,p_estimated_distance_km,p_estimated_duration_minutes);
 insert into rides(passenger_id,vehicle_type,pickup_address,destination_address,pickup_location,destination_location,estimated_distance_km,estimated_duration_minutes,estimated_fare,payment_method)
 values(p_passenger_id,p_vehicle_type,p_pickup_address,p_destination_address,st_setsrid(st_makepoint(p_pickup_long,p_pickup_lat),4326)::geography,st_setsrid(st_makepoint(p_destination_long,p_destination_lat),4326)::geography,p_estimated_distance_km,p_estimated_duration_minutes,f,p_payment_method) returning * into r;
 insert into ride_events(ride_id,actor_id,status,metadata) values(r.id,p_passenger_id,'requested',jsonb_build_object('dispatch','nearest_verified_online_driver'));
 for d in select * from nearby_available_drivers(p_pickup_lat,p_pickup_long,p_vehicle_type,5000) limit 5 loop
   insert into ride_offers(ride_id,driver_id,vehicle_id,distance_meters) values(r.id,d.driver_id,d.vehicle_id,d.distance_meters);
   insert into notifications(user_id,title,body,type,data) values(d.driver_id,'New GoKeke ride','A nearby passenger requested a ride. Open GoKeke to accept.','ride_offer',jsonb_build_object('ride_id',r.id,'distance_meters',d.distance_meters));
 end loop;
 return r;
end $$;

create or replace function public.accept_ride(p_ride_id uuid,p_driver_id uuid,p_vehicle_id uuid)
returns public.rides language plpgsql security definer set search_path=public as $$
declare r public.rides;
begin
 if auth.uid() is null or auth.uid()<>p_driver_id then raise exception 'Not authorized'; end if;
 if not exists(select 1 from drivers where id=p_driver_id and status='approved' and is_online) then raise exception 'Driver is not approved or online'; end if;
 if not exists(select 1 from vehicles where id=p_vehicle_id and driver_id=p_driver_id and is_active) then raise exception 'Invalid active vehicle'; end if;
 select * into r from rides where id=p_ride_id for update;
 if not found or r.status<>'requested' then raise exception 'Ride is no longer available'; end if;
 if not exists(select 1 from ride_offers where ride_id=p_ride_id and driver_id=p_driver_id and vehicle_id=p_vehicle_id and status='pending' and expires_at>now()) then raise exception 'Ride offer expired or unavailable'; end if;
 update rides set driver_id=p_driver_id,vehicle_id=p_vehicle_id,status='driver_assigned',accepted_at=now(),updated_at=now() where id=p_ride_id returning * into r;
 update ride_offers set status='accepted',responded_at=now() where ride_id=p_ride_id and driver_id=p_driver_id;
 update ride_offers set status='expired',responded_at=coalesce(responded_at,now()) where ride_id=p_ride_id and driver_id<>p_driver_id and status='pending';
 insert into ride_events(ride_id,actor_id,status,metadata) values(r.id,p_driver_id,'driver_assigned',jsonb_build_object('vehicle_id',p_vehicle_id));
 insert into notifications(user_id,title,body,type,data) values(r.passenger_id,'Driver matched','A verified GoKeke driver accepted your ride.','ride_assigned',jsonb_build_object('ride_id',r.id,'driver_id',p_driver_id));
 return r;
end $$;

create or replace function public.update_ride_status(p_ride_id uuid,p_status public.ride_status)
returns public.rides language plpgsql security definer set search_path=public as $$
declare r public.rides; old public.ride_status;
begin
 if auth.uid() is null then raise exception 'Not authorized'; end if;
 select * into r from rides where id=p_ride_id for update;
 if not found or auth.uid()<>r.driver_id then raise exception 'Unauthorized'; end if;
 old:=r.status;
 if (p_status='driver_arriving' and old<>'driver_assigned') or (p_status='driver_waiting' and old<>'driver_arriving') or (p_status='in_progress' and old<>'driver_waiting') then raise exception 'Invalid transition'; end if;
 update rides set status=p_status,started_at=case when p_status='in_progress' then now() else started_at end,updated_at=now() where id=p_ride_id returning * into r;
 insert into ride_events(ride_id,actor_id,status,metadata) values(r.id,auth.uid(),p_status,jsonb_build_object('from',old));
 insert into notifications(user_id,title,body,type,data) values(r.passenger_id,case p_status when 'driver_arriving' then 'Driver is on the way' when 'driver_waiting' then 'Driver has arrived' else 'Trip started' end,case p_status when 'driver_arriving' then 'Your GoKeke driver is heading to pickup.' when 'driver_waiting' then 'Your driver has arrived at pickup.' else 'Your GoKeke trip is now in progress.' end,'ride_status',jsonb_build_object('ride_id',r.id,'status',p_status));
 return r;
end $$;

create or replace function public.complete_ride_and_record_earnings(p_ride_id uuid,p_driver_id uuid,p_final_fare numeric)
returns public.rides language plpgsql security definer set search_path=public as $$
declare r public.rides%rowtype; commission numeric; earnings numeric;
begin
 if auth.uid()<>p_driver_id then raise exception 'Unauthorized'; end if;
 if p_final_fare<=0 then raise exception 'Fare must be positive'; end if;
 select * into r from rides where id=p_ride_id and driver_id=p_driver_id for update;
 if not found or r.status<>'in_progress' then raise exception 'Ride is not in progress'; end if;
 commission:=round(p_final_fare*coalesce((select platform_commission_percent from fare_settings where vehicle_type=r.vehicle_type),15)/100,2); earnings:=p_final_fare-commission;
 update rides set status='completed',final_fare=p_final_fare,platform_commission=commission,driver_earnings=earnings,completed_at=now(),updated_at=now() where id=r.id returning * into r;
 if not exists(select 1 from wallet_transactions where ride_id=r.id and type='credit' and reference='ride:'||r.id) then perform credit_driver_wallet(p_driver_id,r.id,earnings); end if;
 insert into ride_receipts(ride_id,passenger_id,driver_id,subtotal,platform_commission,total) values(r.id,r.passenger_id,r.driver_id,p_final_fare,commission,p_final_fare) on conflict(ride_id) do update set subtotal=excluded.subtotal,platform_commission=excluded.platform_commission,total=excluded.total;
 insert into ride_events(ride_id,actor_id,status,metadata) values(r.id,p_driver_id,'completed',jsonb_build_object('fare',p_final_fare,'commission',commission,'driver_earnings',earnings));
 insert into notifications(user_id,title,body,type,data) values(r.passenger_id,'Ride completed','Your GoKeke trip is complete. Your final fare is NGN '||to_char(p_final_fare,'FM999,999,990.00')||'.','ride_completed',jsonb_build_object('ride_id',r.id,'fare',p_final_fare));
 return r;
end $$;
