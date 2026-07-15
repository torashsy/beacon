-- Remove the unused per-link thumbnail while keeping private click analytics.

alter table channels drop column if exists img_url;

create or replace function save_channels(p_handle text, p_pass text, p_channels jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  if jsonb_typeof(p_channels) <> 'array' then raise exception 'invalid channels'; end if;
  if jsonb_array_length(p_channels) > 50 then raise exception 'too many channels'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_channels) c
    where length(coalesce(c->>'url',''))   > 2000
       or length(coalesce(c->>'label','')) > 100
       or length(coalesce(c->>'desc',''))  > 300
  ) then
    raise exception 'field too long';
  end if;
  delete from channels where handle=lower(p_handle);
  insert into channels(handle,type,url,label,descr,status,position)
  select lower(p_handle), c->>'type', c->>'url',
         coalesce(c->>'label',''), coalesce(c->>'desc',''),
         coalesce(c->>'status','live'), (row_number() over ())::int
  from jsonb_array_elements(p_channels) c;
  update accounts set updated_at=now() where handle=lower(p_handle);
end $$;

revoke all on function save_channels(text,text,jsonb) from public, authenticated;
grant execute on function save_channels(text,text,jsonb) to anon;
