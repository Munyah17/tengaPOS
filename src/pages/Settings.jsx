import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Settings as SettingsIcon, Store, CreditCard, Receipt,
  Bell, Shield, Palette, Globe, ExternalLink,
} from 'lucide-react'
import Button from '@/components/common/Button'
import ThemeToggle from '@/components/common/ThemeToggle'
import { useThemeStore } from '@/stores/themeStore'

const sections = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'store', label: 'Store', icon: Store },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'receipts', label: 'Receipts', icon: Receipt },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'whitelabel', label: 'White Label', icon: Globe },
]

export default function Settings() {
  const [activeSection, setActiveSection] = useState('general')
  const { posMode, setPosMode } = useThemeStore()

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-sm text-slate-500">Manage your store configuration</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-56 flex-shrink-0">
          <div className="space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  activeSection === section.id
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-400'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                <section.icon className="h-4 w-4" />
                {section.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            {activeSection === 'general' && (
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">General Settings</h3>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Business Name</label>
                  <input
                    type="text"
                    defaultValue="Demo Store"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Currency</label>
                  <select className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                    <option>USD - US Dollar</option>
                    <option>ZWL - Zimbabwe Dollar</option>
                    <option>ZAR - South African Rand</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Tax Rate (%)</label>
                  <input
                    type="number"
                    defaultValue="15"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <Button>Save Changes</Button>
              </div>
            )}

            {activeSection === 'appearance' && (
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Appearance</h3>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Theme Mode</label>
                  <ThemeToggle />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">POS Mode</label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setPosMode('retail')}
                      className={`flex-1 rounded-xl border-2 p-4 text-center ${
                        posMode === 'retail'
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="mb-2 h-3 w-full rounded bg-brand-500" />
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">Retail (Blue)</span>
                    </button>
                    <button
                      onClick={() => setPosMode('restaurant')}
                      className={`flex-1 rounded-xl border-2 p-4 text-center ${
                        posMode === 'restaurant'
                          ? 'border-restaurant-500 bg-restaurant-50 dark:bg-restaurant-950'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="mb-2 h-3 w-full rounded bg-restaurant-500" />
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">Restaurant (Green)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'payments' && (
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Payment Methods</h3>
                <p className="text-sm text-slate-500">Enable or disable payment methods for your store.</p>
                {['Cash', 'EcoCash', 'InnBucks', 'Omari', 'OneMoney', 'ZIPIT', 'Visa', 'Mastercard', 'POS Terminal'].map((method) => (
                  <div key={method} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{method}</span>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input type="checkbox" defaultChecked className="peer sr-only" />
                      <div className="peer h-5 w-9 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-brand-600 peer-checked:after:translate-x-full dark:bg-slate-600" />
                    </label>
                  </div>
                ))}
              </div>
            )}

            {activeSection === 'receipts' && (
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Receipt Settings</h3>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Receipt Header</label>
                  <input
                    type="text"
                    defaultValue="Thank you for shopping with us!"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Receipt Footer</label>
                  <input
                    type="text"
                    defaultValue="Powered by tengaPOS"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                  <div>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">ZIMRA Fiscalisation</span>
                    <p className="text-xs text-slate-500">$20/device/month</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input type="checkbox" className="peer sr-only" />
                    <div className="peer h-5 w-9 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-brand-600 peer-checked:after:translate-x-full dark:bg-slate-600" />
                  </label>
                </div>
                <Button>Save Changes</Button>
              </div>
            )}

            {activeSection === 'whitelabel' && (
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">White Label Branding</h3>
                <p className="text-sm text-slate-500">
                  Customize your POS with your own branding. $50 once-off fee.
                </p>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Custom Domain</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="yourstore"
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <span className="text-sm text-slate-500">.tengapos.com</span>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Brand Color</label>
                  <input type="color" defaultValue="#2563eb" className="h-10 w-20 rounded-lg" />
                </div>
                <Button>Enable White Label — $50</Button>
              </div>
            )}

            {activeSection === 'store' && (
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Store Details</h3>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Store Address</label>
                  <input
                    type="text"
                    defaultValue="123 Samora Machel Ave, Harare"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Phone</label>
                  <input
                    type="text"
                    defaultValue="+263 77 123 4567"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <Button>Save Changes</Button>
              </div>
            )}

            {(activeSection === 'notifications' || activeSection === 'security') && (
              <div className="space-y-6">
                <h3 className="text-lg font-bold capitalize text-slate-900 dark:text-white">{activeSection}</h3>
                <p className="text-sm text-slate-500">Configure {activeSection} settings for your store.</p>
                <div className="space-y-3">
                  {[
                    { label: 'Low stock alerts', enabled: true },
                    { label: 'Daily sales summary', enabled: true },
                    { label: 'New staff activity', enabled: false },
                    { label: 'Transaction alerts', enabled: true },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                      <span className="text-sm font-medium text-slate-900 dark:text-white">{item.label}</span>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input type="checkbox" defaultChecked={item.enabled} className="peer sr-only" />
                        <div className="peer h-5 w-9 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-brand-600 peer-checked:after:translate-x-full dark:bg-slate-600" />
                      </label>
                    </div>
                  ))}
                </div>
                <Button>Save Changes</Button>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}
