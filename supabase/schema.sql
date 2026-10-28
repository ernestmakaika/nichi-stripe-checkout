-- Nichi's Guesthouses booking database schema.
-- For a new project, run this file and then 20260918_roles_and_availability.sql
-- in the Supabase SQL editor. The second migration prevents overlapping
-- whole-property bookings.

create type payment_provider as enum ('stripe');
create type payment_status  as enum ('pending', 'paid', 'failed', 'cancelled', 'refunded');

create table public.bookings (
  id                          uuid primary key default gen_random_uuid(),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  check_in                    date not null,
  check_out                   date not null,
  nights                      integer generated always as (check_out - check_in) stored,
  adults                      integer not null default 2,
  children                    integer not null default 0,

  currency                    text not null check (currency = 'USD'),
  nightly_rate                numeric(12,2) not null,
  total_amount                numeric(12,2) not null,

  first_name                  text not null,
  last_name                   text not null,
  email                       text not null,
  phone                       text,

  promo_code                  text,

  payment_provider            payment_provider not null default 'stripe',
  payment_status              payment_status  not null default 'pending',

  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text,
  amount_captured             numeric(12,2),

  confirmation_code           text unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  notes                       text,

  constraint check_out_after_check_in check (check_out > check_in),
  constraint adults_range check (adults between 1 and 10),
  constraint children_range check (children between 0 and 10)
);

create index idx_bookings_check_in_out on public.bookings (check_in, check_out);
create index idx_bookings_payment_status on public.bookings (payment_status);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_bookings_updated_at
before update on public.bookings
for each row execute function public.set_updated_at();

-- RLS is enabled with no policies: only the service_role key (used from the
-- Vercel serverless functions) can read or write this table, bypassing RLS
-- entirely. There's no browser-based access to this table, so no policy
-- is needed.
alter table public.bookings enable row level security;
