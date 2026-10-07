-- 1. Built-in property types. Admins can add more from /admin/types; these are marked built_in.
INSERT INTO property_types (slug, name, plural, "group", booking_mode, cycles, can_have_children, can_be_child, unit_noun, icon, sort, description, built_in) VALUES
  ('hostel',         'Hostel',               'Hostels',               'STAY',     'LEASE', '{PER_SEMESTER,PER_MONTH}',   false, false, 'Room',    'bed',        10, 'Student rooms near campus, paid per semester or month.', true),
  ('residential',    'Rental',               'Rentals',               'STAY',     'LEASE', '{PER_MONTH}',                false, false, 'Unit',    'home',       20, 'Apartments, houses and single rooms for long-term rent.', true),
  ('flexi_stay',     'Short stay',           'Short stays',           'STAY',     'LEASE', '{PER_DAY,PER_MONTH}',        false, true,  'Room',    'key',        30, 'Furnished rooms for days or weeks.', true),
  ('hotel',          'Hotel',                'Hotels',                'STAY',     'LEASE', '{PER_DAY}',                  true,  false, 'Room',    'hotel',      40, 'Hotels, including their pools, rooftops and gardens.', true),
  ('arcade',         'Mall & arcade',        'Malls & arcades',       'BUSINESS', 'LEASE', '{PER_MONTH,PER_DAY}',        true,  false, 'Stall',   'store',      50, 'Shop stalls and units in malls and arcades.', true),
  ('turf_sports',    'Turf & sports pitch',  'Turfs & sports pitches','LEISURE',  'SLOT',  '{PER_HOUR}',                 false, true,  'Pitch',   'goal',       60, 'Football turfs, courts and pitches by the hour.', true),
  ('swimming_pool',  'Swimming pool',        'Swimming pools',        'LEISURE',  'SLOT',  '{PER_HOUR,PER_EVENT_SLOT}',  false, true,  'Pool',    'waves',      70, 'Pools for swim sessions, lessons or private hire.', true),
  ('lounge_rooftop', 'Lounge & rooftop',     'Lounges & rooftops',    'LEISURE',  'SLOT',  '{PER_EVENT_SLOT,PER_HOUR}',  false, true,  'Space',   'sunset',     80, 'Rooftops and lounges for parties and meetups.', true),
  ('event_garden',   'Event garden',         'Event gardens',         'LEISURE',  'SLOT',  '{PER_EVENT_SLOT}',           false, true,  'Garden',  'trees',      90, 'Gardens for weddings, introductions and corporate events.', true),
  ('restaurant',     'Restaurant',           'Restaurants',           'LEISURE',  'SLOT',  '{PER_EVENT_SLOT,PER_HOUR}',  false, true,  'Section', 'utensils',  100, 'Private dining sections and whole-venue hire.', true),
  ('bar',            'Bar',                  'Bars',                  'LEISURE',  'SLOT',  '{PER_EVENT_SLOT,PER_HOUR}',  false, true,  'Section', 'beer',      110, 'Bar areas for private parties and watch nights.', true),
  ('club',           'Club',                 'Clubs',                 'LEISURE',  'SLOT',  '{PER_EVENT_SLOT}',           false, true,  'Section', 'music',     120, 'VIP sections and full-club hire.', true)
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- 2. Backfill existing listings from the old fixed category.
UPDATE properties SET type = CASE category::text
  WHEN 'HOSTEL' THEN 'hostel' WHEN 'ARCADE' THEN 'arcade'
  WHEN 'RESIDENTIAL' THEN 'residential' WHEN 'FLEXI_STAY' THEN 'flexi_stay' END
WHERE type IS NULL;
--> statement-breakpoint
ALTER TABLE properties ALTER COLUMN type SET NOT NULL;
--> statement-breakpoint
ALTER TABLE properties ADD CONSTRAINT properties_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id);
--> statement-breakpoint
ALTER TABLE properties ADD CONSTRAINT properties_open_hours CHECK (open_from >= 0 AND open_to <= 24 AND open_from < open_to);
--> statement-breakpoint

-- 3. Time-slot bookings: a window is either fully set or absent, and live windows on the same
--    unit may never overlap. Postgres enforces this, so two people paying at the same instant
--    can't both get 7–9pm on the same pitch.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE holds ADD CONSTRAINT holds_slot_window CHECK ((starts_at IS NULL) = (ends_at IS NULL) AND (starts_at IS NULL OR ends_at > starts_at));
--> statement-breakpoint
ALTER TABLE holds ADD CONSTRAINT no_overlapping_slots
  EXCLUDE USING gist (unit_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (starts_at IS NOT NULL AND status IN ('PENDING_PAYMENT', 'HELD', 'CONFIRMED'));
--> statement-breakpoint

-- 4. Keep new tables off Supabase's public Data API, like the rest (see 0001).
ALTER TABLE property_types ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON property_types, businesses FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON property_types, businesses FROM authenticated';
  END IF;
END $$;
