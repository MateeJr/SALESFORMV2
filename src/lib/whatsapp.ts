import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  makeCacheableSignalKeyStore,
  makeInMemoryStore,
  proto
} from '@whiskeysockets/baileys';
import * as QRCode from 'qrcode';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs';

class WhatsAppService {
  private client: WASocket | null = null;
  private store = makeInMemoryStore({});
  private isConnected = false;
  private qr: string | null = null;
  private authFolder: string;
  private isConnecting = false;
  private connectionRetryCount = 0;
  private readonly MAX_RETRIES = 3;

  constructor() {
    // Create auth folder in the project root
    this.authFolder = path.join(process.cwd(), 'whatsapp-auth');
    if (!fs.existsSync(this.authFolder)) {
      fs.mkdirSync(this.authFolder, { recursive: true });
    }
  }

  private async cleanupOldSession() {
    try {
      const files = fs.readdirSync(this.authFolder);
      for (const file of files) {
        fs.unlinkSync(path.join(this.authFolder, file));
      }
    } catch (error) {
      console.error('Error cleaning up old session:', error);
    }
  }

  async connect() {
    // Prevent multiple simultaneous connection attempts
    if (this.isConnecting) {
      console.log('Connection attempt already in progress');
      return;
    }

    try {
      this.isConnecting = true;
      
      // If we've hit max retries, clean up the session and reset counter
      if (this.connectionRetryCount >= this.MAX_RETRIES) {
        console.log('Max retries reached, cleaning up session');
        await this.cleanupOldSession();
        this.connectionRetryCount = 0;
      }

      // Load auth state
      const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);

      // Create WA Socket with improved options
      this.client = makeWASocket({
        printQRInTerminal: false,
        auth: state,
        defaultQueryTimeoutMs: undefined,
        connectTimeoutMs: 10000,
        retryRequestDelayMs: 2000,
        maxRetries: 5,
        browser: ['Chrome (Linux)', 'Chrome', '112.0.5615.49'],
        markOnlineOnConnect: false
      });

      // Bind store to client
      this.store.bind(this.client.ev);

      // Handle connection update
      this.client.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !this.isConnected) {
          this.qr = qr;
          if (!this.isConnecting) {
            // Output QR code to console
            QRCode.toString(qr, { type: 'terminal', small: true }, (err, url) => {
              if (!err) {
                console.log(url);
              }
            });
            this.isConnecting = true;
          }
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut && 
                                statusCode !== DisconnectReason.badSession;
          
          // Check if error is due to conflict (multiple connections)
          const isConflict = (lastDisconnect?.error as any)?.message?.includes('conflict');
          
          if (isConflict) {
            console.log('Connection conflict detected - another instance is connected');
            this.isConnected = false;
            this.isConnecting = false;
            this.connectionRetryCount = this.MAX_RETRIES; // Prevent auto-reconnect
            return;
          }
          
          console.log('Connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
          this.isConnected = false;
          this.isConnecting = false;
          
          if (shouldReconnect && this.connectionRetryCount < this.MAX_RETRIES) {
            this.connectionRetryCount++;
            // Add delay before reconnecting to prevent rapid reconnection attempts
            await new Promise(resolve => setTimeout(resolve, 2000));
            await this.connect();
          } else if (statusCode === DisconnectReason.badSession) {
            await this.cleanupOldSession();
            this.connectionRetryCount = 0;
            await this.connect();
          }
        } else if (connection === 'open') {
          console.log('WhatsApp connection opened!');
          this.isConnected = true;
          this.isConnecting = false;
          this.qr = null;
          this.connectionRetryCount = 0;
        }
      });

      // Handle creds update
      this.client.ev.on('creds.update', saveCreds);

      // Handle messages
      this.client.ev.on('messages.upsert', async (m) => {
        if (m.type === 'notify') {
          for (const msg of m.messages) {
            if (!msg.key.fromMe && msg.message) {
              await this.handleIncomingMessage(msg);
            }
          }
        }
      });

    } catch (error) {
      console.error('Error in WhatsApp connection:', error);
      this.isConnected = false;
      this.isConnecting = false;
      throw error;
    }
  }

  private async handleIncomingMessage(msg: proto.IWebMessageInfo) {
    if (!this.client) return;

    const messageContent = msg.message?.conversation || 
                         msg.message?.extendedTextMessage?.text || 
                         '';
    const sender = msg.key.remoteJid;

    if (!sender) return;

    // Basic message handling
    if (messageContent.toLowerCase() === 'ping') {
      await this.client.sendMessage(sender, { text: 'pong' });
    }
  }

  async sendMessage(to: string, message: string) {
    // Try to reconnect if not connected
    if (!this.isConnected || this.client === null) {
      try {
        console.log('WhatsApp client not connected or null, attempting to connect...');
        await this.connect();
        // Wait a moment for the connection to establish
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        console.error('Failed to reconnect before sending message:', error);
      }
    }

    // Double check if client exists after connection attempt
    if (!this.client) {
      console.error('WhatsApp client is still null after connection attempt');
      throw new Error('WhatsApp client is not initialized');
    }

    try {
      // Ensure the number is a string and remove any spaces or special characters
      const cleanNumber = String(to).replace(/[^0-9]/g, '');
      
      // Format the number to ensure it has the correct format
      const formattedNumber = cleanNumber.startsWith('62') 
        ? `${cleanNumber}@s.whatsapp.net` 
        : `62${cleanNumber}@s.whatsapp.net`;
      
      console.log(`Attempting to send message to ${formattedNumber}`);
      
      // Check if client.sendMessage exists
      if (typeof this.client.sendMessage !== 'function') {
        console.error('WhatsApp client.sendMessage is not a function:', this.client);
        throw new Error('WhatsApp client is not properly initialized');
      }
      
      await this.client.sendMessage(formattedNumber, { text: message });
      
      // If we successfully sent a message, we must be connected
      this.isConnected = true;
      console.log('Message sent successfully');
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  getQR() {
    return this.qr;
  }

  isClientConnected() {
    return this.isConnected;
  }

  async deleteSession() {
    this.client = null;
    this.isConnected = false;
    this.qr = null;
    this.isConnecting = false;
    this.connectionRetryCount = 0;
    await this.cleanupOldSession();
  }
}

// Create a singleton instance
const whatsappService = new WhatsAppService();

// Add a function to process notification templates
async function processTemplate(template: string, data: any): Promise<string> {
  let processedTemplate = template;

  // Replace date variable
  processedTemplate = processedTemplate.replace(/{date}/g, new Date().toLocaleDateString('id-ID'));

  // Replace sales name - use the actual name, not ID
  if (data.salesName) {
    // Use the enriched sales name if available
    processedTemplate = processedTemplate.replace(/{sales_name}/g, data.salesName);
  } else if (data.sales) {
    // Fallback to the original sales field
    processedTemplate = processedTemplate.replace(/{sales_name}/g, data.sales);
  }

  // Replace outlet name - use the actual name, not ID
  if (data.outletName) {
    // Use the enriched outlet name if available
    processedTemplate = processedTemplate.replace(/{outlet_name}/g, data.outletName);
  } else if (data.namaOutlet) {
    // Fallback to the original outlet field
    processedTemplate = processedTemplate.replace(/{outlet_name}/g, data.namaOutlet);
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

  return processedTemplate;
}

// Export the service
export default {
  connect: whatsappService.connect.bind(whatsappService),
  isClientConnected: whatsappService.isClientConnected.bind(whatsappService),
  getQR: whatsappService.getQR.bind(whatsappService),
  deleteSession: whatsappService.deleteSession.bind(whatsappService),
  sendMessage: whatsappService.sendMessage.bind(whatsappService),
  processTemplate,
}; 