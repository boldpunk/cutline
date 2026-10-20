-- Portfolio of works and in-salon amenities, as Tashkent barbershops show them
-- (fade/crop/beard photos; coffee, PlayStation, kids' chair, parking…).

alter table salons add column amenities text[] not null default '{}'
  check (cardinality(amenities) <= 12);

create table salon_gallery (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references salons(id) on delete cascade,
  media_id    uuid not null references media(id) on delete cascade,
  caption     text check (char_length(caption) <= 80),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index salon_gallery_salon_idx on salon_gallery (salon_id, sort_order, created_at);
