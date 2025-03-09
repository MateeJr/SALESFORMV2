import { useState, useEffect } from 'react';
import QRCode from 'qrcode.react';

const WhatsAppConnection = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkConnection = async () => {
    try {
      const response = await fetch('/api/whatsapp');
      const data = await response.json();

      if (data.success) {
        setIsConnected(data.connected);
        setQrCode(data.qr);
        setError(null);
      } else {
        setError(data.error || 'Failed to connect to WhatsApp');
      }
    } catch (error) {
      setError('Failed to check WhatsApp connection');
    }
  };

  useEffect(() => {
    // Check connection status immediately
    checkConnection();

    // Poll for connection status every 5 seconds
    const interval = setInterval(checkConnection, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 p-4 bg-gray-900/95 rounded-xl border border-gray-800 shadow-xl backdrop-blur-sm">
      <div className="flex flex-col items-center space-y-4">
        <h3 className="text-lg font-semibold text-gray-100">
          WhatsApp Connection
        </h3>
        
        {error ? (
          <div className="text-red-400 text-sm">{error}</div>
        ) : isConnected ? (
          <div className="flex items-center space-x-2 text-green-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Connected</span>
          </div>
        ) : qrCode ? (
          <div className="bg-white p-2 rounded-lg">
            <QRCode value={qrCode} size={200} />
          </div>
        ) : (
          <div className="text-yellow-400 animate-pulse">
            Connecting...
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatsAppConnection; 