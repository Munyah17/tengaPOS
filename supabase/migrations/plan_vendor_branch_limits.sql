-- Standard/Pro plans now cap vendor accounts, branches, and staff per
-- branch (e.g. Standard: 1 vendor, 3 branches, 2 users/branch). Staff
-- weren't previously assigned to a specific branch at all, so add that,
-- plus a DB-level trigger so the branch limit holds even though branch
-- creation goes through a direct client insert (not an edge function).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.enforce_branch_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_branches INTEGER;
  current_count INTEGER;
BEGIN
  SELECT (features->>'branches')::INTEGER INTO max_branches
  FROM public.tenants WHERE id = NEW.tenant_id;

  IF max_branches IS NULL OR max_branches = -1 THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO current_count FROM public.branches WHERE tenant_id = NEW.tenant_id;

  IF current_count >= max_branches THEN
    RAISE EXCEPTION 'Branch limit reached for your plan (max %)', max_branches;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_branch_limit ON public.branches;
CREATE TRIGGER trg_enforce_branch_limit
  BEFORE INSERT ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_branch_limit();
