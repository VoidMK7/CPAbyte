create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  referral_code text not null unique default upper(substr(encode(gen_random_bytes(6),'hex'),1,8)),
  role text not null default 'user' check (role in ('user','moderator','admin')),
  status text not null default 'active' check (status in ('active','suspended','banned')),
  xp integer not null default 0 check (xp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  category text not null check (category in ('social','telegram','community','apps','websites','content','offers','daily','special_events')),
  reward numeric(12,4) not null check (reward > 0),
  slots integer check (slots is null or slots >= 0),
  duration_seconds integer not null default 60 check (duration_seconds >= 0),
  proof_required boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.task_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'started' check (status in ('started','submitted','under_review','pending_admin','approved','rejected','completed')),
  proof_urls text[] not null default '{}',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('task_reward','referral_reward','referral_bonus','daily_checkin','bonus','withdrawal','withdrawal_fee','withdrawal_reversal','admin_reward','reviewer_reward','penalty')),
  amount numeric(18,6) not null check (amount <> 0),
  reference_id text not null,
  description text,
  status text not null default 'completed' check (status in ('pending','completed','reversed','failed')),
  created_at timestamptz not null default now(),
  unique(user_id, reference_id)
);

create table if not exists public.telegram_contacts (
  telegram_id text primary key,
  username text,
  first_name text,
  last_name text,
  welcome_sent boolean not null default false,
  channel_member boolean not null default false,
  referral_code text,
  linked_user_id uuid references public.profiles(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references public.profiles(id) on delete cascade,
  referred_user_id uuid not null unique references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','active','rewarded')),
  pending_commission numeric(18,6) not null default 0,
  released_commission numeric(18,6) not null default 0,
  unlocked boolean not null default false,
  created_at timestamptz not null default now(),
  unique(referrer_user_id, referred_user_id)
);

create table if not exists public.channel_member_events (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null,
  user_id uuid references public.profiles(id) on delete set null,
  channel_id text not null,
  event_type text not null check (event_type in ('joined','left','kicked','banned','unbanned','updated')),
  member_status text,
  occurred_at timestamptz not null default now()
);

create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  method text not null check (method in ('bank_ngn','usdt_trc20','usdt_ton')),
  amount numeric(18,6) not null check (amount > 0),
  destination text not null,
  status text not null default 'pending' check (status in ('pending','processing','approved','rejected','paid')),
  ngn_rate numeric(18,6),
  created_at timestamptz not null default now()
);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, username) values (new.id, coalesce(new.raw_user_meta_data->>'user_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure private.handle_new_user();
revoke all on function private.handle_new_user() from public, anon, authenticated;

create or replace function public.credit_reward(
  p_user_id uuid,
  p_amount numeric,
  p_type text,
  p_reference_id text,
  p_description text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  tx public.transactions;
begin
  if p_amount <= 0 then raise exception 'Reward amount must be positive'; end if;
  if length(p_reference_id) = 0 then raise exception 'Reference ID is required'; end if;
  insert into public.transactions(user_id,type,amount,reference_id,description)
  values (p_user_id,p_type,p_amount,p_reference_id,p_description)
  on conflict (user_id,reference_id) do nothing
  returning * into tx;
  if tx.id is not null then
    return jsonb_build_object('id',tx.id,'amount',tx.amount,'reference_id',tx.reference_id,'status',tx.status,'duplicate',false);
  end if;
  select * into tx from public.transactions where user_id=p_user_id and reference_id=p_reference_id;
  return jsonb_build_object('id',tx.id,'amount',tx.amount,'reference_id',tx.reference_id,'status',tx.status,'duplicate',true);
end;
$$;
revoke all on function public.credit_reward(uuid,numeric,text,text,text) from public, anon, authenticated;
grant execute on function public.credit_reward(uuid,numeric,text,text,text) to service_role;

create or replace view public.wallet_balances with (security_invoker=true) as
select user_id, coalesce(sum(case when status='completed' then amount else 0 end),0)::numeric as balance
from public.transactions group by user_id;
revoke all on public.wallet_balances from public, anon;
grant select on public.wallet_balances to authenticated;

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_submissions enable row level security;
alter table public.transactions enable row level security;
alter table public.telegram_contacts enable row level security;
alter table public.channel_member_events enable row level security;
alter table public.referrals enable row level security;
alter table public.withdrawals enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);

drop policy if exists tasks_select_active on public.tasks;
create policy tasks_select_active on public.tasks for select to authenticated using (active = true);

drop policy if exists submissions_select_own on public.task_submissions;
create policy submissions_select_own on public.task_submissions for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists submissions_insert_own on public.task_submissions;
create policy submissions_insert_own on public.task_submissions for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own on public.transactions for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists withdrawals_select_own on public.withdrawals;
create policy withdrawals_select_own on public.withdrawals for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists withdrawals_insert_own on public.withdrawals;
create policy withdrawals_insert_own on public.withdrawals for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists referrals_select_own on public.referrals;
create policy referrals_select_own on public.referrals for select to authenticated using ((select auth.uid()) = referrer_user_id or (select auth.uid()) = referred_user_id);

drop policy if exists telegram_select_linked on public.telegram_contacts;
create policy telegram_select_linked on public.telegram_contacts for select to authenticated using ((select auth.uid()) = linked_user_id);

-- Explicit Data API grants. New Supabase projects no longer guarantee automatic exposure
-- of newly-created public tables, so grants are declared alongside RLS policies.
grant usage on schema public to authenticated, service_role;
grant select on public.profiles, public.tasks, public.task_submissions, public.transactions, public.telegram_contacts, public.channel_member_events, public.referrals, public.withdrawals to authenticated;
grant insert on public.task_submissions, public.withdrawals to authenticated;
grant all on public.profiles, public.tasks, public.task_submissions, public.transactions, public.telegram_contacts, public.channel_member_events, public.referrals, public.withdrawals to service_role;
grant select on public.wallet_balances to authenticated, service_role;

-- No public client policy exists for transaction INSERT/UPDATE/DELETE.
-- Financial mutations are performed by trusted server code using the service-role key
-- and the idempotent function above.
