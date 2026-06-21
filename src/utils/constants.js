export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', icon: 'Banknote' },
  { id: 'ecocash', label: 'EcoCash', icon: 'Smartphone' },
  { id: 'innbucks', label: 'InnBucks', icon: 'Smartphone' },
  { id: 'omari', label: 'Omari', icon: 'Smartphone' },
  { id: 'onemoney', label: 'OneMoney', icon: 'Smartphone' },
  { id: 'zipit', label: 'ZIPIT', icon: 'ArrowLeftRight' },
  { id: 'visa', label: 'Visa', icon: 'CreditCard' },
  { id: 'mastercard', label: 'Mastercard', icon: 'CreditCard' },
  { id: 'pos_terminal', label: 'POS Terminal', icon: 'Monitor' },
]

export const ORDER_STATUSES = [
  { id: 'received', label: 'Received', color: 'bg-blue-500' },
  { id: 'waiting', label: 'Waiting', color: 'bg-yellow-500' },
  { id: 'cooking', label: 'Cooking', color: 'bg-orange-500' },
  { id: 'ready', label: 'Ready for Collection', color: 'bg-green-500' },
]

export const USER_ROLES = {
  developer: ['super_admin', 'admin', 'associate'],
  vendor: ['vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant', 'tech_support'],
}

export const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  admin: ['manage_vendors', 'view_analytics', 'manage_system'],
  associate: ['view_analytics', 'support_vendors'],
  vendor: ['manage_store', 'manage_staff', 'view_analytics', 'manage_inventory', 'manage_tasks', 'pos_access'],
  shop_manager: ['manage_branch', 'manage_staff', 'view_analytics', 'manage_inventory', 'pos_access'],
  supervisor: ['view_analytics', 'manage_inventory', 'pos_access', 'void_transactions'],
  cashier: ['pos_access'],
  shop_assistant: ['pos_access', 'view_inventory'],
  tech_support: ['view_system', 'manage_devices'],
}

export const PRICING = {
  hardwareCombo: { price: 0, period: '6 months', renewal: 10 },
  softwareOnly: { price: 50, period: 'month' },
  fiscalisation: { price: 20, period: 'device/month' },
  whiteLabel: { price: 50, type: 'once-off' },
}

export const DEMO_CATEGORIES = [
  { id: 'all', name: 'All Products' },
  { id: 'beverages', name: 'Beverages' },
  { id: 'snacks', name: 'Snacks' },
  { id: 'dairy', name: 'Dairy' },
  { id: 'produce', name: 'Produce' },
  { id: 'meat', name: 'Meat' },
  { id: 'bakery', name: 'Bakery' },
  { id: 'household', name: 'Household' },
]

export const DEMO_PRODUCTS = [
  { id: 1, name: 'Coca-Cola 500ml', brand: 'Coca-Cola', price: 1.50, sku: 'BEV-001', barcode: '5449000000996', category: 'beverages', stock: 145, image: null },
  { id: 2, name: 'Bread - White Loaf', brand: 'Bakers Inn', price: 1.20, sku: 'BAK-001', barcode: '6001240000012', category: 'bakery', stock: 42, image: null },
  { id: 3, name: 'Fresh Milk 1L', brand: 'Dairibord', price: 2.50, sku: 'DAI-001', barcode: '6001007000015', category: 'dairy', stock: 67, image: null },
  { id: 4, name: 'Chicken Portions 1kg', brand: "Irvine's", price: 5.99, sku: 'MEA-001', barcode: '6001007000022', category: 'meat', stock: 28, image: null },
  { id: 5, name: 'Tomatoes 1kg', brand: 'Fresh Produce', price: 2.00, sku: 'PRO-001', barcode: '6001007000039', category: 'produce', stock: 89, image: null },
  { id: 6, name: 'Lays Chips 125g', brand: 'Simba', price: 1.80, sku: 'SNK-001', barcode: '6001007000046', category: 'snacks', stock: 203, image: null },
  { id: 7, name: 'Fanta Orange 500ml', brand: 'Coca-Cola', price: 1.50, sku: 'BEV-002', barcode: '5449000000997', category: 'beverages', stock: 178, image: null },
  { id: 8, name: 'Yoghurt Strawberry 500ml', brand: 'Dairibord', price: 1.99, sku: 'DAI-002', barcode: '6001007000053', category: 'dairy', stock: 54, image: null },
  { id: 9, name: 'Rice 2kg', brand: 'Sunsalve', price: 4.50, sku: 'GRO-001', barcode: '6001007000060', category: 'household', stock: 112, image: null },
  { id: 10, name: 'Cooking Oil 750ml', brand: 'Willowton', price: 3.75, sku: 'GRO-002', barcode: '6001007000077', category: 'household', stock: 78, image: null },
  { id: 11, name: 'Beef Mince 500g', brand: 'Crest Breeders', price: 6.50, sku: 'MEA-002', barcode: '6001007000084', category: 'meat', stock: 15, image: null },
  { id: 12, name: 'Bananas 1kg', brand: 'Fresh Produce', price: 1.75, sku: 'PRO-002', barcode: '6001007000091', category: 'produce', stock: 95, image: null },
  { id: 13, name: 'Sprite 500ml', brand: 'Coca-Cola', price: 1.50, sku: 'BEV-003', barcode: '5449000000998', category: 'beverages', stock: 134, image: null },
  { id: 14, name: 'Cheese Cheddar 200g', brand: 'Kefalos', price: 3.25, sku: 'DAI-003', barcode: '6001007000108', category: 'dairy', stock: 41, image: null },
  { id: 15, name: 'Brown Bread Loaf', brand: 'Bakers Inn', price: 1.40, sku: 'BAK-002', barcode: '6001240000029', category: 'bakery', stock: 36, image: null },
  { id: 16, name: 'Maputi 100g', brand: 'Proton Snacks', price: 0.50, sku: 'SNK-002', barcode: '6001007000115', category: 'snacks', stock: 320, image: null },
]

export const RESTAURANT_DEMO_PRODUCTS = [
  { id: 101, name: 'Sadza & Beef Stew', brand: 'House Special', price: 8.00, sku: 'RST-001', barcode: 'RST001', category: 'mains', stock: 999, image: null },
  { id: 102, name: 'Sadza & Chicken', brand: 'House Special', price: 7.50, sku: 'RST-002', barcode: 'RST002', category: 'mains', stock: 999, image: null },
  { id: 103, name: 'T-Bone Steak', brand: 'The Grill', price: 15.00, sku: 'RST-003', barcode: 'RST003', category: 'mains', stock: 999, image: null },
  { id: 104, name: 'Fish & Chips', brand: 'The Grill', price: 9.50, sku: 'RST-004', barcode: 'RST004', category: 'mains', stock: 999, image: null },
  { id: 105, name: 'Caesar Salad', brand: 'Kitchen', price: 6.00, sku: 'RST-005', barcode: 'RST005', category: 'starters', stock: 999, image: null },
  { id: 106, name: 'Mushroom Soup', brand: 'Kitchen', price: 4.50, sku: 'RST-006', barcode: 'RST006', category: 'starters', stock: 999, image: null },
  { id: 107, name: 'Coke 330ml', brand: 'Coca-Cola', price: 2.00, sku: 'RST-007', barcode: 'RST007', category: 'drinks', stock: 999, image: null },
  { id: 108, name: 'Water 500ml', brand: 'Aqua', price: 1.50, sku: 'RST-008', barcode: 'RST008', category: 'drinks', stock: 999, image: null },
  { id: 109, name: 'Ice Cream Sundae', brand: 'Kitchen', price: 5.00, sku: 'RST-009', barcode: 'RST009', category: 'desserts', stock: 999, image: null },
  { id: 110, name: 'Chocolate Brownie', brand: 'Kitchen', price: 4.00, sku: 'RST-010', barcode: 'RST010', category: 'desserts', stock: 999, image: null },
]
