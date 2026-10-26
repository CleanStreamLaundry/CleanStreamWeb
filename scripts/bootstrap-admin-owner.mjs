#!/usr/bin/env node
/** Print reviewed operator SQL only; never connect, create accounts or send mail. */
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    locations: { type: "string", default: "" },
    apply: { type: "boolean", default: false },
  },
});
if (values.apply) {
  throw new Error("--apply is retired. Review the generated SQL and run it as the trusted database operator.");
}
const email = values.email?.trim().toLowerCase();
const hasControlCharacter = [...(email ?? "")].some((character) => {
  const code = character.charCodeAt(0);
  return code < 32 || code === 127;
});
if (!email || email.length > 254 || hasControlCharacter || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("Provide --email for the explicitly approved existing Auth account.");
}
const ids = values.locations
  ? [...new Set(values.locations.split(",").map(Number))]
  : [];
if (!ids.every((id) => Number.isSafeInteger(id) && id > 0)) {
  throw new Error("--locations must contain positive numeric location IDs.");
}
const emailLiteral = "'" + email.replaceAll("'", "''") + "'";
console.log(`-- Review for Clean Stream project dnuuhupoxjtwqzaqylvb only.
-- Initial Owner only. Additional Owners use the MFA-protected audited portal.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local standard_conforming_strings=on;
set local cleanstream.bootstrap_email=${emailLiteral};
do $$
declare target uuid; prior_role text; approved_email text:=current_setting('cleanstream.bootstrap_email');
begin
  if current_user<>'postgres' then raise exception 'Trusted operator required'; end if;
  perform pg_advisory_xact_lock(814716290);
  if (select count(*) from auth.users where lower(email)=approved_email)<>1 then
    raise exception 'Approved existing Auth account is missing or ambiguous';
  end if;
  select id into strict target from auth.users
    where lower(email)=approved_email and deleted_at is null
      and coalesce(is_anonymous,false)=false
      and (banned_until is null or banned_until<=clock_timestamp()) for update;
  if exists(select 1 from private.account_lifecycle where user_id=target and restored_at is null) then
    raise exception 'Approved account has a pending deletion';
  end if;
  select roles::text into prior_role from public.profiles where id=target for update;
  perform public.admin_portal_bootstrap_owner(target,ARRAY[${ids.join(",")}]::bigint[]);
  if prior_role is distinct from 'Owner' then
    insert into public.admin_audit_events(actor_id,actor_name,entity,entity_id,operation,before_values,after_values)
    values(null,'Trusted database operator','owner_bootstrap',target::text,'bootstrap',
      jsonb_build_object('role',prior_role),
      jsonb_build_object('role','Owner','authorization','Explicit initial-Owner approval','email',approved_email));
  end if;
end $$;
commit;`);
