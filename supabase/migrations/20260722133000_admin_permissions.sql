-- The admin Edge Function uses the service role, but these tables had their
-- table privileges revoked explicitly. Grant only what the admin UI reads;
-- mutations continue to go through the existing security-definer functions.
grant select on table public.accounts to service_role;
grant select on table public.account_moderation to service_role;
grant select on table public.contact_submissions to service_role;

grant execute on function public.set_account_suspension(text, boolean, text) to service_role;
grant execute on function public.set_contact_status(uuid, text, text) to service_role;
