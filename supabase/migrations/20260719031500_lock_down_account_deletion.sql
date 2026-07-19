-- Prevent browser clients from bypassing Storage cleanup by invoking the
-- legacy database deletion RPC directly.
revoke all on function delete_account(text, text) from public, anon, authenticated;
grant execute on function delete_account(text, text) to service_role;
