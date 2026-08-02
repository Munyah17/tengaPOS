-- Job card numbers were generated client-side as JC-YYMMDD-RRRR with RRRR a
-- fresh random 4-digit draw per create call (src/utils/formatters.js
-- generateDocNumber). Numbers created seconds apart could draw in any order,
-- which a Workshop Mode client reported as "numbering fluctuating" -- and with
-- only 10,000 slots/tenant/day it could also collide outright against the
-- UNIQUE (tenant_id, job_card_no) constraint below. This replaces it with a
-- real atomic per-tenant counter assigned server-side, so numbers are
-- strictly increasing and collision-free. Scoped to job cards only --
-- generateReceiptNumber/generateDocNumber for receipts/quotes/invoices are
-- untouched.

CREATE TABLE IF NOT EXISTS public.job_card_counters (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  next_no   INTEGER NOT NULL DEFAULT 1
);
-- Not exposed via PostgREST -- only ever touched by next_job_card_no() below.

CREATE OR REPLACE FUNCTION public.next_job_card_no(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_no INTEGER;
BEGIN
  INSERT INTO public.job_card_counters (tenant_id, next_no)
  VALUES (p_tenant_id, 2)
  ON CONFLICT (tenant_id) DO UPDATE SET next_no = public.job_card_counters.next_no + 1
  RETURNING next_no - 1 INTO v_no;

  RETURN 'JC-' || lpad(v_no::text, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_job_card_no()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.job_card_no IS NULL OR NEW.job_card_no = '' THEN
    NEW.job_card_no := public.next_job_card_no(NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_job_card_no ON public.job_cards;
CREATE TRIGGER trg_set_job_card_no
  BEFORE INSERT ON public.job_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.set_job_card_no();
