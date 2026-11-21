import { Link } from 'react-router-dom'

const sections = [
  {
    title: 'The service',
    body: 'tengaPOS provides cloud point-of-sale, inventory, staff and reporting tools to businesses. Some features (fiscalisation, WhatsApp receipts, AI insights, hosting) are paid add-ons activated per subscription plan. Features marked as beta may change.',
  },
  {
    title: 'Your account',
    body: 'The registering business (the tenant) is responsible for all users created under it, for keeping credentials secure, and for the accuracy of data entered. One business email registers one tenant. We may suspend accounts for non-payment after expiry, abuse, or unlawful use.',
  },
  {
    title: 'Trials and billing',
    body: 'New businesses receive a trial period. Paid subscriptions are billed per plan through Paynow or Stripe and take effect when payment confirms. Plans are quoted per billing period and are not refundable once activated except where required by law. Unused trial time lapses on conversion to a paid plan.',
  },
  {
    title: 'Fiscal and tax responsibility',
    body: 'Where you enable ZIMRA fiscalisation, tengaPOS submits sales receipts to the fiscal data management system on your behalf using your registered device. You remain responsible for the correctness of sales data, tax rates and your overall tax compliance.',
  },
  {
    title: 'Acceptable use',
    body: 'You must not use the service for unlawful activity, attempt to access another business\'s data, probe or overload the platform, or misrepresent payment confirmations. Voided, refunded and deleted transactions are audited and cannot be hidden from your own audit trail.',
  },
  {
    title: 'Availability',
    body: 'We aim for high availability but do not guarantee uninterrupted service; scheduled maintenance and provider outages can occur. Offline point-of-sale features keep working with locally queued sales where enabled. Your data belongs to you and can be exported.',
  },
  {
    title: 'Liability',
    body: 'To the extent permitted by law, tengaPOS is not liable for indirect losses (lost profits, lost data you did not back up, business interruption). Our total liability is capped at the subscription fees you paid in the previous 3 months.',
  },
  {
    title: 'Governing law',
    body: 'These terms are governed by the laws of Zimbabwe. Contact us first to resolve any dispute — WhatsApp +263 773 909 307.',
  },
]

export default function Terms() {
  return (
    <div className="min-h-screen bg-white text-slate-700 dark:bg-slate-950 dark:text-slate-300">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-extrabold text-white">
              tP
            </div>
            <span className="text-lg font-extrabold text-slate-900 dark:text-white">
              tenga<span className="text-brand-500">POS</span>
            </span>
          </Link>
          <Link to="/" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: November 2025</p>

        <p className="mt-8 text-sm leading-relaxed">
          By registering for or using tengaPOS you agree to these terms on behalf of your business.
        </p>

        <div className="mt-10 space-y-10">
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{s.title}</h2>
              <p className="mt-3 text-sm leading-relaxed">{s.body}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
