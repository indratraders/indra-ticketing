-- =============================================================================
-- Indra Ticketing — Supabase / Postgres schema (same tables as SQL Server)
-- Run in: Supabase → SQL Editor → New query → Run
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  "passwordHash" text NOT NULL,
  role text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.counters (
  id text PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vehicles (
  id text PRIMARY KEY,
  brand text NOT NULL,
  model text NOT NULL,
  "registrationNumber" text NULL,
  status text NOT NULL DEFAULT 'AVAILABLE',
  active boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_vehicles_status ON public.vehicles (status);
CREATE INDEX IF NOT EXISTS ix_vehicles_active ON public.vehicles (active);

CREATE TABLE IF NOT EXISTS public.customers (
  id text PRIMARY KEY,
  name text NOT NULL,
  "contactNumber" text NOT NULL,
  nic text NULL,
  email text NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_customers_contact ON public.customers ("contactNumber");

CREATE TABLE IF NOT EXISTS public.settings (
  id text PRIMARY KEY,
  "companyName" text NOT NULL,
  "tokenPrefix" text NOT NULL DEFAULT '',
  "startingTokenNumber" integer NOT NULL DEFAULT 1,
  "maxTokenNumber" integer NOT NULL DEFAULT 50,
  "customerCodePrefix" text NOT NULL DEFAULT 'C',
  "defaultCounterId" text NOT NULL,
  "audioNotificationEnabled" boolean NOT NULL DEFAULT true,
  "textToSpeechEnabled" boolean NOT NULL DEFAULT true,
  "displayMode" text NOT NULL DEFAULT 'LARGE',
  "queueBehavior" text NOT NULL DEFAULT 'FIFO',
  "autoCompleteOnNext" boolean NOT NULL DEFAULT false,
  "upcomingTokensCount" integer NOT NULL DEFAULT 3,
  "displayShowCustomerName" boolean NOT NULL DEFAULT true,
  timezone text NOT NULL DEFAULT 'Asia/Colombo',
  "lastQueueSequence" integer NOT NULL DEFAULT 0,
  "lastCustomerCodeSequence" integer NOT NULL DEFAULT 0,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_sequences (
  id text PRIMARY KEY,
  "businessDate" date NOT NULL,
  prefix text NOT NULL,
  "lastSequence" integer NOT NULL DEFAULT 0,
  "counterId" text NULL,
  CONSTRAINT uq_daily_sequences UNIQUE ("businessDate", prefix)
);

CREATE TABLE IF NOT EXISTS public.tokens (
  id text PRIMARY KEY,
  "tokenNumber" text NOT NULL,
  "tokenPrefix" text NOT NULL DEFAULT '',
  "sequenceNumber" integer NOT NULL,
  "customerCode" text NOT NULL UNIQUE,
  "businessDate" date NOT NULL,
  "customerId" text NOT NULL REFERENCES public.customers (id),
  "vehicleId" text NOT NULL REFERENCES public.vehicles (id),
  "testDriveType" text NOT NULL,
  status text NOT NULL DEFAULT 'WAITING',
  "counterId" text NULL REFERENCES public.counters (id),
  "issuedBy" text NOT NULL REFERENCES public.users (id),
  "calledBy" text NULL REFERENCES public.users (id),
  notes text NULL,
  "skipReason" text NULL,
  "cancellationReason" text NULL,
  "cancelledBy" text NULL,
  "issuedAt" timestamptz NOT NULL DEFAULT now(),
  "calledAt" timestamptz NULL,
  "startedAt" timestamptz NULL,
  "completedAt" timestamptz NULL,
  "skippedAt" timestamptz NULL,
  "cancelledAt" timestamptz NULL,
  "recallCount" integer NOT NULL DEFAULT 0,
  "lastRecalledAt" timestamptz NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tokens_token_number ON public.tokens ("tokenNumber");
CREATE INDEX IF NOT EXISTS ix_tokens_status ON public.tokens (status);
CREATE INDEX IF NOT EXISTS ix_tokens_created_at ON public.tokens ("createdAt");
CREATE INDEX IF NOT EXISTS ix_tokens_business_status ON public.tokens ("businessDate", status);

CREATE TABLE IF NOT EXISTS public.token_events (
  id text PRIMARY KEY,
  "tokenId" text NOT NULL REFERENCES public.tokens (id),
  "eventType" text NOT NULL,
  "fromStatus" text NULL,
  "toStatus" text NULL,
  "performedBy" text NULL REFERENCES public.users (id),
  reason text NULL,
  metadata text NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_token_events_token ON public.token_events ("tokenId");

-- Keep legacy JSON blob table if it already exists (unused once relational mode is on)
CREATE TABLE IF NOT EXISTS public.app_store (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Seed: Colombo fleet + officers (password for all users: demo1234)
-- =============================================================================

INSERT INTO public.users (id, email, name, "passwordHash", role, active)
VALUES
  ('user_admin', 'admin@indra.local', 'System Admin', '$2b$10$BywP.3d07GPhmnh.1adVzOGfiqBrwz63lsUPYogHebekdh6Uswhay', 'ADMIN', true),
  ('user_krish', 'krish@indra.local', 'Krish', '$2b$10$BywP.3d07GPhmnh.1adVzOGfiqBrwz63lsUPYogHebekdh6Uswhay', 'TOKEN_OFFICER', true),
  ('user_umesh', 'umesh@indra.local', 'Umesh', '$2b$10$BywP.3d07GPhmnh.1adVzOGfiqBrwz63lsUPYogHebekdh6Uswhay', 'TOKEN_OFFICER', true),
  ('user_imithiyaz', 'imithiyaz@indra.local', 'Imithiyaz', '$2b$10$BywP.3d07GPhmnh.1adVzOGfiqBrwz63lsUPYogHebekdh6Uswhay', 'TOKEN_OFFICER', true),
  ('user_buwaneka', 'buwaneka@indra.local', 'Buwaneka', '$2b$10$BywP.3d07GPhmnh.1adVzOGfiqBrwz63lsUPYogHebekdh6Uswhay', 'TOKEN_OFFICER', true),
  ('user_omith', 'omith@indra.local', 'Omith', '$2b$10$BywP.3d07GPhmnh.1adVzOGfiqBrwz63lsUPYogHebekdh6Uswhay', 'TOKEN_OFFICER', true),
  ('user_token', 'token@indra.local', 'Token Officer', '$2b$10$BywP.3d07GPhmnh.1adVzOGfiqBrwz63lsUPYogHebekdh6Uswhay', 'TOKEN_OFFICER', true),
  ('user_queue', 'queue@indra.local', 'Queue Officer', '$2b$10$BywP.3d07GPhmnh.1adVzOGfiqBrwz63lsUPYogHebekdh6Uswhay', 'QUEUE_OFFICER', true)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  "passwordHash" = EXCLUDED."passwordHash",
  role = EXCLUDED.role,
  active = true,
  "updatedAt" = now();

INSERT INTO public.counters (id, name, code, active)
VALUES
  ('counter_01', 'Counter 01', '1', true),
  ('counter_02', 'Counter 02', '2', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  active = true,
  "updatedAt" = now();

INSERT INTO public.vehicles (id, brand, model, "registrationNumber", status, active)
VALUES
  ('veh_raptor', 'Ford', 'Raptor', NULL, 'AVAILABLE', true),
  ('veh_vezel', 'Honda', 'Vezel', NULL, 'AVAILABLE', true),
  ('veh_taisor', 'Toyota', 'Taisor', NULL, 'AVAILABLE', true),
  ('veh_wagonr', 'Suzuki', 'Wagon R', NULL, 'AVAILABLE', true),
  ('veh_raize', 'Toyota', 'Raize', NULL, 'AVAILABLE', true),
  ('veh_dayz', 'Nissan', 'Dayz', NULL, 'AVAILABLE', true)
ON CONFLICT (id) DO UPDATE SET
  brand = EXCLUDED.brand,
  model = EXCLUDED.model,
  status = 'AVAILABLE',
  active = true,
  "updatedAt" = now();

-- Rename legacy Kia Sonet → Suzuki Wagon R (keep old id for existing tokens)
UPDATE public.vehicles
SET brand = 'Suzuki', model = 'Wagon R', active = true, status = 'AVAILABLE', "updatedAt" = now()
WHERE id = 'veh_sonet';

-- Prefer the new id going forward; deactivate duplicate if both exist
UPDATE public.vehicles SET active = false, "updatedAt" = now()
WHERE id = 'veh_sonet'
  AND EXISTS (SELECT 1 FROM public.vehicles WHERE id = 'veh_wagonr');

INSERT INTO public.settings (
  id, "companyName", "tokenPrefix", "startingTokenNumber", "maxTokenNumber",
  "customerCodePrefix", "defaultCounterId", "audioNotificationEnabled",
  "textToSpeechEnabled", "displayMode", "queueBehavior", "autoCompleteOnNext",
  "upcomingTokensCount", "displayShowCustomerName", timezone,
  "lastQueueSequence", "lastCustomerCodeSequence"
) VALUES (
  'settings_default',
  'Indra Traders (PVT) LTD — Colombo',
  '', 1, 50, 'C', 'counter_01',
  true, true, 'LARGE', 'FIFO', false,
  6, true, 'Asia/Colombo', 0, 0
)
ON CONFLICT (id) DO UPDATE SET
  "companyName" = EXCLUDED."companyName",
  "upcomingTokensCount" = 6,
  "defaultCounterId" = 'counter_01',
  "updatedAt" = now();
