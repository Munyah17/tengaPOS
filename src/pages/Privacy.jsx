import { Link } from 'react-router-dom'

const sections = [
  {
    title: 'Who we are',
    body: 'tengaPOS is a cloud point-of-sale and business management platform operated for businesses in Zimbabwe and the region. For the data you enter about your business, staff, customers and sales, you are the data controller and tengaPOS is the data processor.',
  },
  {
    title: 'What we collect',
    body: 'Account and contact details you give us at registration (name, email, phone, business name); transaction, inventory and operational data you record in the app; device and usage information needed to keep the service secure (IP addresses, browser, error logs); and payment confirmations from our payment partners (Paynow, Stripe). We never see or store your full card or mobile-money PINs — payments are completed on the provider\'s page.',
  },
  {
    title: 'How we use it',
    body: 'To run the service you subscribed to: processing sales, syncing stock, sending receipts and reminders you configure, billing your subscription, and support. We do not sell your data, and we do not use your business data to market to your customers.',
  },
  {
    title: 'Where data lives',
    body: 'Data is hosted on Supabase infrastructure with row-level security separating each business. Payment traffic goes through Paynow and Stripe; fiscal submissions for Zimbabwe businesses go to ZIMRA when you enable fiscalisation. WhatsApp receipts go through our messaging provider only when you switch that feature on.',
  },
  {
    title: 'Retention',
    body: 'We keep your data while your account is active. After your subscription ends we may retain records where the law requires (for example fiscal and tax records). You can request export or deletion at any time by contacting us — deletion of fiscal records follows ZIMRA and ZIMRA-aligned retention rules.',
  },
  {
    title: 'Your rights',
    body: 'You may request access, correction, export or deletion of your data at any time via WhatsApp +263 773 909 307 or the support channels in the app. Business owners are responsible for staff accounts created under their tenant.',
  },
  {
    title: 'Cookies',
    body: 'tengaPOS uses essential cookies and local storage to keep you signed in and remember your preferences (theme, workspace). We do not use advertising or third-party tracking cookies.',
    id: 'cookies',
  },
  {
    title: 'Changes',
    body: 'We will update this policy as the service grows and post the new version here. Material changes affecting how your data is handled will be flagged in the app before they take effect.',
  },
]

export default function Privacy() {
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
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: November 2025</p>

        <div className="mt-10 space-y-10">
          {sections.map((s) => (
            <section key={s.title} id={s.id}>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{s.title}</h2>
              <p className="mt-3 text-sm leading-relaxed">{s.body}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
