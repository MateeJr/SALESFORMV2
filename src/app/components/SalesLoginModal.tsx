'use client';

import { useState } from 'react';
import { verifySalesPassword } from '@/lib/redis';

interface SalesLoginModalProps {
  salesId: string;
  salesName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const SalesLoginModal = ({ salesId, salesName, onClose, onSuccess }: SalesLoginModalProps) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const isValid = await verifySalesPassword(salesId, password);
      
      if (isValid) {
        // Set cookie with expiry at midnight WIB
        const now = new Date();
        const wibDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
        const tomorrow = new Date(wibDate);
        tomorrow.setHours(24, 0, 0, 0);
        
        document.cookie = `salesId=${salesId};expires=${tomorrow.toUTCString()};path=/`;
        onSuccess();
      } else {
        setError('Invalid password');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900/90 p-8 rounded-xl border border-gray-800 shadow-2xl w-full max-w-md">
        <h2 className="text-2xl font-bold text-gray-100 mb-6">Login Required</h2>
        <p className="text-gray-300 mb-6">Please enter the password for {salesName}</p>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-4 py-2 rounded-md bg-gray-800/50 border border-gray-700 text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-gray-500"
              required
            />
          </div>
          
          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}
          
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-2 px-4 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Verifying...' : 'Login'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 bg-gray-800 text-gray-300 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SalesLoginModal; 