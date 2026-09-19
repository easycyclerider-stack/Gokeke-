-- GoKeke driver verification controls
create or replace function public.set_driver_online(p_online boolean)
returns public.drivers language plpgsql security definer set search_path=public as $$
declare d public.drivers;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 select * into d from drivers where id=auth.uid() for update;
 if not found then raise exception 'Driver profile not found'; end if;
 if p_online and d.status<>'approved' then raise exception 'Driver verification required before going online'; end if;
 update drivers set is_online=p_online,updated_at=now() where id=auth.uid() returning * into d;
 return d;
end $$;
revoke all on function public.set_driver_online(boolean) from public;
grant execute on function public.set_driver_online(boolean) to authenticated;

create or replace function public.submit_driver_application(p_license_number text,p_license_document_url text,p_id_document_url text)
returns public.driver_applications language plpgsql security invoker set search_path=public as $$
declare a public.driver_applications;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 if not exists(select 1 from profiles where id=auth.uid() and role='driver') then raise exception 'Driver profile required'; end if;
 insert into drivers(id,license_number,license_document_url,id_document_url,status,is_online,updated_at)
 values(auth.uid(),nullif(trim(p_license_number),''),nullif(trim(p_license_document_url),''),nullif(trim(p_id_document_url),''),'pending',false,now())
 on conflict(id) do update set license_number=excluded.license_number,license_document_url=excluded.license_document_url,id_document_url=excluded.id_document_url,status='pending',is_online=false,updated_at=now();
 insert into driver_applications(id) values(auth.uid()) on conflict(id) do update set submitted_at=now(),reviewed_at=null,reviewed_by=null,notes=null returning * into a;
 return a;
end $$;
revoke all on function public.submit_driver_application(text,text,text) from public;
grant execute on function public.submit_driver_application(text,text,text) to authenticated;

create or replace function public.admin_review_driver(p_driver_id uuid,p_status public.driver_status,p_notes text)
returns public.drivers language plpgsql security definer set search_path=public as $$
declare d public.drivers;
begin
 if auth.uid() is null or not exists(select 1 from profiles where id=auth.uid() and role='admin') then raise exception 'Admin access required'; end if;
 select * into d from drivers where id=p_driver_id for update;
 if not found then raise exception 'Driver not found'; end if;
 update drivers set status=p_status,is_online=case when p_status='approved' then is_online else false end,verified_at=case when p_status='approved' then now() else null end,updated_at=now() where id=p_driver_id returning * into d;
 update driver_applications set reviewed_at=now(),reviewed_by=auth.uid(),notes=p_notes where id=p_driver_id;
 insert into notifications(user_id,title,body,type,data) values(p_driver_id,'Driver verification update',coalesce(p_notes,'Your driver verification status is now '||p_status::text),'driver_verification',jsonb_build_object('status',p_status));
 insert into admin_audit_log(admin_id,action,target_type,target_id,metadata) values(auth.uid(),'driver_review','driver',p_driver_id,jsonb_build_object('status',p_status,'notes',p_notes));
 return d;
end $$;
revoke all on function public.admin_review_driver(uuid,public.driver_status,text) from public;
grant execute on function public.admin_review_driver(uuid,public.driver_status,text) to authenticated;