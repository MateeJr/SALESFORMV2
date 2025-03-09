import { NextResponse } from 'next/server';
import whatsappService from '@/lib/whatsapp-simple';
import fs from 'fs';
import path from 'path';

// QR code file path
const QR_CODE_FILE = path.join(process.cwd(), 'whatsapp-auth', 'qrcode.txt');

export async function GET(request: Request) {
  try {
    // Get URL parameters
    const url = new URL(request.url);
    const forceConnect = url.searchParams.get('force') === 'true';
    
    // Check connection status
    const isConnected = whatsappService.isConnected();
    
    // Get QR code from service
    let qr = whatsappService.getQR();
    
    // If force flag is set, force a new connection
    if (forceConnect) {
      console.log('Force flag set, forcing new connection attempt');
      
      // Force a new connection
      await whatsappService.connect(true);
      
      // Wait a bit for QR code to be generated
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Get fresh QR code
      qr = whatsappService.getQR();
    }
    
    // If no QR code from service but file exists, read from file
    if (!qr && !isConnected) {
      try {
        if (fs.existsSync(QR_CODE_FILE)) {
          qr = fs.readFileSync(QR_CODE_FILE, 'utf8');
          console.log('Retrieved QR code from file');
        }
      } catch (error) {
        console.error('Error reading QR code from file:', error);
      }
    }
    
    // Connection is in progress if we have a QR code
    const isConnecting = !isConnected && !!qr;
    
    // Initiate connection if not connected and no QR code available and not forcing
    if (!isConnected && !qr && !forceConnect) {
      console.log('Initiating WhatsApp connection...');
      
      // Start connection process
      await whatsappService.connect(false);
      
      // Check again for QR code after initiating connection
      qr = whatsappService.getQR();
      
      // If still no QR but file exists, read from file
      if (!qr) {
        try {
          if (fs.existsSync(QR_CODE_FILE)) {
            qr = fs.readFileSync(QR_CODE_FILE, 'utf8');
            console.log('Retrieved QR code from file after connection attempt');
          }
        } catch (error) {
          console.error('Error reading QR code from file after connection attempt:', error);
        }
      }
      
      // Return response based on current state
      return NextResponse.json({
        success: true,
        connected: whatsappService.isConnected(),
        qr: qr,
        connecting: true,
        message: qr ? 'QR code available' : 'Connection initiated, QR code not yet available'
      });
    }
    
    return NextResponse.json({
      success: true,
      connected: isConnected,
      qr: qr,
      connecting: isConnecting,
      message: isConnected ? 'Connected' : (qr ? 'QR code available' : 'Not connected')
    });
  } catch (error) {
    console.error('WhatsApp API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: (error as Error).message || 'Failed to connect to WhatsApp',
        message: 'Error checking WhatsApp status'
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    console.log('Deleting WhatsApp session...');
    const result = await whatsappService.deleteSession();
    return NextResponse.json({ 
      success: result,
      message: result ? 'Session deleted successfully' : 'Failed to delete session'
    });
  } catch (error) {
    console.error('WhatsApp Delete Session Error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message || 'Failed to delete WhatsApp session' },
      { status: 500 }
    );
  }
}

// Add POST endpoint for sending messages
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { to, message } = body;

    if (!to || !message) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log(`Sending test message to ${to}`);
    await whatsappService.sendMessage(to, message);
    console.log('Test message sent successfully');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('WhatsApp Send Message Error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message || 'Failed to send message' },
      { status: 500 }
    );
  }
} 