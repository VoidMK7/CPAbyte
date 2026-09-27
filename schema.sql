create extension if not exists pgcrypto;

do $$ begin create type public.user_role as enum ('user','reviewer','moderator','admin'); exception when duplicate_object then null; end $$;
do $$ begin create type public.account_status as enum ('active','suspended','deactivated','banned'); exception when duplicate_object then null; end $$;
do $$ begin create type public.proof_status as enum ('pending','approved','rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type public.withdrawal_status as enum ('pending','processing','paid','rejected'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
 id uuid primary key default gen_random_uuid(), telegram_id text unique not null, telegram_username text, first_name text, last_name text, avatar_url text,
 app_username text unique, role public.user_role not null default 'user', status public.account_status not null default 'active',
 trust_score numeric(5,2) not null default 100, xp integer not null default 0, level integer not null default 0, hillscoin numeric(18,2) not null default 0,
 balance numeric(18,8) not null default 0, streak integer not null default 0, longest_streak integer not null default 0, checkin_last_date date,
 suspension_count integer not null default 0, channel_member boolean not null default false, channel_checked_at timestamptz, first_withdrawal_at timestamptz, tasks_completed integer not null default 0,
 ads_watched integer not null default 0, can_post_media boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), last_seen_at timestamptz
);

create table if not exists public.settings (
 id boolean primary key default true, min_withdrawal_usdt numeric(18,8) not null default 1, min_bank_withdrawal_usd numeric(18,8) not null default 0.3,
 bank_fee_percent numeric(5,2) not null default 10, usd_ngn_rate numeric(18,4) not null default 1500, default_task_xp integer not null default 10,
 default_task_hillscoin numeric(18,2) not null default 2, seven_day_bonus_percent numeric(5,2) not null default 2, reviewer_percent numeric(5,2) not null default 5,
 ad_trust_reward numeric(5,2) not null default 2, ad_trust_reward_every integer not null default 10, referral_commission_percent numeric(5,2) not null default 20,
 referral_money_enabled boolean not null default false, referral_percent_enabled boolean not null default true, hashtag_penalty numeric(18,8) not null default 0.05,
 suspension_limit integer not null default 5, ai_system_instruction text, updated_at timestamptz not null default now()
);
insert into public.settings(id) values(true) on conflict do nothing;

create table if not exists public.tasks (
 id uuid primary key default gen_random_uuid(), title text not null, description text not null, reward_usd numeric(18,8) not null default 0,
 xp_reward integer not null default 10, hillscoin_reward numeric(18,2) not null default 2, sponsored_ad_required boolean not null default true,
 proof_required boolean not null default true, channel_required boolean not null default false, instructions text, status text not null default 'active',
 starts_at timestamptz, ends_at timestamptz, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.task_submissions (
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
 proof_text text, proof_url text, status public.proof_status not null default 'pending', rejection_reason text, reviewer_id uuid references public.profiles(id), submitted_at timestamptz not null default now(), reviewed_at timestamptz
);
create table if not exists public.ledger (
 id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id), kind text not null, amount numeric(18,8) not null default 0, currency text not null default 'USD',
 reference_type text, reference_id uuid, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.ads (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), provider text, external_id text, valid boolean not null default false, watched_at timestamptz not null default now()
);
create table if not exists public.referrals (
 id uuid primary key default gen_random_uuid(), referrer_id uuid not null references public.profiles(id), referred_id uuid not null references public.profiles(id), joined_channel boolean not null default false,
 completed_4_tasks boolean not null default false, reached_50_xp boolean not null default false, first_withdrawal boolean not null default false, commission_pending numeric(18,8) not null default 0,
 event_earnings numeric(18,8) not null default 0, created_at timestamptz not null default now(), unique(referrer_id,referred_id)
);
create table if not exists public.withdrawals (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), method text not null, network text, amount_usd numeric(18,8) not null,
 fee_usd numeric(18,8) not null default 0, fx_rate numeric(18,4), amount_ngn numeric(18,8), destination jsonb not null default '{}'::jsonb, status public.withdrawal_status not null default 'pending', admin_note text,
 created_at timestamptz not null default now(), processed_at timestamptz
);
create table if not exists public.events (
 id uuid primary key default gen_random_uuid(), title text not null, description text not null, banner_url text, use_3d_banner boolean not null default true,
 reward text, rules text, starts_at timestamptz, ends_at timestamptz, cta_label text, cta_url text, status text not null default 'draft', created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.event_participants (
 event_id uuid references public.events(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, status text not null default 'active', joined_at timestamptz not null default now(), primary key(event_id,user_id)
);
create table if not exists public.community_posts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), body text not null, media_url text, media_type text, deleted_at timestamptz,
 penalty_applied numeric(18,8) not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.community_comments (
 id uuid primary key default gen_random_uuid(), post_id uuid not null references public.community_posts(id) on delete cascade, user_id uuid not null references public.profiles(id), body text not null, created_at timestamptz not null default now()
);
create table if not exists public.suspensions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, reason text not null, starts_at timestamptz not null default now(), ends_at timestamptz, created_by uuid references public.profiles(id)
);
create table if not exists public.redeem_codes (
 id uuid primary key default gen_random_uuid(), code text unique not null, amount numeric(18,8) not null, capacity integer not null, redeemed_count integer not null default 0, active boolean not null default true, created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.redeem_redemptions (
 id uuid primary key default gen_random_uuid(), code_id uuid not null references public.redeem_codes(id), user_id uuid not null references public.profiles(id), amount numeric(18,8) not null, created_at timestamptz not null default now(), unique(code_id,user_id)
);
create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id), title text not null, body text not null, read_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.audit_logs (
 id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id), action text not null, target_user_id uuid references public.profiles(id), metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create or replace function public.apply_task_approval(p_submission uuid, p_reviewer uuid)
returns void language plpgsql security definer set search_path=public as $$
declare s task_submissions%rowtype; t tasks%rowtype; u profiles%rowtype; bonus numeric; begin
 select * into s from task_submissions where id=p_submission for update; if not found or s.status <> 'pending' then raise exception 'Submission not pending'; end if;
 select * into t from tasks where id=s.task_id; select * into u from profiles where id=s.user_id for update; if p_reviewer=s.user_id then raise exception 'Cannot review own task'; end if;
 select seven_day_bonus_percent into bonus from settings where id=true;
 update task_submissions set status='approved',reviewer_id=p_reviewer,reviewed_at=now() where id=p_submission;
 update profiles set balance=balance+(t.reward_usd*(1+case when streak>=7 then bonus/100 else 0 end)),xp=xp+t.xp_reward,hillscoin=hillscoin+t.hillscoin_reward,tasks_completed=tasks_completed+1,level=floor((xp+t.xp_reward)/100)::int,updated_at=now() where id=s.user_id;
 insert into ledger(user_id,kind,amount,currency,reference_type,reference_id) values(s.user_id,'task_reward',t.reward_usd,'USD','task_submission',p_submission);
end $$;

create or replace function public.apply_task_rejection(p_submission uuid,p_reviewer uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
begin update task_submissions set status='rejected',rejection_reason=nullif(trim(p_reason),''),reviewer_id=p_reviewer,reviewed_at=now() where id=p_submission and status='pending'; update profiles set xp=greatest(0,xp-2),trust_score=greatest(0,trust_score-0.5),updated_at=now() where id=(select user_id from task_submissions where id=p_submission); end $$;

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_submissions enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.events enable row level security;
alter table public.event_participants enable row level security;


create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
drop trigger if exists profiles_updated_at on public.profiles; create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists settings_updated_at on public.settings; create trigger settings_updated_at before update on public.settings for each row execute function public.set_updated_at();

-- Production note: server-side service-role route handlers perform privileged mutations. Add user JWT policies when wiring a client-auth session.
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='tasks' and policyname='tasks public read') then create policy "tasks public read" on public.tasks for select using (status='active'); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='community_posts' and policyname='community public read') then create policy "community public read" on public.community_posts for select using (deleted_at is null); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='community_comments' and policyname='comments public read') then create policy "comments public read" on public.community_comments for select using (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='events' and policyname='events public read') then create policy "events public read" on public.events for select using (status='active'); end if; end $$;
