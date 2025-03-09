'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import SalesManagementTable from '../components/SalesManagementTable';
import OutletManagementTable from '../components/OutletManagementTable';
import ProductManagementTable from '../components/ProductManagementTable';
import StatusPanel from '../components/StatusPanel';
import WhatsAppConnectionModal from '../components/WhatsAppConnectionModal';
import { 
  getAdminNumber, 
  setAdminNumber as setAdminNumberRedis,
  getNotificationTemplate,
  setNotificationTemplate as setNotificationTemplateRedis,
  DEFAULT_NOTIFICATION_TEMPLATE
} from '@/lib/redis';

const AdminPage = () => {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<'sales' | 'outlets' | 'products' | 'notifications' | 'status'>('sales');
  const [adminNumber, setAdminNumberState] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState<'not_connected' | 'connecting' | 'connected' | 'disconnected' | 'error'>('not_connected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState('');
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [notificationTemplate, setNotificationTemplate] = useState('');
  const [templateSaveStatus, setTemplateSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    // Check if admin state exists in memory
    const isAdmin = sessionStorage.getItem('isAdmin') === 'true';
    if (!isAdmin) {
      router.replace('/');
    } else {
      setIsAuthenticated(true);
      // Load admin number
      loadAdminNumber();
      // Load notification template
      loadNotificationTemplate();
      // Check WhatsApp connection status
      checkWhatsAppStatus();

      // Set up periodic status check
      const statusInterval = setInterval(checkWhatsAppStatus, 10000); // Check every 10 seconds
      
      // Listen for QR code updates from the WhatsAppConnectionModal
      const handleQRUpdate = (event: CustomEvent) => {
        console.log('QR code updated:', event.detail.qr);
        setQrCode(event.detail.qr);
      };
      
      // Listen for refresh requests from the WhatsAppConnectionModal
      const handleRefresh = () => {
        console.log('Refreshing WhatsApp status...');
        checkWhatsAppStatus();
      };
      
      window.addEventListener('whatsapp-qr-updated', handleQRUpdate as EventListener);
      window.addEventListener('whatsapp-refresh', handleRefresh);

      // Cleanup interval and event listeners on unmount
      return () => {
        clearInterval(statusInterval);
        window.removeEventListener('whatsapp-qr-updated', handleQRUpdate as EventListener);
        window.removeEventListener('whatsapp-refresh', handleRefresh);
      };
    }
  }, [router]);

  const loadAdminNumber = async () => {
    try {
      setIsLoading(true);
      const number = await getAdminNumber();
      if (number) {
        setAdminNumberState(number);
      }
    } catch (error) {
      console.error('Error loading admin number:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadNotificationTemplate = async () => {
    try {
      const template = await getNotificationTemplate();
      if (template) {
        setNotificationTemplate(template);
      } else {
        // Set default template if none exists
        setNotificationTemplate(DEFAULT_NOTIFICATION_TEMPLATE);
      }
    } catch (error) {
      console.error('Error loading notification template:', error);
      // Set default template on error
      setNotificationTemplate(DEFAULT_NOTIFICATION_TEMPLATE);
    }
  };

  const checkWhatsAppStatus = async () => {
    try {
      // Don't set to connecting every time - it makes the UI flicker
      // Only set to connecting if it's not already connected or in error state
      if (whatsappStatus !== 'connected' && whatsappStatus !== 'error') {
        setWhatsappStatus('connecting');
      }
      
      // Force connection attempt if in connecting state with no QR code after 5 seconds
      if (whatsappStatus === 'connecting' && !qrCode) {
        console.log('Forcing a connection attempt to get QR code...');
        
        // Try to delete and reconnect if we've been stuck in connecting state
        try {
          // Delete the session first
          await fetch('/api/whatsapp', { method: 'DELETE' });
          
          // Wait a moment
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Reconnect with a special flag to force QR code display
          const directResponse = await fetch('/api/whatsapp?force=true');
          const directData = await directResponse.json();
          
          if (directData.qr) {
            console.log('Successfully got QR code through direct request');
            setQrCode(directData.qr);
            setWhatsappStatus('not_connected');
            return;
          }
        } catch (error) {
          console.error('Error forcing WhatsApp connection:', error);
        }
      }
      
      // Normal status check
      const response = await fetch('/api/whatsapp');
      const data = await response.json();

      if (data.success) {
        if (data.connected) {
          setWhatsappStatus('connected');
          setQrCode(null);
          
          // Close the modal if it's open
          if (isWhatsAppModalOpen) {
            // Wait a moment to show the success state
            setTimeout(() => {
              setIsWhatsAppModalOpen(false);
            }, 2000);
          }
        } else if (data.connecting) {
          setWhatsappStatus('connecting');
          // Don't clear QR code if we have one - it might still be valid
          if (!qrCode) {
            setQrCode(data.qr); // Use QR code if available
          }
        } else {
          setWhatsappStatus('not_connected');
          if (data.qr) {
            setQrCode(data.qr);
          }
        }
      } else {
        setWhatsappStatus('error');
      }
    } catch (error) {
      console.error('Error checking WhatsApp status:', error);
      setWhatsappStatus('error');
    }
  };

  const handleAdminNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAdminNumberState(e.target.value);
    setSaveStatus('idle');
  };

  const handleAdminNumberSave = async () => {
    try {
      setSaveStatus('saving');
      // Check if adminNumber is a string before calling trim()
      const numberToSave = typeof adminNumber === 'string' ? adminNumber.trim() : String(adminNumber || '');
      await setAdminNumberRedis(numberToSave);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Error saving admin number:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('isAdmin');
    router.replace('/');
  };

  const handleBackToForm = () => {
    router.push('/');
  };

  const handleTestMessageSend = async () => {
    if (!adminNumber || !testMessage.trim() || whatsappStatus !== 'connected') return;

    try {
      setSendStatus('sending');
      const response = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: adminNumber,
          message: testMessage.trim(),
        }),
      });

      const data = await response.json();
      if (data.success) {
        setSendStatus('sent');
        setTestMessage(''); // Clear the message after successful send
        setTimeout(() => setSendStatus('idle'), 2000);
      } else {
        throw new Error('Failed to send message');
      }
    } catch (error) {
      console.error('Error sending test message:', error);
      setSendStatus('error');
      setTimeout(() => setSendStatus('idle'), 3000);
    }
  };

  const handleNotificationTemplateChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNotificationTemplate(e.target.value);
    setTemplateSaveStatus('idle');
  };

  const handleNotificationTemplateSave = async () => {
    try {
      setTemplateSaveStatus('saving');
      await setNotificationTemplateRedis(notificationTemplate);
      setTemplateSaveStatus('saved');
      setTimeout(() => setTemplateSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Error saving notification template:', error);
      setTemplateSaveStatus('error');
      setTimeout(() => setTemplateSaveStatus('idle'), 3000);
    }
  };

  // Show nothing while checking authentication
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-gray-950">
      {/* Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 bg-black/30 backdrop-blur-lg border-b border-gray-800 z-10">
        <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <button
                  onClick={handleBackToForm}
                  className="px-3 sm:px-6 py-2 sm:py-2.5 bg-gray-600/20 text-gray-400 rounded-lg hover:bg-gray-600/30 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 font-medium shadow-lg shadow-gray-900/20 border border-gray-800/20 text-xs sm:text-sm"
                >
                  ← Back
                </button>
              </div>
            </div>
            <div className="flex items-center">
              <button
                onClick={handleLogout}
                className="px-3 sm:px-6 py-2 sm:py-2.5 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 font-medium shadow-lg shadow-red-900/20 border border-red-900/20 text-xs sm:text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="pt-24 px-2 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="backdrop-blur-lg bg-black/30 rounded-xl shadow-2xl p-4 sm:p-8 space-y-6 border border-gray-800">
            <h1 className="text-3xl font-bold text-gray-100 text-center mb-8">Admin Panel</h1>
            
            {/* Admin Number Input */}
            <div className="mb-8 p-4 bg-gray-900/50 rounded-lg border border-gray-800">
              <label htmlFor="adminNumber" className="block text-sm font-medium text-gray-300 mb-2">
                ADMIN NUMBER
              </label>
              <div className="flex flex-col sm:flex-row gap-4">
                <input
                  type="text"
                  id="adminNumber"
                  value={adminNumber}
                  onChange={handleAdminNumberChange}
                  placeholder="Enter WhatsApp number (e.g., 628123456789)"
                  className="flex-1 bg-gray-900/70 border border-gray-800 rounded-lg px-4 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <button
                  onClick={handleAdminNumberSave}
                  disabled={saveStatus === 'saving' || saveStatus === 'saved'}
                  className={`px-6 py-2 rounded-lg font-medium transition-all duration-200 ${
                    saveStatus === 'saving'
                      ? 'bg-yellow-600/20 text-yellow-400'
                      : saveStatus === 'saved'
                      ? 'bg-green-600/20 text-green-400'
                      : saveStatus === 'error'
                      ? 'bg-red-600/20 text-red-400'
                      : 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30'
                  }`}
                >
                  {saveStatus === 'saving'
                    ? 'Saving...'
                    : saveStatus === 'saved'
                    ? 'Saved!'
                    : saveStatus === 'error'
                    ? 'Error!'
                    : 'Save Number'}
                </button>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                This number will receive WhatsApp notifications for new sales entries
              </p>
            </div>

            {/* WhatsApp Bot Connection */}
            <div className="mb-8 p-4 bg-gray-900/50 rounded-lg border border-gray-800">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-300">WhatsApp Bot</h3>
                  <p className={`mt-1 text-sm ${
                    whatsappStatus === 'connected' ? 'text-green-400' :
                    whatsappStatus === 'connecting' ? 'text-yellow-400' :
                    whatsappStatus === 'error' ? 'text-red-400' :
                    whatsappStatus === 'disconnected' ? 'text-orange-400' :
                    'text-gray-400'
                  }`}>
                    Status: {whatsappStatus.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  <button
                    onClick={async () => {
                      try {
                        await fetch('/api/whatsapp', { method: 'DELETE' });
                        setWhatsappStatus('not_connected');
                        setQrCode(null);
                        checkWhatsAppStatus();
                      } catch (error) {
                        console.error('Error deleting session:', error);
                      }
                    }}
                    className="flex-1 sm:flex-none px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg font-medium transition-all duration-200 bg-red-600/20 text-red-400 hover:bg-red-600/30 text-sm"
                  >
                    Delete Session
                  </button>
                  <button
                    onClick={() => {
                      if (whatsappStatus !== 'connected') {
                        setIsWhatsAppModalOpen(true);
                        checkWhatsAppStatus();
                      }
                    }}
                    className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg font-medium transition-all duration-200 text-sm ${
                      whatsappStatus === 'connected'
                        ? 'bg-green-600/20 text-green-400 cursor-default'
                        : 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30'
                    }`}
                  >
                    {whatsappStatus === 'connected' ? 'Connected' : 'Connect WhatsApp Bot'}
                  </button>
                </div>
              </div>

              {/* Test Message Section */}
              {whatsappStatus === 'connected' && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <label htmlFor="testMessage" className="block text-sm font-medium text-gray-300 mb-2">
                    Test Send Message
                  </label>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <input
                      type="text"
                      id="testMessage"
                      value={testMessage}
                      onChange={(e) => setTestMessage(e.target.value)}
                      placeholder="Enter a test message"
                      disabled={sendStatus === 'sending' || sendStatus === 'sent' || !adminNumber}
                      className="flex-1 bg-gray-900/70 border border-gray-800 rounded-lg px-4 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
                    />
                    <button
                      onClick={handleTestMessageSend}
                      disabled={sendStatus === 'sending' || sendStatus === 'sent' || !testMessage.trim() || !adminNumber}
                      className={`w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg font-medium transition-all duration-200 text-sm ${
                        !adminNumber 
                          ? 'bg-gray-600/20 text-gray-400 cursor-not-allowed'
                          : sendStatus === 'sending'
                          ? 'bg-yellow-600/20 text-yellow-400'
                          : sendStatus === 'sent'
                          ? 'bg-green-600/20 text-green-400'
                          : sendStatus === 'error'
                          ? 'bg-red-600/20 text-red-400'
                          : 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30'
                      }`}
                    >
                      {!adminNumber 
                        ? 'Set Admin Number First'
                        : sendStatus === 'sending'
                        ? 'Sending...'
                        : sendStatus === 'sent'
                        ? 'Sent!'
                        : sendStatus === 'error'
                        ? 'Error!'
                        : 'Send Test Message'}
                    </button>
                  </div>
                  {!adminNumber && (
                    <p className="mt-2 text-sm text-yellow-400">
                      Please set the admin number above before sending test messages
                    </p>
                  )}
                </div>
              )}
            </div>
            
            {/* Tab Navigation */}
            <div className="flex flex-wrap gap-2 border-b border-gray-800 mb-6">
              <button
                className={`px-3 sm:px-6 py-2.5 text-sm font-medium rounded-t-lg transition-all duration-200 ${
                  activeTab === 'sales'
                    ? 'bg-purple-600/20 text-purple-400 border-b-2 border-purple-500 shadow-lg shadow-purple-900/20'
                    : 'text-gray-400 hover:text-gray-300 hover:bg-gray-600/10'
                }`}
                onClick={() => setActiveTab('sales')}
              >
                Sales
              </button>
              <button
                className={`px-3 sm:px-6 py-2.5 text-sm font-medium rounded-t-lg transition-all duration-200 ${
                  activeTab === 'outlets'
                    ? 'bg-purple-600/20 text-purple-400 border-b-2 border-purple-500 shadow-lg shadow-purple-900/20'
                    : 'text-gray-400 hover:text-gray-300 hover:bg-gray-600/10'
                }`}
                onClick={() => setActiveTab('outlets')}
              >
                Outlets
              </button>
              <button
                className={`px-3 sm:px-6 py-2.5 text-sm font-medium rounded-t-lg transition-all duration-200 ${
                  activeTab === 'products'
                    ? 'bg-purple-600/20 text-purple-400 border-b-2 border-purple-500 shadow-lg shadow-purple-900/20'
                    : 'text-gray-400 hover:text-gray-300 hover:bg-gray-600/10'
                }`}
                onClick={() => setActiveTab('products')}
              >
                Products
              </button>
              <button
                className={`px-3 sm:px-6 py-2.5 text-sm font-medium rounded-t-lg transition-all duration-200 ${
                  activeTab === 'notifications'
                    ? 'bg-purple-600/20 text-purple-400 border-b-2 border-purple-500 shadow-lg shadow-purple-900/20'
                    : 'text-gray-400 hover:text-gray-300 hover:bg-gray-600/10'
                }`}
                onClick={() => setActiveTab('notifications')}
              >
                Notifications
              </button>
              <button
                className={`px-3 sm:px-6 py-2.5 text-sm font-medium rounded-t-lg transition-all duration-200 ${
                  activeTab === 'status'
                    ? 'bg-purple-600/20 text-purple-400 border-b-2 border-purple-500 shadow-lg shadow-purple-900/20'
                    : 'text-gray-400 hover:text-gray-300 hover:bg-gray-600/10'
                }`}
                onClick={() => setActiveTab('status')}
              >
                Status
              </button>
            </div>

            {/* Tab Content */}
            <div className="min-h-[40vh]">
              {activeTab === 'sales' ? (
                <SalesManagementTable />
              ) : activeTab === 'outlets' ? (
                <OutletManagementTable />
              ) : activeTab === 'products' ? (
                <ProductManagementTable />
              ) : activeTab === 'notifications' ? (
                <div className="space-y-6">
                  <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 md:gap-0">
                    <h2 className="text-xl font-semibold text-gray-100">Notification Templates</h2>
                  </div>
                  
                  <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-800">
                    <label htmlFor="notificationTemplate" className="block text-sm font-medium text-gray-300 mb-2">
                      Sales Notification Template
                    </label>
                    <div className="space-y-4">
                      <textarea
                        id="notificationTemplate"
                        rows={10}
                        value={notificationTemplate}
                        onChange={handleNotificationTemplateChange}
                        placeholder="Enter notification template text..."
                        className="w-full bg-gray-900/70 border border-gray-800 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                      ></textarea>
                      <div className="flex justify-end">
                        <button
                          onClick={handleNotificationTemplateSave}
                          disabled={templateSaveStatus === 'saving' || templateSaveStatus === 'saved'}
                          className={`w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 text-sm ${
                            templateSaveStatus === 'saving'
                              ? 'bg-yellow-600/20 text-yellow-400'
                              : templateSaveStatus === 'saved'
                              ? 'bg-green-600/20 text-green-400'
                              : templateSaveStatus === 'error'
                              ? 'bg-red-600/20 text-red-400'
                              : 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30'
                          } rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 font-medium shadow-lg shadow-purple-900/20 border border-purple-900/20`}
                        >
                          {templateSaveStatus === 'saving'
                            ? 'Saving...'
                            : templateSaveStatus === 'saved'
                            ? 'Saved!'
                            : templateSaveStatus === 'error'
                            ? 'Error!'
                            : 'Update Template'}
                        </button>
                      </div>
                      <div className="text-sm text-gray-400 mt-2">
                        <p>Available variables:</p>
                        <ul className="list-disc list-inside space-y-2 text-gray-300">
                          <li><code className="bg-gray-800 px-1 py-0.5 rounded">{'{date}'}</code> - Current date</li>
                          <li><code className="bg-gray-800 px-1 py-0.5 rounded">{'{sales_name}'}</code> - Sales name</li>
                          <li><code className="bg-gray-800 px-1 py-0.5 rounded">{'{outlet_name}'}</code> - Outlet name</li>
                          <li><code className="bg-gray-800 px-1 py-0.5 rounded">{'{address}'}</code> - Outlet address</li>
                          <li><code className="bg-gray-800 px-1 py-0.5 rounded">{'{order_type}'}</code> - Order type</li>
                          <li><code className="bg-gray-800 px-1 py-0.5 rounded">{'{outlet_type}'}</code> - Type of outlet</li>
                          <li><code className="bg-gray-800 px-1 py-0.5 rounded">{'{tax_type}'}</code> - Tax type</li>
                          <li><code className="bg-gray-800 px-1 py-0.5 rounded">{'{customer_category}'}</code> - Customer category</li>
                          <li><code className="bg-gray-800 px-1 py-0.5 rounded">{'{products_list}'}</code> - List of products</li>
                          <li><code className="bg-gray-800 px-1 py-0.5 rounded">{'{total_amount}'}</code> - Total amount</li>
                          <li><code className="bg-gray-800 px-1 py-0.5 rounded">{'{bonus}'}</code> - Bonus information</li>
                          <li><code className="bg-gray-800 px-1 py-0.5 rounded">{'{billing_status}'}</code> - Billing status</li>
                          <li><code className="bg-gray-800 px-1 py-0.5 rounded">{'{alasan_tidak_tertagih}'}</code> - Reason if not billed</li>
                          <li><code className="bg-gray-800 px-1 py-0.5 rounded">{'{images_locations}'}</code> - Image locations with Google Maps links and timestamps</li>
                          <li><code className="bg-gray-800 px-1 py-0.5 rounded">{'{submit_location}'}</code> - Form submission location with Google Maps link and timestamp</li>
                        </ul>
                      </div>
                      <div className="mt-4 p-4 bg-gray-900/50 rounded-lg border border-gray-800">
                        <p className="text-sm text-gray-400">Example location format:</p>
                        <pre className="mt-2 text-xs text-gray-500 whitespace-pre-wrap">
Image 1: https://www.google.com/maps?q=-6.123456,106.789012
Taken at: 12/01/2024, 14:30:45

Submit Location: https://www.google.com/maps?q=-6.123456,106.789012
Submitted at: 12/01/2024, 14:35:22</pre>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <StatusPanel />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* WhatsApp Connection Modal */}
      <WhatsAppConnectionModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
        qrCode={qrCode}
        connectionStatus={whatsappStatus}
      />
    </div>
  );
};

export default AdminPage; 