import Dexie from 'dexie'

export const db = new Dexie('tengaPOS')

db.version(1).stores({
  products: '++id, sku, barcode, name, category, tenant_id, branch_id, [tenant_id+branch_id]',
  transactions: '++id, receipt_number, tenant_id, branch_id, created_at, synced, [tenant_id+synced]',
  transactionItems: '++id, transaction_id, product_id, tenant_id',
  categories: '++id, name, tenant_id, branch_id',
  customers: '++id, name, phone, tenant_id',
  syncQueue: '++id, table_name, operation, data, created_at, retries',
  settings: 'key',
})

export async function addToSyncQueue(tableName, operation, data) {
  await db.syncQueue.add({
    table_name: tableName,
    operation,
    data,
    created_at: new Date().toISOString(),
    retries: 0,
  })
}

export async function getSyncQueueItems() {
  return db.syncQueue.where('retries').below(5).toArray()
}

export async function removeSyncQueueItem(id) {
  await db.syncQueue.delete(id)
}

export async function incrementRetry(id) {
  await db.syncQueue.update(id, { retries: db.syncQueue.get(id).then(item => (item?.retries || 0) + 1) })
}
