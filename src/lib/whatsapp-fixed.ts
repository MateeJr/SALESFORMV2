import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  makeInMemoryStore,
  proto
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import path from 'path';
import fs from 'fs';

// Global singleton instance to prevent multiple instances
let globalWhatsAppInstance: WhatsAppService | null = null;

class WhatsAppService {
  private client: WASocket | null = null;
  private store = makeInMemoryStore({});
  private isConnected = false;
  private qr: string | null = null;
  private authFolder: string;
  private isConnecting = false;
  private connectionAttemptTimestamp = 0;
  private readonly CONNECTION_COOLDOWN = 30000; // 30 seconds cooldown between connection attempts

  constructor() {
    // Create auth folder in the project root
    this.authFolder = path.join(process.cwd(), 'whatsapp-auth');
    if (!fs.existsSync(this.authFolder)) {
      fs.mkdirSync(this.authFolder, { recursive: true });
    }
    
    // Don't auto-connect on initialization - wait for explicit connect call
  }

  private async cleanupOldSession() {
    try {
      const files = fs.readdirSync(this.authFolder);
      for (const file of files) {
        fs.unlinkSync(path.join(this.authFolder, file));
      }
      console.log('Old WhatsApp session cleaned up');
    } catch (error) {
      console.error('Error cleaning up old session:', error);
    }
  }

  async connect() {
    // Check if we're already connecting
    if (this.isConnecting) {
      console.log('Connection attempt already in progress, skipping');
      return false;
    }
    
    // Check if we're already connected
    if (this.isConnected && this.client) {
      console.log('Already connected, skipping connection attempt');
      return true;
    }
    
    // Check if we need to wait for cooldown
    const now = Date.now();
    if (now - this.connectionAttemptTimestamp < this.CONNECTION_COOLDOWN) {
      console.log('Connection attempt on cooldown, skipping');
      return false;
    }
    
    // Set connection attempt timestamp
    this.connectionAttemptTimestamp = now;
    
    try {
      this.isConnecting = true;
      console.log('Starting WhatsApp connection...');
      
      // Load auth state
      const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);
      console.log('Auth state loaded');

      // Create WA Socket with minimal options
      this.client = makeWASocket({
        printQRInTerminal: true,
        auth: state,
        browser: ['Chrome (Linux)', 'Chrome', '112.0.5615.49'],
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        qrTimeout: 60000,
        defaultQueryTimeoutMs: 60000,
        emitOwnEvents: false,
        shouldIgnoreJid: jid => jid.includes('@broadcast')
      });
      console.log('WhatsApp socket created');

      // Bind store to client
      this.store.bind(this.client.ev);

      // Handle connection update
      this.client.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        console.log('Connection update:', connection);

        if (qr) {
          this.qr = qr;
          console.log('New QR code received');
          qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
          console.log('WhatsApp connection opened!');
          this.isConnected = true;
          this.isConnecting = false;
        } else if (connection === 'close') {
          this.isConnected = false;
          this.isConnecting = false;
          
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          console.log('Connection closed with status code:', statusCode);
          
          // Don't automatically reconnect - let the API endpoints handle reconnection
        }
      });

      // Handle creds update
      this.client.ev.on('creds.update', saveCreds);

      // Wait for connection to establish or QR code to be generated
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      console.log('WhatsApp connection setup complete');
      return true;
    } catch (error) {
      console.error('Error in WhatsApp connection:', error);
      this.isConnected = false;
      this.isConnecting = false;
      return false;
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
    console.log('Attempting to send WhatsApp message...');
    
    // Check if client exists
    if (!this.client) {
      console.log('WhatsApp client not initialized, attempting to connect...');
      const connected = await this.connect();
      if (!connected) {
        throw new Error('Failed to connect WhatsApp');
      }
      
      // Wait for connection to establish
      await new Promise(resolve => setTimeout(resolve, 5000));
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
      
      const result = await this.client.sendMessage(formattedNumber, { text: message });
      console.log('Message sent successfully');
      
      // If we successfully sent a message, we must be connected
      this.isConnected = true;
      return result;
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
    console.log('Deleting WhatsApp session...');
    
    // Close the connection if it exists
    if (this.client) {
      try {
        // @ts-ignore - baileys doesn't expose a proper close method in types
        if (typeof this.client.close === 'function') {
          await this.client.close();
        }
      } catch (error) {
        console.error('Error closing WhatsApp connection:', error);
      }
    }
    
    this.client = null;
    this.isConnected = false;
    this.qr = null;
    this.isConnecting = false;
    
    // Clean up the session files
    await this.cleanupOldSession();
    console.log('WhatsApp session deleted');
  }
}

// Create a singleton instance
function getWhatsAppService() {
  if (!globalWhatsAppInstance) {
    globalWhatsAppInstance = new WhatsAppService();
  }
  return globalWhatsAppInstance;
}

const whatsappService = getWhatsAppService();

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