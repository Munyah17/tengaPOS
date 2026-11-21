import { ExternalLink } from 'lucide-react'

const WHATSAPP_URL = 'https://wa.me/263773909307'

const footerLinks = {
  Product: [
    { label: 'Features', href: '/#features' },
    { label: 'Pricing', href: '/#pricing' },
    { label: 'Retail POS', href: '/#features' },
    { label: 'Restaurant POS', href: '/dining' },
    { label: 'Inventory', href: '/#features' },
  ],
  Resources: [
    { label: 'Get Barcodes', href: 'https://www.scancode.co.zw', external: true },
    { label: 'Documentation', href: '/developers' },
    { label: 'API Reference', href: '/developers' },
    { label: 'Support', href: WHATSAPP_URL, external: true },
  ],
  Company: [
    { label: 'About', href: '/#features' },
    { label: 'Careers', href: WHATSAPP_URL, external: true },
    { label: 'Contact', href: WHATSAPP_URL, external: true },
    { label: 'Partners', href: 'https://www.scancode.co.zw', external: true },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Cookie Policy', href: '/privacy#cookies' },
  ],
}

export default function Footer() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950 py-16">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-extrabold text-white">
                tP
              </div>
              <span className="text-xl font-extrabold text-white">
                tenga<span className="text-brand-400">POS</span>
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-500">
              Premium cloud-based POS and inventory management for African SMEs.
            </p>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([group, links]) => (
            <div key={group}>
              <h4 className="mb-4 text-sm font-semibold text-white">{group}</h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-white"
                      >
                        {link.label}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <a
                        href={link.href}
                        className="text-sm text-slate-500 transition-colors hover:text-white"
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-8 sm:flex-row">
          <p className="text-sm text-slate-500">
            &copy; {new Date().getFullYear()} tengaPOS. All rights reserved.
          </p>
          <a
            href="https://www.scancode.co.zw"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-brand-400 transition-colors hover:text-brand-300"
          >
            Need Barcodes? Visit scancode.co.zw
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="mt-4 flex justify-center border-t border-slate-800/60 pt-4">
          <a
            href="https://globalspaceweb.co.zw"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-600 transition-colors hover:text-slate-400"
          >
            Developed &amp; Powered By Global Space Web. +263773909307
          </a>
        </div>
      </div>
    </footer>
  )
}
