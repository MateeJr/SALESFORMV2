'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SalesForm from './components/SalesForm';
import LoginModal from './components/LoginModal';

export default function Home() {
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const router = useRouter();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    // Check login status when component mounts
    const isAdmin = sessionStorage.getItem('isAdmin') === 'true';
    setIsLoggedIn(isAdmin);
  }, []);

  const handleLogin = (success: boolean) => {
    if (success) {
      sessionStorage.setItem('isAdmin', 'true');
      setIsLoggedIn(true);
      router.push('/admin');
    }
  };

  const handleAdminClick = () => {
    if (isLoggedIn) {
      router.push('/admin');
    } else {
      setIsLoginModalOpen(true);
    }
  };

  const handleReset = () => {
    // Clear all cookies except admin-related ones
    const cookies = document.cookie.split(';');
    cookies.forEach(cookie => {
      const cookieName = cookie.split('=')[0].trim();
      if (cookieName !== 'isAdmin') { // Preserve admin cookie
        document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      }
    });
    setShowResetConfirm(false);
    window.location.reload(); // Refresh the page to reset the form state
  };

  return (
    <main>
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-black/30 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-end items-center gap-4">
            <button
              onClick={() => setShowResetConfirm(true)}
              className="px-6 py-2.5 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 font-medium shadow-lg shadow-red-900/20 border border-red-900/20"
            >
              RESET
            </button>
            <button
              onClick={handleAdminClick}
              className="px-6 py-2.5 bg-purple-600/20 text-purple-400 rounded-lg hover:bg-purple-600/30 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 font-medium shadow-lg shadow-purple-900/20 border border-purple-900/20"
            >
              {isLoggedIn ? 'ADMIN PANEL' : 'LOGIN ADMIN'}
            </button>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900/90 p-8 rounded-xl border border-gray-800 shadow-2xl w-full max-w-md">
            <h2 className="text-2xl font-bold text-gray-100 mb-6">Confirm Reset</h2>
            <p className="text-gray-300 mb-6">Are you sure you want to reset all sales data? You will need to log in again.</p>
            <div className="flex gap-4">
              <button
                onClick={handleReset}
                className="flex-1 py-2 px-4 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-colors"
              >
                Yes, Reset
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2 px-4 bg-gray-800 text-gray-300 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add padding to account for fixed header */}
      <div className="pt-20">
        <SalesForm />
      </div>

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLogin={handleLogin}
      />
    </main>
  );
}
