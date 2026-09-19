-- GoKeke dispatch guardrails
-- Dispatch already uses nearby_available_drivers(), which requires:
-- 1) driver status = approved
-- 2) driver is_online = true
-- 3) driver has a current GPS location
-- 4) matching active vehicle
-- accept_ride() independently re-checks all four conditions plus the pending offer.
-- This migration makes the intended production invariant explicit and removes anonymous execution
-- from the dispatch lookup so it cannot be used as a public data-discovery endpoint.
revoke execute on function public.nearby_available_drivers(double precision,double precision,public.vehicle_type,double precision) from anon;
grant execute on function public.nearby_available_drivers(double precision,double precision,public.vehicle_type,double precision) to authenticated;
