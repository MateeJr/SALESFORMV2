'use client';

import { useState, useEffect } from 'react';
import { getSalesData, setSalesData } from '@/lib/redis';

const SalesManagementTable = () => {
  const [sales, setSales] = useState<Record<string, { name: string; password: string }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [newSalesName, setNewSalesName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSalesData();
  }, []);

  const loadSalesData = async () => {
    try {
      setIsLoading(true);
      const data = await getSalesData();
      setSales(data);
    } catch (error) {
      console.error('Error loading sales data:', error);
      setSales({});
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSales = async () => {
    if (!newSalesName.trim() || !newPassword.trim()) return;

    try {
      // Check for duplicate sales names (case insensitive)
      const isDuplicate = Object.values(sales).some(
        sale => sale.name.toLowerCase() === newSalesName.trim().toLowerCase()
      );

      if (isDuplicate) {
        setError('A sales account with this name already exists');
        return;
      }

      // Clear any previous error
      setError(null);

      // Get the highest existing sales number
      const existingIds = Object.keys(sales)
        .map(id => {
          const match = id.match(/^sales(\d+)$/);
          return match ? parseInt(match[1]) : 0;
        })
        .filter(num => !isNaN(num));

      const nextNumber = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
      const salesId = `sales${nextNumber}`;

      const updatedSales = {
        ...sales,
        [salesId]: {
          name: newSalesName.trim(),
          password: newPassword.trim()
        }
      };

      await setSalesData(updatedSales);
      setSales(updatedSales);
      setNewSalesName('');
      setNewPassword('');
      setError(null);
    } catch (error) {
      console.error('Error adding sales:', error);
      setError('Failed to add sales account');
    }
  };

  const handleDeleteSales = async (salesId: string) => {
    try {
      const { [salesId]: removed, ...remainingSales } = sales;
      await setSalesData(remainingSales);
      setSales(remainingSales);
    } catch (error) {
      console.error('Error deleting sales:', error);
    }
  };

  const handleResetData = async () => {
    try {
      await setSalesData({});
      setSales({});
      setShowResetConfirm(false);
    } catch (error) {
      console.error('Error resetting sales data:', error);
    }
  };

  // Filter sales based on search term
  const filteredSales = Object.entries(sales).filter(([id, { name }]) =>
    name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="text-purple-500">Loading...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 md:gap-0">
        <h2 className="text-xl font-semibold text-gray-100">Sales Management</h2>
        <button
          onClick={() => setShowResetConfirm(true)}
          className="w-full md:w-auto px-6 py-2.5 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 font-medium shadow-lg shadow-red-900/20 border border-red-900/20"
        >
          Reset All Data
        </button>
      </div>

      {/* Add New Sales */}
      <div className="space-y-2">
        <div className="flex flex-col md:flex-row gap-4">
          <input
            type="text"
            value={newSalesName}
            onChange={(e) => {
              setNewSalesName(e.target.value);
              setError(null); // Clear error when input changes
            }}
            placeholder="Enter sales name"
            className={`flex-1 rounded-md bg-gray-900/70 border ${
              error ? 'border-red-500' : 'border-gray-800'
            } text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors`}
          />
          <div className="flex-1 relative">
            <input
              type={showNewPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setError(null); // Clear error when input changes
              }}
              placeholder="Enter password"
              className={`w-full rounded-md bg-gray-900/70 border ${
                error ? 'border-red-500' : 'border-gray-800'
              } text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-300 transition-all duration-200"
            >
              {showNewPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
          </div>
          <button
            onClick={handleAddSales}
            className="w-full md:w-auto px-6 py-2.5 bg-purple-600/20 text-purple-400 rounded-lg hover:bg-purple-600/30 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 font-medium shadow-lg shadow-purple-900/20 border border-purple-900/20"
          >
            Add Sales
          </button>
        </div>
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
      </div>

      {/* Search Filter */}
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search sales..."
          className="w-full rounded-md bg-gray-900/70 border border-gray-800 text-gray-100 px-3 py-2 pl-10 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors"
        />
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg
            className="h-5 w-5 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>

      {/* Sales List */}
      <div className="overflow-x-auto">
        <div className="h-[40vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
          <table className="min-w-full divide-y divide-gray-800">
            <thead className="bg-gray-900/50 sticky top-0">
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider bg-gray-900/50">ID</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider bg-gray-900/50">Name</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider bg-gray-900/50">Password</th>
                <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider bg-gray-900/50">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredSales.map(([id, { name, password }]) => (
                <tr key={id} className="bg-gray-900/30 hover:bg-gray-900/50 transition-colors">
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap text-sm text-gray-300">{id}</td>
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap text-sm text-gray-100">{name}</td>
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap text-sm text-gray-100">{password}</td>
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleDeleteSales(id)}
                      className="px-4 py-1.5 bg-red-600/20 text-red-400 rounded-md hover:bg-red-600/30 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 font-medium shadow-sm shadow-red-900/20 border border-red-900/20"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filteredSales.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-gray-500 italic">
                    No sales found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-100 mb-4">Reset Confirmation</h3>
            <p className="text-gray-300 mb-6">Are you sure you want to reset all sales data? This action cannot be undone.</p>
            <div className="flex flex-col md:flex-row justify-end gap-4">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2.5 px-6 bg-gray-600/20 text-gray-400 rounded-lg hover:bg-gray-600/30 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 font-medium shadow-lg shadow-gray-900/20 border border-gray-800/20"
              >
                Cancel
              </button>
              <button
                onClick={handleResetData}
                className="flex-1 py-2.5 px-6 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 font-medium shadow-lg shadow-red-900/20 border border-red-900/20"
              >
                Yes, Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesManagementTable; 