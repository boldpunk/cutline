-- CUTLINE v1 schema.
-- All instants are timestamptz (stored as UTC). Local wall-clock schedule values are
-- minutes from local midnight in the salon time zone (salon_settings.timezone).

create extension if not exists btree_gist;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Salon settings (single row). Nullable public fields are hidden on the site
-- until the owner fills them in.
-- ---------------------------------------------------------------------------
create table salon_settings (
  id                  smallint primary key default 1 check (id = 1),
  name                text not null check (char_length(name) between 1 and 80),
  tagline             text check (char_length(tagline) <= 160),
  about               text check (char_length(about) <= 1000),
  address             text check (char_length(address) <= 200),
  map_url             text check (char_length(map_url) <= 500),
  phone               text check (char_length(phone) <= 40),
  socials             jsonb not null default '[]'::jsonb,
  timezone            text not null default 'Asia/Tashkent',
  slot_step_min       integer not null default 15 check (slot_step_min in (5, 10, 15, 20, 30, 60)),
  min_lead_min        integer not null default 60 check (min_lead_min between 0 and 10080),
  horizon_days        integer not null default 60 check (horizon_days between 1 and 365),
  cancel_cutoff_hours integer not null default 12 check (cancel_cutoff_hours between 0 and 168),
  mode                text not null default 'demo' check (mode in ('demo', 'live')),
  barbers_can_block   boolean not null default true,
  -- Privacy page facts. Must be supplied by the owner for live mode.
  privacy_controller  text check (char_length(privacy_controller) <= 300),
  privacy_contact     text check (char_length(privacy_contact) <= 300),
  retention_days      integer check (retention_days between 1 and 3650),
  consent_version     text not null default 'draft-1' check (char_length(consent_version) between 1 and 40),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Media (uploaded photos). Kept in the DB so backups contain everything.
-- ---------------------------------------------------------------------------
create table media (
  id           uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  bytes        bytea not null,
  size         integer not null check (size between 1 and 3145728),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Barbers & services
-- ---------------------------------------------------------------------------
create table barbers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 1 and 80),
  specialization  text check (char_length(specialization) <= 120),
  bio             text check (char_length(bio) <= 600),
  photo_media_id  uuid references media(id) on delete set null,
  active          boolean not null default true,
  sort_order      integer not null default 0,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table services (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(name) between 1 and 80),
  description       text check (char_length(description) <= 600),
  category          text check (char_length(category) <= 60),
  duration_min      integer not null check (duration_min between 5 and 480),
  price_uzs         bigint not null check (price_uzs between 0 and 100000000),
  buffer_before_min integer not null default 0 check (buffer_before_min between 0 and 120),
  buffer_after_min  integer not null default 0 check (buffer_after_min between 0 and 120),
  active            boolean not null default true,
  sort_order        integer not null default 0,
  is_demo           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Which barber performs which service; optional per-barber price / duration.
create table barber_services (
  barber_id    uuid not null references barbers(id) on delete cascade,
  service_id   uuid not null references services(id) on delete cascade,
  price_uzs    bigint check (price_uzs between 0 and 100000000),
  duration_min integer check (duration_min between 5 and 480),
  primary key (barber_id, service_id)
);

-- ---------------------------------------------------------------------------
-- Staff accounts. No public sign-up; created by an admin or the CLI.
-- ---------------------------------------------------------------------------
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique check (char_length(email) between 3 and 200),
  name          text not null check (char_length(name) between 1 and 80),
  password_hash text not null,
  role          text not null check (role in ('admin', 'barber')),
  barber_id     uuid unique references barbers(id),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (role <> 'barber' or barber_id is not null)
);

create table sessions (
  id           text primary key,            -- sha256(token) hex; the raw token is only in the cookie
  user_id      uuid not null references users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null
);
create index sessions_user_idx on sessions (user_id);

-- ---------------------------------------------------------------------------
-- Schedule
-- ---------------------------------------------------------------------------
-- Recurring weekly hours. barber_id NULL = salon opening hours; a barber's
-- effective hours are the intersection of salon and barber hours.
-- A lunch break is expressed as two intervals on the same weekday.
create table weekly_availability (
  id         uuid primary key default gen_random_uuid(),
  barber_id  uuid references barbers(id) on delete cascade,
  weekday    smallint not null check (weekday between 1 and 7),   -- ISO: 1 = Monday
  start_min  smallint not null check (start_min between 0 and 1439),
  end_min    smallint not null check (end_min between 1 and 1440),
  check (start_min < end_min),
  constraint weekly_availability_no_overlap exclude using gist (
    (coalesce(barber_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    weekday with =,
    int4range(start_min, end_min, '[)') with &&
  )
);

-- Date-specific overrides. barber_id NULL = whole salon.
-- kind = 'closed'  -> no work that date
-- kind = 'hours'   -> replaces the weekly hours for that date (one or more rows)
create table schedule_exceptions (
  id          uuid primary key default gen_random_uuid(),
  barber_id   uuid references barbers(id) on delete cascade,
  date        date not null,
  kind        text not null check (kind in ('closed', 'hours')),
  start_min   smallint check (start_min between 0 and 1439),
  end_min     smallint check (end_min between 1 and 1440),
  note        text check (char_length(note) <= 200),
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  check ((kind = 'closed' and start_min is null and end_min is null)
      or (kind = 'hours' and start_min is not null and end_min is not null and start_min < end_min))
);
create index schedule_exceptions_date_idx on schedule_exceptions (date, barber_id);

-- One-off blocked time for a barber: vacations, personal breaks, other.
create table time_blocks (
  id          uuid primary key default gen_random_uuid(),
  barber_id   uuid not null references barbers(id) on delete cascade,
  kind        text not null check (kind in ('break', 'vacation', 'other')),
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  block_range tstzrange generated always as (tstzrange(start_at, end_at, '[)')) stored,
  note        text check (char_length(note) <= 200),
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  check (end_at > start_at)
);
create index time_blocks_barber_range_idx on time_blocks using gist (barber_id, block_range);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
-- Public-safe booking data. Contact data lives in booking_contacts.
create table bookings (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  access_token_hash  text not null unique,      -- sha256(token) hex
  barber_id          uuid not null references barbers(id),
  service_id         uuid not null references services(id),
  -- Snapshot of what the client agreed to; later price changes don't rewrite history.
  service_name       text not null,
  price_uzs          bigint not null check (price_uzs >= 0),
  duration_min       integer not null check (duration_min > 0),
  buffer_before_min  integer not null check (buffer_before_min >= 0),
  buffer_after_min   integer not null check (buffer_after_min >= 0),
  start_at           timestamptz not null,
  end_at             timestamptz not null,
  occupied_from      timestamptz not null,     -- start_at - buffer_before
  occupied_until     timestamptz not null,     -- end_at + buffer_after
  occupied_range     tstzrange generated always as (tstzrange(occupied_from, occupied_until, '[)')) stored,
  status             text not null default 'confirmed'
                     check (status in ('confirmed', 'cancelled_by_client', 'cancelled_by_staff', 'completed', 'no_show')),
  status_reason      text check (char_length(status_reason) <= 300),
  source             text not null check (source in ('online', 'staff')),
  created_by_user_id uuid references users(id),
  reschedule_count   integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (end_at > start_at),
  check (occupied_from <= start_at and occupied_until >= end_at),
  -- The core guarantee: confirmed bookings of one barber never overlap (incl. buffers).
  constraint bookings_no_overlap exclude using gist (
    barber_id with =,
    occupied_range with &&
  ) where (status = 'confirmed')
);
create index bookings_barber_start_idx on bookings (barber_id, start_at);
create index bookings_start_idx on bookings (start_at);
create index bookings_status_start_idx on bookings (status, start_at);

create table booking_contacts (
  booking_id       uuid primary key references bookings(id) on delete cascade,
  client_name      text not null check (char_length(client_name) between 1 and 100),
  phone_e164       text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  phone_last4      text not null check (phone_last4 ~ '^[0-9]{4}$'),
  email            citext check (char_length(email) <= 200),
  comment          text check (char_length(comment) <= 500),
  consent_version  text not null,
  consented_at     timestamptz not null
);
create index booking_contacts_phone_idx on booking_contacts (phone_e164);

-- Booking history. Never contains a full phone number.
create table booking_events (
  id             bigserial primary key,
  booking_id     uuid not null references bookings(id) on delete cascade,
  type           text not null check (type in ('created', 'rescheduled', 'cancelled', 'completed', 'no_show', 'access_verified')),
  actor_type     text not null check (actor_type in ('client', 'staff', 'system')),
  actor_user_id  uuid references users(id),
  data           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index booking_events_booking_idx on booking_events (booking_id, created_at);

-- Staff change log for everything that is not a booking.
create table audit_log (
  id             bigserial primary key,
  actor_user_id  uuid references users(id),
  action         text not null,
  entity_type    text not null,
  entity_id      text,
  data           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index audit_log_created_idx on audit_log (created_at desc);

-- ---------------------------------------------------------------------------
-- Notifications outbox (delivery never blocks or undoes a booking)
-- ---------------------------------------------------------------------------
create table notification_outbox (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references bookings(id) on delete cascade,
  event_type      text not null check (event_type in ('booking_confirmed', 'rescheduled', 'cancelled', 'reminder')),
  channel         text not null check (channel in ('email')),
  dedupe_key      text not null unique,
  status          text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'cancelled')),
  attempts        integer not null default 0,
  max_attempts    integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  locked_until    timestamptz,
  last_error      text check (char_length(last_error) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index notification_outbox_due_idx on notification_outbox (status, next_attempt_at);

-- ---------------------------------------------------------------------------
-- Idempotency & rate limiting
-- ---------------------------------------------------------------------------
create table idempotency_keys (
  scope         text not null,
  key           text not null check (char_length(key) between 16 and 64),
  request_hash  text not null,
  booking_id    uuid references bookings(id) on delete cascade,
  response      jsonb,                         -- token inside is AES-GCM sealed
  created_at    timestamptz not null default now(),
  primary key (scope, key)
);
create index idempotency_keys_created_idx on idempotency_keys (created_at);

create table rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (key, window_start)
);
create index rate_limits_window_idx on rate_limits (window_start);
