import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: 'https://apt-goose-19801.upstash.io',
  token: 'AU1ZAAIjcDEyZTU2MWZhZmIwY2Q0OWQ2YTQzMzUyMWEyNDY2N2ViOXAxMA',
});

export const SALES_KEY = 'sales_data';

interface SalesData {
  name: string;
  password: string;
}

export async function getSalesData() {
  const data = await redis.get<Record<string, SalesData>>(SALES_KEY);
  return data || {};
}

export async function setSalesData(data: Record<string, SalesData>) {
  await redis.set(SALES_KEY, data);
}

// Get only sales names (for dropdown without passwords)
export async function getSalesNames() {
  const data = await getSalesData();
  return Object.entries(data).reduce((acc, [id, { name }]) => {
    acc[id] = name;
    return acc;
  }, {} as Record<string, string>);
}

// Verify sales password
export async function verifySalesPassword(salesId: string, password: string) {
  const data = await getSalesData();
  return data[salesId]?.password === password;
}

// Outlet Management Functions
export async function getOutletNames(): Promise<Record<string, string>> {
  try {
    const outlets = await redis.hgetall('outlets');
    return outlets as Record<string, string> || {};
  } catch (error) {
    console.error('Error getting outlet names:', error);
    return {};
  }
}

export async function addOutlet(outletId: string, outletName: string): Promise<void> {
  try {
    // Store the outlet name as a single string
    await redis.hset('outlets', { [outletId]: outletName });
  } catch (error) {
    console.error('Error adding outlet:', error);
    throw error;
  }
}

export async function deleteOutlet(outletId: string): Promise<void> {
  try {
    await redis.hdel('outlets', outletId);
  } catch (error) {
    console.error('Error deleting outlet:', error);
    throw error;
  }
}

// Product Management Functions
export interface Product {
  id: string;
  name: string;
}

export async function getProducts(): Promise<Record<string, Product>> {
  try {
    const products = await redis.hgetall('products');
    
    // Type-safe transformation of the result
    const typedProducts: Record<string, Product> = {};
    
    // If products exist, process them
    if (products) {
      Object.entries(products).forEach(([key, value]) => {
        // Parse the JSON string stored in Redis
        try {
          if (typeof value === 'string') {
            typedProducts[key] = JSON.parse(value) as Product;
          } else {
            // If already an object, try to cast it
            typedProducts[key] = value as unknown as Product;
          }
        } catch (e) {
          console.error(`Error parsing product ${key}:`, e);
        }
      });
    }
    
    return typedProducts;
  } catch (error) {
    console.error('Error getting products:', error);
    return {};
  }
}

export async function addProduct(productId: string, product: Product): Promise<void> {
  try {
    await redis.hset('products', { [productId]: JSON.stringify(product) });
  } catch (error) {
    console.error('Error adding product:', error);
    throw error;
  }
}

export async function deleteProduct(productId: string): Promise<void> {
  try {
    await redis.hdel('products', productId);
  } catch (error) {
    console.error('Error deleting product:', error);
    throw error;
  }
}

// Admin WhatsApp Number Functions
export const ADMIN_NUMBER_KEY = 'admin_whatsapp_number';

export async function getAdminNumber(): Promise<string | null> {
  try {
    const number = await redis.get<string>(ADMIN_NUMBER_KEY);
    return number;
  } catch (error) {
    console.error('Error getting admin number:', error);
    return null;
  }
}

export async function setAdminNumber(number: string): Promise<void> {
  try {
    await redis.set(ADMIN_NUMBER_KEY, number);
  } catch (error) {
    console.error('Error setting admin number:', error);
    throw error;
  }
}

// Notification Template Functions
export const NOTIFICATION_TEMPLATE_KEY = 'notification_template';

export async function getNotificationTemplate(): Promise<string | null> {
  try {
    const template = await redis.get<string>(NOTIFICATION_TEMPLATE_KEY);
    return template;
  } catch (error) {
    console.error('Error getting notification template:', error);
    return null;
  }
}

export async function setNotificationTemplate(template: string): Promise<void> {
  try {
    await redis.set(NOTIFICATION_TEMPLATE_KEY, template);
  } catch (error) {
    console.error('Error setting notification template:', error);
    throw error;
  }
}

// Default notification template with variables
export const DEFAULT_NOTIFICATION_TEMPLATE = 
`*NOTIF ORDER BARU*
Date: {date}
===============
Sales: {sales_name}
Outlet: {outlet_name}
Address: {address}
===============
Order Type: {order_type}
Outlet Type: {outlet_type}
Tax Type: {tax_type}
Customer Type: {customer_category}
===============
Products:
{products_list}
Total: {total_amount}
===============
Bonus: {bonus}
Billing Status: {billing_status}
Alasan: {alasan_tidak_tertagih}
===============
Lokasi Gambar: {images_locations}

Lokasi Submit: {submit_location}`; 