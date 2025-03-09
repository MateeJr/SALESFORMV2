import makeWASocket, { 
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  makeCacheableSignalKeyStore,
  BaileysEventMap
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';

// Keep track of the global WhatsApp instance
let waSocket: WASocket | null = null;
let isConnected = false;
let qrCode: string | null = null;
let isConnecting = false;
let lastConnectionAttempt = 0;
const COOLDOWN_PERIOD = 30000; // 30 seconds

// Create and ensure auth folder exists
const AUTH_FOLDER = path.join(process.cwd(), 'whatsapp-auth');
if (!fs.existsSync(AUTH_FOLDER)) {
  fs.mkdirSync(AUTH_FOLDER, { recursive: true });
}

// Add a file-based QR code storage for persistence
const QR_CODE_FILE = path.join(process.cwd(), 'whatsapp-auth', 'qrcode.txt');

// Load QR code from file if it exists
try {
  if (fs.existsSync(QR_CODE_FILE)) {
    qrCode = fs.readFileSync(QR_CODE_FILE, 'utf8');
    console.log('Loaded QR code from file');
  }
} catch (error) {
  console.error('Error loading QR code from file:', error);
}

// Function to save QR code to file
function saveQRCode(qr: string | null) {
  try {
    if (qr) {
      fs.writeFileSync(QR_CODE_FILE, qr);
      console.log('Saved QR code to file');
    } else if (fs.existsSync(QR_CODE_FILE)) {
      fs.unlinkSync(QR_CODE_FILE);
      console.log('Deleted QR code file');
    }
  } catch (error) {
    console.error('Error saving QR code to file:', error);
  }
}

/**
 * Initiate a WhatsApp connection
 */
async function connectToWhatsApp(force = false): Promise<boolean> {
  // Prevent multiple simultaneous connection attempts
  if (isConnecting) {
    console.log('Already attempting to connect');
    return false;
  }
  
  // Don't reconnect if already connected
  if (isConnected && waSocket && !force) {
    console.log('Already connected to WhatsApp');
    return true;
  }
  
  // Enforce cooldown period
  const now = Date.now();
  if (!force && now - lastConnectionAttempt < COOLDOWN_PERIOD) {
    console.log('Connection attempt on cooldown');
    return false;
  }
  
  lastConnectionAttempt = now;
  isConnecting = true;
  
  try {
    console.log('Loading auth state...');
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    
    // Close existing connection if any
    if (waSocket) {
      console.log('Closing existing connection...');
      try {
        waSocket.ev.removeAllListeners('connection.update' as keyof BaileysEventMap);
        await (waSocket as any).end('session ended');
        waSocket = null;
      } catch (error) {
        console.error('Error ending connection:', error);
      }
    }
    
    console.log('Creating new WhatsApp connection...');
    
    // Simplify the socket creation to ensure compatibility
    waSocket = makeWASocket({
      auth: state,
      printQRInTerminal: false, // Disable built-in QR printing
      browser: ['Chrome', '', ''],
      connectTimeoutMs: 60000,
      qrTimeout: 120000,
      defaultQueryTimeoutMs: 60000
    });
    
    // Listen for connection updates
    waSocket.ev.on('connection.update', async (update) => {
      console.log('Connection update:', update);
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        try {
          // Generate QR code as data URL
          qrCode = await QRCode.toDataURL(qr);
          saveQRCode(qrCode);
          console.log('New QR code generated');
        } catch (error) {
          console.error('Error generating QR code:', error);
          qrCode = null;
        }
        isConnecting = false;
      }
      
      if (connection === 'open') {
        isConnected = true;
        isConnecting = false;
        qrCode = null;
        saveQRCode(null);
        console.log('Connected to WhatsApp!');
      } else if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        console.log(`Disconnected from WhatsApp, status code: ${statusCode}`);
        
        // Special handling for code 515 (restart required)
        if (statusCode === 515) {
          console.log('Restart required (code 515), reconnecting...');
          isConnected = false;
          isConnecting = false;
          
          // Wait a bit before reconnecting
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Force reconnect
          connectToWhatsApp(true).catch(err => {
            console.error('Failed to reconnect after 515 error:', err);
          });
          return;
        }
        
        // Special handling for new login indication
        if (update.isNewLogin) {
          console.log('New login detected, reconnecting...');
          isConnected = false;
          isConnecting = false;
          
          // Wait a bit before reconnecting
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Force reconnect
          connectToWhatsApp(true).catch(err => {
            console.error('Failed to reconnect after new login:', err);
          });
          return;
        }
        
        isConnected = false;
        isConnecting = false;
      }
    });
    
    // Save credentials when updated
    waSocket.ev.on('creds.update', saveCreds);
    
    // Wait for connection to establish or QR to be generated
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('Connection setup complete, connected:', isConnected, 'QR code available:', !!qrCode);
    isConnecting = false;
    return isConnected;
  } catch (error) {
    console.error('Failed to connect to WhatsApp:', error);
    isConnected = false;
    isConnecting = false;
    return false;
  }
}

/**
 * Delete the WhatsApp session
 */
async function deleteSession(): Promise<boolean> {
  try {
    console.log('Deleting WhatsApp session...');
    
    // End the connection if it exists
    if (waSocket) {
      waSocket.ev.removeAllListeners('connection.update' as keyof BaileysEventMap);
      await (waSocket as any).end('session ended');
      waSocket = null;
    }
    
    // Reset state
    isConnected = false;
    qrCode = null;
    saveQRCode(null); // Delete QR code file
    isConnecting = false;
    
    // Delete auth files
    const files = fs.readdirSync(AUTH_FOLDER);
    for (const file of files) {
      fs.unlinkSync(path.join(AUTH_FOLDER, file));
    }
    
    console.log('WhatsApp session deleted');
    return true;
  } catch (error) {
    console.error('Failed to delete WhatsApp session:', error);
    return false;
  }
}

/**
 * Send a WhatsApp message with optional images
 */
async function sendMessage(to: string, message: string, images?: string[]): Promise<any> {
  let retryCount = 0;
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds

  while (retryCount < maxRetries) {
    try {
      if (!isConnected || !waSocket) {
        // Try to connect if not already connected
        console.log('Not connected, attempting to connect...');
        const connected = await connectToWhatsApp();
        if (!connected) {
          throw new Error('Failed to connect to WhatsApp');
        }
        
        // Wait for connection to stabilize
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        if (!isConnected || !waSocket) {
          throw new Error('Still not connected to WhatsApp after connection attempt');
        }
      }
      
      // Format phone number
      const cleanNumber = String(to).replace(/[^\d]/g, '');
      const formattedNumber = cleanNumber.startsWith('62') 
        ? `${cleanNumber}@s.whatsapp.net` 
        : `62${cleanNumber}@s.whatsapp.net`;
      
      console.log(`Sending message to ${formattedNumber} (Attempt ${retryCount + 1}/${maxRetries})`);

      let result;
      
      // If there are images, send them first
      if (images && images.length > 0) {
        console.log(`Sending ${images.length} images...`);
        
        // Send each image, with caption only on the last one
        for (let i = 0; i < images.length; i++) {
          const imageData = images[i];
          const isLastImage = i === images.length - 1;
          
          // Convert base64 to buffer
          const imageBuffer = Buffer.from(
            imageData.replace(/^data:image\/\w+;base64,/, ''),
            'base64'
          );

          // Try sending image with retries
          let imageRetryCount = 0;
          while (imageRetryCount < 3) {
            try {
              result = await waSocket.sendMessage(formattedNumber, {
                image: imageBuffer,
                caption: isLastImage ? message : undefined,
              });
              break; // Success, exit retry loop
            } catch (error) {
              imageRetryCount++;
              if (imageRetryCount === 3) throw error;
              console.log(`Retrying image send (${imageRetryCount}/3)...`);
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
          
          // Small delay between sending images
          if (!isLastImage) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      } else {
        // If no images, just send the text message
        result = await waSocket.sendMessage(formattedNumber, { text: message });
      }
      
      console.log('Message sent successfully');
      return result;
    } catch (error: any) {
      console.error(`Failed to send message (Attempt ${retryCount + 1}/${maxRetries}):`, error);
      
      // Check if we need to force reconnect
      if (error.message?.includes('Connection Closed') || 
          error.message?.includes('Stream Errored') ||
          (error.output as any)?.statusCode === 440) {
        console.log('Connection issue detected, forcing reconnect...');
        isConnected = false;
        if (waSocket) {
          try {
            waSocket.ev.removeAllListeners('connection.update' as keyof BaileysEventMap);
            await (waSocket as any).end('session ended');
          } catch (e) {
            console.error('Error closing socket:', e);
          }
          waSocket = null;
        }
        // Delete session and wait before retry
        try {
          await deleteSession();
        } catch (e) {
          console.error('Error deleting session:', e);
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }

      retryCount++;
      if (retryCount === maxRetries) throw error;
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

/**
 * Process a notification template with data
 */
async function processTemplate(template: string, data: any): Promise<string> {
  let processedTemplate = template;

  // Replace date variable
  processedTemplate = processedTemplate.replace(/{date}/g, new Date().toLocaleDateString('id-ID'));

  // Replace sales name - use the actual name, not ID
  if (data.salesName) {
    processedTemplate = processedTemplate.replace(/{sales_name}/g, data.salesName);
  } else if (data.sales) {
    processedTemplate = processedTemplate.replace(/{sales_name}/g, data.sales);
  }

  // Replace outlet name - use the actual name, not ID
  if (data.outletName) {
    processedTemplate = processedTemplate.replace(/{outlet_name}/g, data.outletName);
  } else if (data.namaOutlet) {
    processedTemplate = processedTemplate.replace(/{outlet_name}/g, data.namaOutlet);
  }
  
  // Replace outlet type
  if (data.tipeOutlet) {
    processedTemplate = processedTemplate.replace(/{outlet_type}/g, data.tipeOutlet);
  } else {
    processedTemplate = processedTemplate.replace(/{outlet_type}/g, '-');
  }

  // Replace address
  if (data.alamat) {
    processedTemplate = processedTemplate.replace(/{address}/g, data.alamat);
  }

  // Replace order type
  if (data.tipePesanan) {
    processedTemplate = processedTemplate.replace(/{order_type}/g, data.tipePesanan);
  }

  // Replace tax type
  if (data.tipePajak) {
    processedTemplate = processedTemplate.replace(/{tax_type}/g, data.tipePajak);
  }

  // Replace customer category
  if (data.kategoriCustomer) {
    processedTemplate = processedTemplate.replace(/{customer_category}/g, data.kategoriCustomer);
  }

  // Replace bonus
  processedTemplate = processedTemplate.replace(/{bonus}/g, data.bonus || '-');

  // Replace billing status
  if (data.penagihan) {
    processedTemplate = processedTemplate.replace(/{billing_status}/g, data.penagihan);
  }

  // Replace alasan tidak tertagih
  processedTemplate = processedTemplate.replace(
    /{alasan_tidak_tertagih}/g, 
    data.penagihan === 'TIDAK TERTAGIH' && data.alasanTidakTertagih 
      ? data.alasanTidakTertagih 
      : '-'
  );

  // Process products list - use product names instead of IDs
  if (data.selectedProducts && Object.keys(data.selectedProducts).length > 0) {
    let productsText = '';
    
    Object.entries(data.selectedProducts).forEach(([productId, product]: [string, any]) => {
      const price = parseInt(product.hargaJual).toLocaleString('id-ID');
      
      // Try to get the product name from the productDetails if available
      let productName = productId;
      if (data.productDetails && data.productDetails[productId]) {
        productName = data.productDetails[productId].name;
      } else {
        // Fallback to formatting the ID if product details not available
        productName = productId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      }
      
      productsText += `- ${productName}: ${product.jumlah} x Rp ${price}\n`;
    });
    
    processedTemplate = processedTemplate.replace(/{products_list}/g, productsText);
  } else {
    processedTemplate = processedTemplate.replace(/{products_list}/g, 'No products');
  }

  // Calculate and replace total amount
  if (data.selectedProducts && Object.keys(data.selectedProducts).length > 0) {
    const total = Object.values(data.selectedProducts).reduce((sum: number, product: any) => {
      const price = parseInt(product.hargaJual);
      const quantity = parseInt(product.jumlah);
      return sum + (isNaN(price) || isNaN(quantity) ? 0 : price * quantity);
    }, 0);
    
    processedTemplate = processedTemplate.replace(
      /{total_amount}/g, 
      `Rp ${total.toLocaleString('id-ID')}`
    );
  } else {
    processedTemplate = processedTemplate.replace(/{total_amount}/g, 'Rp 0');
  }

  // Process images locations
  if (data.imagesLocations && data.imagesLocations.length > 0) {
    let locationsText = '';
    data.imagesLocations.forEach((loc: any, index: number) => {
      if (loc) {
        locationsText += `Image ${index + 1}: ${loc.url}\n`;
        locationsText += `Taken at: ${loc.timestamp}\n`;
      } else {
        locationsText += `Image ${index + 1}: Location not available\n`;
      }
    });
    processedTemplate = processedTemplate.replace(/{images_locations}/g, locationsText.trim());
  } else {
    processedTemplate = processedTemplate.replace(/{images_locations}/g, 'No image locations available');
  }

  // Process submit location
  if (data.submitLocation) {
    let submitLocationText = `${data.submitLocation.url}\n`;
    submitLocationText += `Submitted at: ${data.submitLocation.timestamp}`;
    processedTemplate = processedTemplate.replace(/{submit_location}/g, submitLocationText);
  } else {
    processedTemplate = processedTemplate.replace(/{submit_location}/g, 'Submit location not available');
  }

  return processedTemplate;
}

/**
 * Check if connected to WhatsApp
 */
function isConnectedToWhatsApp(): boolean {
  return isConnected;
}

/**
 * Get the current QR code if available
 */
function getQRCode(): string | null {
  return qrCode;
}

// Export the simplified WhatsApp service
export default {
  connect: connectToWhatsApp,
  isConnected: isConnectedToWhatsApp,
  getQR: getQRCode,
  deleteSession,
  sendMessage,
  processTemplate
}; 