-- HillsByte core schema. This is also applied to the connected Supabase project.
create extension if not exists pgcrypto;
create table if not exists public.users(
 id uuid primary key default gen_random_uuid(),telegram_id text unique not null,telegram_username text,first_name text,last_name text,
 display_username text,avatar_path text,status text not null default 'active',role text not null default 'user',
 suspension_count integer not null default 0,balance numeric(18,6) not null default 0,pending_balance numeric(18,6) not null default 0,
 debt numeric(18,6) not null default 0,hillscoin bigint not null default 0,xp integer not null default 0,level integer not null default 0,
 trust_score numeric(5,2) not null default 100,current_streak integer not null default 0,best_streak integer not null default 0,
 last_checkin_date date,first_withdrawal_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
create table if not exists public.settings(
 id boolean primary key default true check(id),checkin_rewards jsonb default '{"D1":0,"D2":0,"D3":0,"D4":0,"D5":0,"D6":0,"D7":0}',
 default_task_xp integer default 10,default_hillscoin integer default 2,rejection_xp_penalty integer default 2,rejection_trust_penalty numeric default .5,
 reviewer_threshold_xp integer default 100,reviewer_commission_percent numeric default 5,trust_event_min numeric default 70,trust_ad_only_min numeric default 50,
 trust_ad_reward_views integer default 10,trust_ad_reward numeric default 2,seven_day_task_bonus_percent numeric default 2,
 bank_withdrawal_fee_percent numeric default 10,bank_min_withdrawal numeric default .3,crypto_min_withdrawal numeric default 1,
 usd_ngn_rate numeric default 1500,referral_money_enabled boolean default true,referral_money_amount numeric default 0,
 referral_percent_enabled boolean default false,referral_percent numeric default 0,referral_requirements jsonb default '{"channel_join":true,"four_tasks":true,"fifty_xp":true,"first_withdrawal":true}',
 channel_username text,banned_hash_words text[] default '{}',ai_instructions text default '',default_event_banner text default '',updated_at timestamptz default now());
create table if not exists public.tasks(id uuid primary key default gen_random_uuid(),title text not null,short_description text default '',description text not null,task_url text,
reward numeric default 0,max_slots integer default 1000,daily_slots integer default 200,timer_seconds integer default 120,logo_url text,image_url text,
active boolean default true,sponsor_ad_required boolean default true,created_by uuid references public.users(id),created_at timestamptz default now());
create table if not exists public.task_attempts(id uuid primary key default gen_random_uuid(),task_id uuid references public.tasks(id),user_id uuid references public.users(id),
started_at timestamptz default now(),expires_at timestamptz,status text default 'started');
create table if not exists public.submissions(id uuid primary key default gen_random_uuid(),attempt_id uuid unique references public.task_attempts(id),task_id uuid references public.tasks(id),
user_id uuid references public.users(id),reviewer_id uuid references public.users(id),note text,proof_paths text[] default '{}',status text default 'under_review',
reject_reason text,created_at timestamptz default now(),reviewed_at timestamptz);
create table if not exists public.task_completions(id uuid primary key default gen_random_uuid(),submission_id uuid unique references public.submissions(id),
task_id uuid references public.tasks(id),user_id uuid references public.users(id),reward numeric default 0,xp integer default 0,hillscoin integer default 0,streak_bonus numeric default 0,
reviewer_commission numeric default 0,completed_at timestamptz default now());
create table if not exists public.activity_events(id uuid primary key default gen_random_uuid(),user_id uuid references public.users(id),type text,amount numeric default 0,xp_delta integer default 0,trust_delta numeric default 0,metadata jsonb default '{}',created_at timestamptz default now());
create table if not exists public.checkins(id uuid primary key default gen_random_uuid(),user_id uuid references public.users(id),day_index integer,checkin_date date default current_date,reward numeric default 0,checked_at timestamptz default now(),unique(user_id,checkin_date));
create table if not exists public.events(id uuid primary key default gen_random_uuid(),title text,description text default '',banner_url text,use_default_3d boolean default true,reward text,rules text,starts_at timestamptz,ends_at timestamptz,cta_label text,cta_url text,active boolean default true,created_by uuid references public.users(id),created_at timestamptz default now());
create table if not exists public.event_participants(event_id uuid references public.events(id),user_id uuid references public.users(id),joined_at timestamptz default now(),completed_at timestamptz,primary key(event_id,user_id));
create table if not exists public.broadcasts(id uuid primary key default gen_random_uuid(),message text,media_path text,created_by uuid references public.users(id),created_at timestamptz default now());
create table if not exists public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid references public.users(id),title text,message text,kind text default 'info',read_at timestamptz,created_at timestamptz default now());
create table if not exists public.withdrawals(id uuid primary key default gen_random_uuid(),user_id uuid references public.users(id),method text,amount_usd numeric,fee_usd numeric,net_usd numeric,ngn_rate numeric,ngn_amount numeric,details jsonb default '{}',status text default 'pending',created_at timestamptz default now(),processed_at timestamptz);
create table if not exists public.redeem_codes(id uuid primary key default gen_random_uuid(),code text unique,amount_usd numeric default 0,hillscoin bigint default 0,capacity integer default 1,used_count integer default 0,active boolean default true,created_by uuid references public.users(id),created_at timestamptz default now());
create table if not exists public.redeem_redemptions(code_id uuid references public.redeem_codes(id),user_id uuid references public.users(id),created_at timestamptz default now(),primary key(code_id,user_id));
create table if not exists public.referrals(id uuid primary key default gen_random_uuid(),referrer_id uuid references public.users(id),referred_id uuid unique references public.users(id),code text,commission_usd numeric default 0,event_earnings_usd numeric default 0,status text default 'pending',created_at timestamptz default now());
create table if not exists public.referral_unlocks(id uuid primary key default gen_random_uuid(),referrer_id uuid references public.users(id),referred_id uuid references public.users(id),requirement text,met_at timestamptz default now(),unique(referrer_id,referred_id,requirement));
create table if not exists public.community_posts(id uuid primary key default gen_random_uuid(),user_id uuid references public.users(id),body text,media_path text,deleted_at timestamptz,created_at timestamptz default now());
create table if not exists public.community_comments(id uuid primary key default gen_random_uuid(),post_id uuid references public.community_posts(id) on delete cascade,user_id uuid references public.users(id),body text,created_at timestamptz default now());
create table if not exists public.ai_knowledge(id uuid primary key default gen_random_uuid(),title text,body text,media_path text,active boolean default true,created_by uuid references public.users(id),created_at timestamptz default now());
create table if not exists public.ad_views(id uuid primary key default gen_random_uuid(),user_id uuid references public.users(id),provider text default 'monetag',zone_id text,rewarded boolean default true,created_at timestamptz default now());
insert into public.settings(id)values(true)on conflict(id)do nothing;
