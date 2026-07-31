-- The printer_connection CHECK constraint only allowed the original set
-- ('usb', 'lpt1', 'network', 'wifi', 'bluetooth', 'serial') — 'bridge' and
-- 'rawbt' were added to the client's PRINTER_CONNECTIONS list (src/lib/
-- posPrinter.js) without ever updating this constraint, so saving either
-- option failed with "violates check constraint" the moment someone picked
-- Bridge or RawBT (the exact combination cheap Android + Bluetooth thermal
-- printer setups, like the MPT-II, actually need).
ALTER TABLE public.receipt_configs DROP CONSTRAINT IF EXISTS receipt_configs_printer_connection_check;
ALTER TABLE public.receipt_configs
  ADD CONSTRAINT receipt_configs_printer_connection_check
  CHECK (printer_connection IN ('usb', 'lpt1', 'network', 'wifi', 'bluetooth', 'serial', 'bridge', 'rawbt'));
