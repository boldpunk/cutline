-- Multi-tenant: every business (salon) gets its own page and data.
-- salon_settings (single row) becomes the salons table; every business table
-- gets salon_id. Composite foreign keys make cross-salon references impossible
-- at the database level (a booking can't point at another salon's barber, etc.).

create table salons (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique
                      check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  published           boolean not null default false,
  theme               text not null default 'pole' check (theme in ('pole', 'night', 'mint', 'brass')),
  instagram_url       text check (char_length(instagram_url) <= 300),
  name                text not null check (char_length(name) between 1 and 80),
  tagline             text check (char_length(tagline) <= 160),
  about               text check (char_length(about) <= 1000),
  address             text check (char_length(address) <= 200),
  map_url             text check (char_length(map_url) <= 500),
  hero_media_id       uuid references media(id) on delete set null,
  phone               text check (char_length(phone) <= 40),
  socials             jsonb not null default '[]'::jsonb,
  timezone            text not null default 'Asia/Tashkent',
  slot_step_min       integer not null default 15 check (slot_step_min in (5, 10, 15, 20, 30, 60)),
  min_lead_min        integer not null default 60 check (min_lead_min between 0 and 10080),
  horizon_days        integer not null default 60 check (horizon_days between 1 and 365),
  cancel_cutoff_hours integer not null default 12 check (cancel_cutoff_hours between 0 and 168),
  mode                text not null default 'live' check (mode in ('demo', 'live')),
  barbers_can_block   boolean not null default true,
  privacy_controller  text check (char_length(privacy_controller) <= 300),
  privacy_contact     text check (char_length(privacy_contact) <= 300),
  retention_days      integer check (retention_days between 1 and 3650),
  consent_version     text not null default 'v1' check (char_length(consent_version) between 1 and 40),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- The former single salon becomes the "demo" tenant (if it exists).
insert into salons (slug, published, theme, name, tagline, about, address, map_url, hero_media_id, phone, socials,
                    timezone, slot_step_min, min_lead_min, horizon_days, cancel_cutoff_hours, mode, barbers_can_block,
                    privacy_controller, privacy_contact, retention_days, consent_version, updated_at)
select 'demo', true, 'pole', name, tagline, about, address, map_url, hero_media_id, phone, socials,
       timezone, slot_step_min, min_lead_min, horizon_days, cancel_cutoff_hours, mode, barbers_can_block,
       privacy_controller, privacy_contact, retention_days, consent_version, updated_at
  from salon_settings;

drop table salon_settings;

-- Helper: attach salon_id to a table, backfill with the demo salon, make it required.
create function pg_temp.add_salon_id(tbl regclass, required boolean) returns void language plpgsql as $$
begin
  execute format('alter table %s add column salon_id uuid references salons(id) on delete cascade', tbl);
  execute format('update %s set salon_id = (select id from salons where slug = %L)', tbl, 'demo');
  if required then
    execute format('alter table %s alter column salon_id set not null', tbl);
  end if;
end $$;

select pg_temp.add_salon_id('barbers', true);
select pg_temp.add_salon_id('services', true);
select pg_temp.add_salon_id('barber_services', true);
select pg_temp.add_salon_id('users', true);
select pg_temp.add_salon_id('weekly_availability', true);
select pg_temp.add_salon_id('schedule_exceptions', true);
select pg_temp.add_salon_id('time_blocks', true);
select pg_temp.add_salon_id('bookings', true);
select pg_temp.add_salon_id('media', false);
select pg_temp.add_salon_id('audit_log', false);

-- Composite keys: a child row must reference a parent of the SAME salon.
alter table barbers  add constraint barbers_id_salon_uq  unique (id, salon_id);
alter table services add constraint services_id_salon_uq unique (id, salon_id);

alter table barber_services
  add constraint barber_services_barber_salon_fk  foreign key (barber_id, salon_id)  references barbers (id, salon_id) on delete cascade,
  add constraint barber_services_service_salon_fk foreign key (service_id, salon_id) references services (id, salon_id) on delete cascade;
alter table users
  add constraint users_barber_salon_fk foreign key (barber_id, salon_id) references barbers (id, salon_id);
alter table weekly_availability
  add constraint weekly_availability_barber_salon_fk foreign key (barber_id, salon_id) references barbers (id, salon_id) on delete cascade;
alter table schedule_exceptions
  add constraint schedule_exceptions_barber_salon_fk foreign key (barber_id, salon_id) references barbers (id, salon_id) on delete cascade;
alter table time_blocks
  add constraint time_blocks_barber_salon_fk foreign key (barber_id, salon_id) references barbers (id, salon_id) on delete cascade;
alter table bookings
  add constraint bookings_barber_salon_fk  foreign key (barber_id, salon_id)  references barbers (id, salon_id),
  add constraint bookings_service_salon_fk foreign key (service_id, salon_id) references services (id, salon_id);

-- Salon-wide weekly hours (barber_id NULL) are now per salon.
alter table weekly_availability drop constraint weekly_availability_no_overlap;
alter table weekly_availability add constraint weekly_availability_no_overlap exclude using gist (
  salon_id with =,
  (coalesce(barber_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
  weekday with =,
  int4range(start_min, end_min, '[)') with &&
);

create index barbers_salon_idx on barbers (salon_id, sort_order);
create index services_salon_idx on services (salon_id, sort_order);
create index users_salon_idx on users (salon_id);
create index weekly_availability_salon_idx on weekly_availability (salon_id, barber_id);
drop index schedule_exceptions_date_idx;
create index schedule_exceptions_salon_date_idx on schedule_exceptions (salon_id, date, barber_id);
create index bookings_salon_start_idx on bookings (salon_id, start_at);
create index audit_log_salon_idx on audit_log (salon_id, created_at desc);
