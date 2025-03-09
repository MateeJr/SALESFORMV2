import { NextResponse } from 'next/server';
import whatsappService from '@/lib/whatsapp-simple';
import { 
  getAdminNumber, 
  getNotificationTemplate, 
  DEFAULT_NOTIFICATION_TEMPLATE,
  getSalesData,
  getOutletNames,
  getProducts
} from '@/lib/redis';

export async function POST(req: Request) {
  try {
    const formData = await req.json();
    console.log('Received sales form submission');
    
    // Get admin WhatsApp number
    const adminNumber = await getAdminNumber();
    if (!adminNumber) {
      console.error('Admin WhatsApp number not configured');
      return NextResponse.json(
        { success: false, error: 'Admin WhatsApp number not configured' },
        { status: 400 }
      );
    }
    console.log(`Admin number: ${adminNumber}`);

    // Get notification template
    let template = await getNotificationTemplate();
    if (!template) {
      console.log('Using default notification template');
      template = DEFAULT_NOTIFICATION_TEMPLATE;
    }

    // Enrich form data with actual names
    const enrichedData = { ...formData };
    console.log('Enriching form data with actual names');

    // Get product names
    try {
      const products = await getProducts();
      enrichedData.productDetails = products;
      console.log(`Retrieved ${Object.keys(products).length} products`);
    } catch (error) {
      console.error('Error fetching product details:', error);
    }

    // Get outlet names
    try {
      const outlets = await getOutletNames();
      if (outlets && formData.namaOutlet) {
        // If namaOutlet is an ID, replace it with the actual name
        if (outlets[formData.namaOutlet]) {
          enrichedData.outletName = outlets[formData.namaOutlet];
          console.log(`Outlet name: ${enrichedData.outletName}`);
        }
      }
    } catch (error) {
      console.error('Error fetching outlet details:', error);
    }

    // Get sales names
    try {
      const salesData = await getSalesData();
      if (salesData && formData.sales) {
        // If sales is an ID, replace it with the actual name
        if (salesData[formData.sales]) {
          enrichedData.salesName = salesData[formData.sales].name;
          console.log(`Sales name: ${enrichedData.salesName}`);
        }
      }
    } catch (error) {
      console.error('Error fetching sales details:', error);
    }

    // Process template with enriched form data
    console.log('Processing notification template');
    const message = await whatsappService.processTemplate(template, enrichedData);

    // Send WhatsApp notification with images
    await whatsappService.sendMessage(adminNumber, message, formData.images);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Sales form submission error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process sales form submission: ' + (error as Error).message },
      { status: 500 }
    );
  }
} 