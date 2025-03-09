'use client';

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface WhatsAppConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  qrCode: string | null;
  connectionStatus: 'not_connected' | 'connecting' | 'connected' | 'disconnected' | 'error';
}

const WhatsAppConnectionModal = ({ isOpen, onClose, qrCode, connectionStatus }: WhatsAppConnectionModalProps) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [localQrCode, setLocalQrCode] = useState<string | null>(qrCode);
  const [pollingCount, setPollingCount] = useState(0);

  // Update local QR code when prop changes
  useEffect(() => {
    if (qrCode) {
      setLocalQrCode(qrCode);
    }
  }, [qrCode]);

  // Poll for QR code aggressively
  useEffect(() => {
    if (!isOpen) return;
    
    // If we already have a QR code, don't poll
    if (localQrCode) return;
    
    // If we've been polling for too long, stop
    if (pollingCount > 30) return; // Stop after 30 attempts (1 minute)
    
    console.log(`Polling for QR code... (${pollingCount + 1}/30)`);
    
    const pollTimer = setTimeout(async () => {
      try {
        const response = await fetch('/api/whatsapp');
        const data = await response.json();
        
        if (data.qr) {
          setLocalQrCode(data.qr);
          console.log('QR code received in modal');
          
          // Force a re-render of the parent component
          window.dispatchEvent(new CustomEvent('whatsapp-qr-updated', { 
            detail: { qr: data.qr } 
          }));
        } else {
          // Increment polling count
          setPollingCount(prev => prev + 1);
        }
      } catch (error) {
        console.error('Error polling for QR code:', error);
        setPollingCount(prev => prev + 1);
      }
    }, 2000);
    
    return () => clearTimeout(pollTimer);
  }, [isOpen, localQrCode, pollingCount]);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    setLocalQrCode(null);
    setPollingCount(0);
    
    try {
      // Delete current session
      await fetch('/api/whatsapp', { method: 'DELETE' });
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Start new connection
      const response = await fetch('/api/whatsapp');
      const data = await response.json();
      
      if (data.qr) {
        setLocalQrCode(data.qr);
        
        // Force a status update in the parent
        window.dispatchEvent(new CustomEvent('whatsapp-qr-updated', { 
          detail: { qr: data.qr } 
        }));
      }
      
      // Force a status update in the parent
      window.dispatchEvent(new CustomEvent('whatsapp-refresh'));
    } catch (error) {
      console.error('Error refreshing WhatsApp connection:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-100">Connect WhatsApp Bot</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-300 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {(connectionStatus === 'not_connected' && localQrCode) ? (
            <div className="flex flex-col items-center space-y-4">
              <p className="text-gray-300 text-center">
                Scan this QR code with WhatsApp to connect the bot
              </p>
              <div className="bg-white p-4 rounded-lg">
                <QRCodeSVG value={localQrCode} size={256} />
              </div>
              <p className="text-gray-400 text-sm text-center">
                Open WhatsApp on your phone, tap Menu or Settings and select WhatsApp Web
              </p>
            </div>
          ) : connectionStatus === 'connecting' ? (
            <div className="flex flex-col items-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
              <p className="text-gray-300">Connecting to WhatsApp...</p>
              <p className="text-gray-400 text-sm text-center">
                This may take a moment. Please wait...
              </p>
            </div>
          ) : connectionStatus === 'not_connected' && !localQrCode ? (
            <div className="flex flex-col items-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
              <p className="text-gray-300">Generating QR code...</p>
              <p className="text-gray-400 text-sm text-center">
                This may take a moment. Please wait... {pollingCount > 0 ? `(Attempt ${pollingCount}/30)` : ''}
              </p>
              {pollingCount > 10 && (
                <p className="text-yellow-400 text-sm text-center mt-4">
                  Taking longer than expected. You might need to click "Refresh Connection" below.
                </p>
              )}
            </div>
          ) : connectionStatus === 'connected' ? (
            <div className="flex flex-col items-center space-y-4">
              <div className="rounded-full bg-green-500/20 p-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-green-400 font-medium">WhatsApp Connected Successfully!</p>
            </div>
          ) : connectionStatus === 'error' ? (
            <div className="flex flex-col items-center space-y-4">
              <div className="rounded-full bg-red-500/20 p-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-red-400 font-medium">Connection Error</p>
              <p className="text-gray-400 text-center">Please try again later or check your internet connection</p>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-4">
              <div className="rounded-full bg-yellow-500/20 p-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-yellow-400 font-medium">Disconnected</p>
              <p className="text-gray-400 text-center">The WhatsApp connection has been lost</p>
            </div>
          )}
          
          {/* Refresh button */}
          {(connectionStatus === 'not_connected' || connectionStatus === 'error' || connectionStatus === 'disconnected' || (connectionStatus === 'connecting' && pollingCount > 15)) && (
            <div className="flex justify-center mt-4">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  isRefreshing 
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                    : 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30'
                }`}
              >
                {isRefreshing ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-purple-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Refreshing...
                  </span>
                ) : (
                  'Refresh Connection'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WhatsAppConnectionModal; 