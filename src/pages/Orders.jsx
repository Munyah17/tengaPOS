import { motion } from 'framer-motion'
import { ClipboardList, Eye } from 'lucide-react'
import ExportMenu from '@/components/common/ExportMenu'
import { formatCurrency, formatDateTime } from '@/utils/formatters'

const orders = [
  { id: 'TP-260524-0001', date: '2026-05-24T14:30:00', items: 3, total: 15.50, method: 'Cash', status: 'completed', customer: 'Walk-in' },
  { id: 'TP-260524-0002', date: '2026-05-24T14:22:00', items: 7, total: 42.75, method: 'EcoCash', status: 'completed', customer: 'Walk-in' },
  { id: 'TP-260524-0003', date: '2026-05-24T14:15:00', items: 2, total: 8.20, method: 'Cash', status: 'completed', customer: 'Walk-in' },
  { id: 'TP-260524-0004', date: '2026-05-24T14:08:00', items: 12, total: 67.90, method: 'Visa', status: 'completed', customer: 'John D.' },
  { id: 'TP-260524-0005', date: '2026-05-24T13:55:00', items: 4, total: 23.00, method: 'InnBucks', status: 'refunded', customer: 'Walk-in' },
  { id: 'TP-260524-0006', date: '2026-05-24T13:40:00', items: 8, total: 55.25, method: 'Mastercard', status: 'completed', customer: 'Sarah M.' },
  { id: 'TP-260524-0007', date: '2026-05-24T13:25:00', items: 1, total: 5.99, method: 'Cash', status: 'completed', customer: 'Walk-in' },
]

const exportColumns = [
  { header: 'Order ID', key: 'id' },
  { header: 'Date', key: 'date' },
  { header: 'Items', key: 'items' },
  { header: 'Total', key: 'total' },
  { header: 'Method', key: 'method' },
  { header: 'Status', key: 'status' },
]

export default function Orders() {
  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Orders</h1>
          <p className="text-sm text-slate-500">View and manage all transactions</p>
        </div>
        <ExportMenu data={orders} columns={exportColumns} title="Orders" filename="tengapos_orders" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
              {['Order ID', 'Date', 'Customer', 'Items', 'Total', 'Payment', 'Status', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <motion.tr
                key={order.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
              >
                <td className="px-4 py-3 text-sm font-mono font-medium text-slate-900 dark:text-white">{order.id}</td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatDateTime(order.date)}</td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{order.customer}</td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{order.items}</td>
                <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(order.total)}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {order.method}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    order.status === 'completed'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                  }`}>
                    {order.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                    <Eye className="h-4 w-4" />
                  </button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
