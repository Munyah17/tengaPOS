-- Two overloads of submit_receipt_config exist in production: one matching
-- the client's 15 named args (used by src/lib/db.js submitReceiptConfig),
-- and a stray second overload with an extra p_com_port param (added directly
-- via SQL editor at some point, never tracked in migrations). PostgREST can't
-- pick between them on a named-args call and errors out.
--
-- Keep the 15-param version the client actually calls; drop the p_com_port one.
DROP FUNCTION IF EXISTS public.submit_receipt_config(
  p_branch_id UUID,
  p_template_mode TEXT,
  p_store_name TEXT,
  p_store_address TEXT,
  p_store_contacts TEXT,
  p_tin TEXT,
  p_vat_number TEXT,
  p_footer_message TEXT,
  p_paper_width_mm INTEGER,
  p_printer_connection TEXT,
  p_show_pos_print BOOLEAN,
  p_header_message TEXT,
  p_custom_lines JSONB,
  p_logo_url TEXT,
  p_bank_details TEXT,
  p_com_port TEXT
);
