import { useState } from 'react'
import {
  KeyRound, ShieldCheck, Globe, Copy, Check, Terminal, Gauge,
  AlertTriangle, BookOpen, ChevronDown, ChevronRight, ArrowLeft,
} from 'lucide-react'
import { Link } from 'react-router-dom'

// The edge function is reached on the project's own Supabase URL. We show a
// placeholder here and interpolate the real host in examples.
const BASE = 'https://<project-ref>.supabase.co/functions/v1/public-api'

function Code({ children, lang }) {
  const [copied, setCopied] = useState(false)
  const text = typeof children === 'string' ? children : ''
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-200">
        {lang && <span className="absolute right-12 top-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">{lang}</span>}
        <code>{children}</code>
      </pre>
      <button onClick={copy} className="absolute right-3 top-3 rounded-md bg-white/10 p-1.5 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-white/20">
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

function Method({ m }) {
  const colors = { GET: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' }
  return <span className={`inline-block w-14 rounded px-1.5 py-0.5 text-center font-mono text-xs font-bold ${colors[m] || 'bg-slate-200'}`}>{m}</span>
}

function Endpoint({ method, path, scope, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-white/5">
        <Method m={method} />
        <code className="flex-1 font-mono text-sm font-semibold text-slate-900 dark:text-white">{path}</code>
        <span className="hidden rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-white/10 dark:text-slate-400 sm:block">{scope}</span>
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
      </button>
      {open && <div className="space-y-3 border-t border-slate-200 p-4 text-sm dark:border-white/10">{children}</div>}
    </div>
  )
}

function Params({ rows }) {
  return (
    <table className="w-full text-xs">
      <thead><tr className="text-left text-slate-500"><th className="pb-1">Param</th><th className="pb-1">Type</th><th className="pb-1">Description</th></tr></thead>
      <tbody>
        {rows.map(([p, t, d]) => (
          <tr key={p} className="border-t border-slate-100 dark:border-white/5">
            <td className="py-1.5 pr-3 font-mono font-semibold text-indigo-600 dark:text-indigo-400">{p}</td>
            <td className="py-1.5 pr-3 text-slate-500">{t}</td>
            <td className="py-1.5 text-slate-600 dark:text-slate-400">{d}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const P = ({ children }) => <p className="text-slate-600 dark:text-slate-400">{children}</p>

export default function ApiDocs() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-extrabold text-slate-900 dark:text-white">
              <BookOpen className="h-6 w-6 text-indigo-500" /> tengaPOS Public API
            </h1>
            <p className="mt-1 text-sm text-slate-500">v1 — integrate your platform with tengaPOS tenant data</p>
          </div>
          <Link to="/" className="flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
        {/* ── Getting access ── */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-slate-900 dark:text-white">Getting access</h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
            <P>
              API keys are <b>issued by the platform Super Admin only</b>. To integrate, contact tengaPOS
              with your organisation name, a contact email, and which merchant (tenant) you need access to.
              You will receive one of two key types:
            </P>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 dark:border-teal-800 dark:bg-teal-950/30">
                <p className="flex items-center gap-2 font-bold text-slate-900 dark:text-white"><Globe className="h-4 w-4 text-teal-500" /> Publishable key</p>
                <code className="mt-1 block font-mono text-xs text-teal-700 dark:text-teal-300">tpos_pk_•••</code>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  Safe to embed in browsers, mobile apps, and public code. Read-only access to catalogue
                  endpoints (account, branches, categories, products, stock). Can be origin-restricted.
                </p>
              </div>
              <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-800 dark:bg-violet-950/30">
                <p className="flex items-center gap-2 font-bold text-slate-900 dark:text-white"><ShieldCheck className="h-4 w-4 text-violet-500" /> Integration key</p>
                <code className="mt-1 block font-mono text-xs text-violet-700 dark:text-violet-300">tpos_sk_•••</code>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  Secret server-side key. Grants whatever scopes were assigned at issuance, including writes
                  (customers, invoices). <b>Never expose it client-side.</b>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Authentication ── */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-slate-900 dark:text-white">Authentication</h2>
          <P>Send your key on every request, either as a bearer token or the <code className="font-mono text-indigo-600 dark:text-indigo-400">X-API-Key</code> header:</P>
          <div className="mt-3 space-y-3">
            <Code lang="curl">{`curl ${BASE}/v1/products \\
  -H "Authorization: Bearer tpos_sk_YOUR_KEY"`}</Code>
            <Code lang="javascript">{`const res = await fetch('${BASE}/v1/products?limit=25', {
  headers: { 'Authorization': 'Bearer tpos_sk_YOUR_KEY' }
})
const { data, meta } = await res.json()`}</Code>
            <Code lang="python">{`import requests

resp = requests.get(
    "${BASE}/v1/products",
    headers={"Authorization": "Bearer tpos_sk_YOUR_KEY"},
    params={"limit": 25},
)
products = resp.json()["data"]`}</Code>
          </div>
        </section>

        {/* ── Conventions ── */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-slate-900 dark:text-white">Conventions</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
              <p className="flex items-center gap-2 font-bold text-slate-900 dark:text-white"><Terminal className="h-4 w-4 text-indigo-500" /> Responses</p>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Lists are wrapped in <code>data</code> with a <code>meta</code> pagination block:</p>
              <Code lang="json">{`{
  "data": [ { "id": "…", "name": "…" } ],
  "meta": { "limit": 50, "offset": 0, "count": 137 }
}`}</Code>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
              <p className="flex items-center gap-2 font-bold text-slate-900 dark:text-white"><Gauge className="h-4 w-4 text-indigo-500" /> Rate limiting</p>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                Each key has a per-minute budget (default 120). Responses carry
                <code> X-RateLimit-Limit</code>, <code>-Remaining</code>, <code>-Reset</code> headers.
                Exceeding it returns <code>429</code>.
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
            <p className="flex items-center gap-2 font-bold text-slate-900 dark:text-white"><AlertTriangle className="h-4 w-4 text-amber-500" /> Errors</p>
            <Code lang="json">{`{ "error": { "code": "forbidden", "message": "Missing required scope: sales:read" } }`}</Code>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              Codes: <code>unauthorized</code> (401), <code>forbidden</code> (403), <code>not_found</code> (404),
              <code> method_not_allowed</code> (405), <code>rate_limited</code> (429),
              <code> invalid_request</code>/<code>query_failed</code> (400), <code>internal_error</code> (500).
            </p>
          </div>
        </section>

        {/* ── Endpoints ── */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
            <KeyRound className="h-5 w-5 text-indigo-500" /> Endpoints
          </h2>
          <P className="mb-4">All endpoints are relative to <code className="font-mono text-xs">{BASE}</code>. List endpoints accept <code>limit</code> (1–100, default 50) and <code>offset</code>.</P>

          <div className="space-y-2">
            <Endpoint method="GET" path="/v1/account" scope="account:read">
              <P>Returns the tenant (merchant) this key is bound to.</P>
              <Code lang="json">{`{ "data": { "id": "…", "name": "Spar Mart", "slug": "spar-mart-x1y2", "currency": "USD", "pos_mode": "retail", "plan_type": "pro_package" } }`}</Code>
            </Endpoint>

            <Endpoint method="GET" path="/v1/branches" scope="branches:read">
              <P>All active branches for the tenant.</P>
              <Params rows={[['limit', 'int', 'Page size (max 100)'], ['offset', 'int', 'Rows to skip']]} />
            </Endpoint>
            <Endpoint method="GET" path="/v1/branches/{id}" scope="branches:read">
              <P>Single branch by ID.</P>
            </Endpoint>

            <Endpoint method="GET" path="/v1/categories" scope="categories:read">
              <P>Product categories.</P>
            </Endpoint>

            <Endpoint method="GET" path="/v1/products" scope="products:read">
              <P>Product catalogue with filters.</P>
              <Params rows={[
                ['branch_id', 'uuid', 'Only products stocked at this branch'],
                ['category_id', 'uuid', 'Filter by category'],
                ['search', 'string', 'Match name, SKU or barcode (case-insensitive)'],
                ['from / to', 'ISO date', 'created_at range'],
                ['updated_since', 'ISO date', 'Only rows changed after this time — useful for sync'],
              ]} />
              <Code lang="curl">{`curl "${BASE}/v1/products?search=coca&limit=25" \\
  -H "Authorization: Bearer tpos_pk_YOUR_KEY"`}</Code>
            </Endpoint>
            <Endpoint method="GET" path="/v1/products/{id}" scope="products:read">
              <P>Single product by ID.</P>
            </Endpoint>

            <Endpoint method="GET" path="/v1/stock" scope="stock:read">
              <P>Compact stock-level view: <code>id, name, sku, barcode, stock_qty, branch_id</code>.</P>
              <Params rows={[['branch_id', 'uuid', 'Stock at one branch only']]} />
            </Endpoint>

            <Endpoint method="GET" path="/v1/customers" scope="customers:read">
              <P>Customer records (integration keys only).</P>
              <Params rows={[['search', 'string', 'Match name, phone or email']]} />
            </Endpoint>
            <Endpoint method="GET" path="/v1/customers/{id}" scope="customers:read">
              <P>Single customer by ID.</P>
            </Endpoint>
            <Endpoint method="POST" path="/v1/customers" scope="customers:write">
              <P>Create a customer.</P>
              <Code lang="json">{`{
  "name": "Jane Moyo",            // required
  "email": "jane@acme.co.zw",
  "phone": "+263771234567",
  "address": "12 Msasa Grove, Borrowdale",
  "notes": "VAT no 10001234"
}`}</Code>
            </Endpoint>

            <Endpoint method="GET" path="/v1/sales" scope="sales:read">
              <P>Completed POS transactions (receipts). Voided/archived rows are excluded.</P>
              <Params rows={[
                ['branch_id', 'uuid', 'Sales at one branch'],
                ['from / to', 'ISO date', 'created_at range — e.g. 2026-01-01T00:00:00Z'],
              ]} />
            </Endpoint>
            <Endpoint method="GET" path="/v1/sales/{id}" scope="sales:read">
              <P>Single transaction including its line-items payload.</P>
            </Endpoint>

            <Endpoint method="GET" path="/v1/orders" scope="orders:read">
              <P>Orders (active tabs/checkouts).</P>
              <Params rows={[['branch_id', 'uuid', 'Filter by branch'], ['status', 'string', 'Order status'], ['from / to', 'ISO date', 'created_at range']]} />
            </Endpoint>
            <Endpoint method="GET" path="/v1/orders/{id}" scope="orders:read">
              <P>Order plus its <code>items</code> array in one response.</P>
            </Endpoint>

            <Endpoint method="GET" path="/v1/invoices" scope="invoices:read">
              <P>Office invoices (documents where <code>doc_type = invoice</code>).</P>
              <Params rows={[['status', 'string', 'draft | sent | accepted | paid | cancelled'], ['from / to', 'ISO date', 'created_at range']]} />
            </Endpoint>
            <Endpoint method="GET" path="/v1/invoices/{id}" scope="invoices:read">
              <P>Single invoice by ID.</P>
            </Endpoint>
            <Endpoint method="POST" path="/v1/invoices" scope="invoices:write">
              <P>Create a <b>draft</b> invoice. The merchant finalises/sends it from tengaPOS.</P>
              <Code lang="json">{`{
  "customer_name": "Acme (Pvt) Ltd",   // required
  "customer_email": "ap@acme.co.zw",
  "items": [                           // required
    { "description": "Delivery fee", "qty": 1, "unit_price": 15.00 },
    { "description": "Handling", "qty": 2, "unit_price": 5.00 }
  ],
  "subtotal": 25.00, "vat_amount": 3.75, "total": 28.75,
  "due_date": "2026-02-01",
  "notes": "January deliveries"
}`}</Code>
            </Endpoint>

            <Endpoint method="GET" path="/v1/quotations" scope="invoices:read">
              <P>Quotations (documents where <code>doc_type = quotation</code>).</P>
            </Endpoint>

            <Endpoint method="GET" path="/v1/scopes" scope="any key">
              <P>Introspection — returns your key type and the scopes it can actually exercise.</P>
              <Code lang="json">{`{ "data": { "key_type": "integration", "scopes": ["account:read", "products:read", "sales:read", …] } }`}</Code>
            </Endpoint>
          </div>
        </section>

        {/* ── Security ── */}
        <section>
          <h2 className="mb-3 text-xl font-bold text-slate-900 dark:text-white">Security</h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Keys are stored hashed (SHA-256) — tengaPOS cannot recover a lost key; request a rotation.</li>
              <li>Every key is bound to exactly one tenant; there is no cross-tenant access.</li>
              <li>Publishable keys are read-only and catalogue-scoped regardless of granted scopes.</li>
              <li>Report a leaked integration key immediately — the Super Admin can revoke it instantly.</li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  )
}
