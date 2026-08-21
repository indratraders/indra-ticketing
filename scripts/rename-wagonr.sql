-- Quick fix: rename Kia Sonet → Suzuki Wagon R
-- Run in Supabase SQL Editor

UPDATE public.vehicles
SET brand = 'Suzuki',
    model = 'Wagon R',
    active = true,
    status = 'AVAILABLE',
    "updatedAt" = now()
WHERE id = 'veh_sonet'
   OR (LOWER(brand) = 'kia' AND LOWER(model) = 'sonet');

INSERT INTO public.vehicles (id, brand, model, "registrationNumber", status, active)
VALUES ('veh_wagonr', 'Suzuki', 'Wagon R', NULL, 'AVAILABLE', true)
ON CONFLICT (id) DO UPDATE SET
  brand = 'Suzuki',
  model = 'Wagon R',
  active = true,
  status = 'AVAILABLE',
  "updatedAt" = now();
