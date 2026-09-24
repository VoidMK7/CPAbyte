-- HillsByte Supabase schema
-- The app uses the server-side Supabase service role for database/storage access.
-- Keep SUPABASE_SERVICE_ROLE_KEY server-side only; never put it in public JS.
create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(), telegram_id bigint unique not null,
  username text, first_name text, last_name text, photo_url text,
  role text not null default 'user' check (role in ('user','admin')),
  balance numeric(12,2) not null default 0, pending_balance numeric(12,2) not null default 0,
  lifetime_earnings numeric(12,2) not null default 0, hills_coin numeric(18,2) not null default 25,
  referral_earnings numeric(12,2) not null default 0, referral_code text unique, referred_by bigint,
  tasks_completed integer not null default 0, streak integer not null default 0, last_checkin date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(), title text not null, description text,
  reward numeric(12,2) not null default 0, category text not null default 'social', est_minutes integer not null default 2,
  difficulty text not null default 'easy', max_slots integer not null default 1000, claimed_slots integer not null default 0,
  timer_seconds integer not null default 120, task_url text, logo_url text, instructions text, requirements text,
  proof_required boolean not null default true, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists task_submissions (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references tasks(id) on delete cascade,
  telegram_id bigint not null, proof_path text, proof_url text, status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewer_note text, reward numeric(12,2) not null default 0, submitted_at timestamptz not null default now(), reviewed_at timestamptz
);
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(), telegram_id bigint not null, type text not null,
  amount numeric(12,2) not null, status text not null default 'completed', description text, created_at timestamptz not null default now()
);
create table if not exists withdrawals (
  id uuid primary key default gen_random_uuid(), telegram_id bigint not null, amount numeric(12,2) not null,
  method text not null, destination text not null, status text not null default 'pending' check (status in ('pending','approved','rejected','paid')),
  admin_note text, created_at timestamptz not null default now(), reviewed_at timestamptz
);
create table if not exists referrals (
  id uuid primary key default gen_random_uuid(), referrer_telegram_id bigint not null,
  referred_telegram_id bigint unique not null, reward numeric(12,2) not null default 0, created_at timestamptz not null default now()
);
create table if not exists checkins (
  id uuid primary key default gen_random_uuid(), telegram_id bigint not null, checkin_date date not null,
  day_number integer not null, reward numeric(12,2) not null default 0, created_at timestamptz not null default now(),
  unique (telegram_id, checkin_date)
);
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(), title text not null, message text not null,
  pinned boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists events (
  id uuid primary key default gen_random_uuid(), title text not null, description text, banner_url text,
  reward text, rules text, start_at timestamptz, end_at timestamptz, cta_label text, cta_url text, created_at timestamptz not null default now()
);
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(), telegram_id bigint, title text not null, message text not null,
  type text not null default 'info', read_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists ad_slots (
  id uuid primary key default gen_random_uuid(), name text not null, provider text, placement text not null default 'earn',
  code text, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists assistant_messages (
  id uuid primary key default gen_random_uuid(), telegram_id bigint not null,
  role text not null check (role in ('user','assistant')), content text not null, created_at timestamptz not null default now()
);

create index if not exists idx_profiles_telegram_id on profiles(telegram_id);
create index if not exists idx_tasks_active on tasks(active);
create index if not exists idx_submissions_status on task_submissions(status);
create index if not exists idx_transactions_telegram on transactions(telegram_id);
create index if not exists idx_notifications_telegram on notifications(telegram_id);
create index if not exists idx_withdrawals_status on withdrawals(status);

-- Atomic daily check-in. This prevents double-crediting when two requests arrive together.
create or replace function public.perform_daily_checkin(p_telegram_id bigint, p_checkin_date date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p profiles%rowtype; c checkins%rowtype; next_streak integer; reward numeric(12,2); day_no integer;
begin
  select * into p from profiles where telegram_id=p_telegram_id for update;
  if not found then raise exception 'Profile not found'; end if;
  select * into c from checkins where telegram_id=p_telegram_id and checkin_date=p_checkin_date;
  if found then return jsonb_build_object('already',true,'checkin',to_jsonb(c)); end if;
  next_streak := case when p.last_checkin = p_checkin_date - 1 then coalesce(p.streak,0)+1 else 1 end;
  day_no := ((next_streak-1)%7)+1;
  reward := least(0.10::numeric,0.02::numeric + next_streak*0.01::numeric);
  insert into checkins(telegram_id,checkin_date,day_number,reward) values(p_telegram_id,p_checkin_date,day_no,reward) returning * into c;
  update profiles set balance=balance+reward,lifetime_earnings=lifetime_earnings+reward,streak=next_streak,last_checkin=p_checkin_date,updated_at=now() where telegram_id=p_telegram_id;
  insert into transactions(telegram_id,type,amount,description) values(p_telegram_id,'checkin',reward,'Daily check-in day '||day_no);
  return jsonb_build_object('already',false,'checkin',to_jsonb(c),'reward',reward,'streak',next_streak);
end; $$;

-- Reserve balance when a withdrawal is created.
create or replace function public.reserve_withdrawal(p_withdrawal_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare w withdrawals%rowtype; p profiles%rowtype;
begin
  select * into w from withdrawals where id=p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  select * into p from profiles where telegram_id=w.telegram_id for update;
  if not found then raise exception 'Profile not found'; end if;
  if w.status <> 'pending' then raise exception 'Withdrawal is not pending'; end if;
  if p.balance < w.amount then raise exception 'Insufficient available balance'; end if;
  update profiles set balance=balance-w.amount,pending_balance=pending_balance+w.amount,updated_at=now() where telegram_id=w.telegram_id;
  insert into transactions(telegram_id,type,amount,status,description) values(w.telegram_id,'withdrawal',-w.amount,'pending','Withdrawal via '||w.method);
  return jsonb_build_object('ok',true);
end; $$;

-- Atomic admin withdrawal review. Rejection returns the reserved funds.
create or replace function public.review_withdrawal(p_withdrawal_id uuid,p_status text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare w withdrawals%rowtype;
begin
  if p_status not in ('approved','rejected') then raise exception 'Invalid review status'; end if;
  select * into w from withdrawals where id=p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if w.status <> 'pending' then raise exception 'Withdrawal already reviewed'; end if;
  if p_status='rejected' then
    update profiles set balance=balance+w.amount,pending_balance=greatest(0,pending_balance-w.amount),updated_at=now() where telegram_id=w.telegram_id;
    insert into transactions(telegram_id,type,amount,status,description) values(w.telegram_id,'withdrawal_reversal',w.amount,'completed',coalesce(p_note,'Rejected withdrawal returned to balance'));
  else
    update profiles set pending_balance=greatest(0,pending_balance-w.amount),updated_at=now() where telegram_id=w.telegram_id;
  end if;
  update withdrawals set status=p_status,admin_note=p_note,reviewed_at=now() where id=p_withdrawal_id returning * into w;
  return jsonb_build_object('id',w.id,'telegram_id',w.telegram_id,'amount',w.amount,'status',w.status);
end; $$;

-- Atomic task proof review. An approved proof credits the user once.
create or replace function public.review_task_submission(p_submission_id uuid,p_status text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s task_submissions%rowtype;
begin
  if p_status not in ('approved','rejected') then raise exception 'Invalid review status'; end if;
  select * into s from task_submissions where id=p_submission_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if s.status <> 'pending' then raise exception 'Submission already reviewed'; end if;
  update task_submissions set status=p_status,reviewer_note=p_note,reviewed_at=now() where id=p_submission_id;
  if p_status='approved' then
    update profiles set balance=balance+s.reward,lifetime_earnings=lifetime_earnings+s.reward,tasks_completed=tasks_completed+1,updated_at=now() where telegram_id=s.telegram_id;
    insert into transactions(telegram_id,type,amount,status,description) values(s.telegram_id,'task_reward',s.reward,'completed','Approved task reward');
  end if;
  return jsonb_build_object('telegram_id',s.telegram_id,'reward',s.reward,'status',p_status);
end; $$;

grant execute on function public.perform_daily_checkin(bigint,date) to service_role;
grant execute on function public.reserve_withdrawal(uuid) to service_role;
grant execute on function public.review_withdrawal(uuid,text,text) to service_role;
grant execute on function public.review_task_submission(uuid,text,text) to service_role;

-- Private storage bucket used by the server for task proof screenshots.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('task-proofs','task-proofs',false,8388608,array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=false,file_size_limit=8388608,allowed_mime_types=array['image/png','image/jpeg','image/webp'];

-- Seed tasks matching the supplied HillsByte UI references.
insert into tasks(title,description,reward,category,est_minutes,difficulty,max_slots,timer_seconds,instructions,requirements,proof_required)
select 'Write a short review','Complete the requested partner review.',0.12,'content',2,'easy',1000,120,'Open the task and complete the requested review.','Submit a clear screenshot as proof.',true
where not exists(select 1 from tasks where title='Write a short review');
insert into tasks(title,description,reward,category,est_minutes,difficulty,max_slots,timer_seconds,instructions,requirements,proof_required)
select 'Daily check-in bonus','Check in once every day.',0.02,'daily',1,'easy',10000,60,'Tap Check in once per day.','No screenshot required.',false
where not exists(select 1 from tasks where title='Daily check-in bonus');
insert into tasks(title,description,reward,category,est_minutes,difficulty,max_slots,timer_seconds,instructions,requirements,proof_required)
select 'Try a partner app','Try the listed partner app.',0.15,'apps',3,'easy',1000,180,'Open the partner app and complete the listed action.','Submit a screenshot as proof.',true
where not exists(select 1 from tasks where title='Try a partner app');
insert into tasks(title,description,reward,category,est_minutes,difficulty,max_slots,timer_seconds,instructions,requirements,proof_required)
select 'Follow HillsByte on X','Follow HillsByte on X.',0.05,'social',1,'easy',10000,90,'Open the social link and follow the account.','Submit a screenshot as proof.',true
where not exists(select 1 from tasks where title='Follow HillsByte on X');
insert into tasks(title,description,reward,category,est_minutes,difficulty,max_slots,timer_seconds,instructions,requirements,proof_required)
select 'Join HillsByte Community','Join the HillsByte Telegram community.',0.07,'telegram',1,'easy',10000,90,'Open the community link and join.', 'Submit a screenshot as proof.',true
where not exists(select 1 from tasks where title='Join HillsByte Community');

CREATE TABLE IF NOT EXISTS checkins(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,checkin_date TEXT NOT NULL,reward REAL DEFAULT 0,streak INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,checkin_date));
