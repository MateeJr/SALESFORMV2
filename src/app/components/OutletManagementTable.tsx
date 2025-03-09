import { useState, useEffect } from 'react';
import { getOutletNames, addOutlet, deleteOutlet } from '@/lib/redis';

const OutletManagementTable = () => {
  const [outlets, setOutlets] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [newOutletName, setNewOutletName] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOutletData();
  }, []);

  const loadOutletData = async () => {
    try {
      setIsLoading(true);
      const data = await getOutletNames();
      setOutlets(data);
    } catch (error) {
      console.error('Error loading outlet data:', error);
      setOutlets({});
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddOutlet = async () => {
    if (!newOutletName.trim()) return;

    try {
      // Check for duplicate outlet names (case insensitive)
      const isDuplicate = Object.values(outlets).some(
        name => name.toLowerCase() === newOutletName.trim().toLowerCase()
      );

      if (isDuplicate) {
        setError('An outlet with this name already exists');
        return;
      }

      // Clear any previous error
      setError(null);

      // Get the highest existing outlet number
      const existingIds = Object.keys(outlets)
        .map(id => {
          const match = id.match(/^outlet(\d+)$/);
          return match ? parseInt(match[1]) : 0;
        })
        .filter(num => !isNaN(num));

      const nextNumber = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
      const outletId = `outlet${nextNumber}`;

      await addOutlet(outletId, newOutletName.trim());
      setNewOutletName('');
      await loadOutletData();
    } catch (error) {
      console.error('Error adding outlet:', error);
      setError('Failed to add outlet');
    }
  };

  const handleDeleteOutlet = async (outletId: string) => {
    try {
      await deleteOutlet(outletId);
      await loadOutletData();
    } catch (error) {
      console.error('Error deleting outlet:', error);
    }
  };

  const handleResetData = async () => {
    try {
      // Clear all outlet data from Redis
      for (const outletId of Object.keys(outlets)) {
        await deleteOutlet(outletId);
      }
      await loadOutletData();
      setShowResetConfirm(false);
    } catch (error) {
      console.error('Error resetting outlet data:', error);
    }
  };

  // Filter and sort outlets based on search term and ID number
  const filteredOutlets = Object.entries(outlets)
    .filter(([id, name]) =>
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      id.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      // Extract numbers from outlet IDs and compare them
      const numA = parseInt(a[0].replace('outlet', ''));
      const numB = parseInt(b[0].replace('outlet', ''));
      return numA - numB;
    });

  if (isLoading) {
    return (
      <div className="text-purple-500">Loading...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 md:gap-0">
        <h2 className="text-xl font-semibold text-gray-100">Outlet Management</h2>
        <button
          onClick={() => setShowResetConfirm(true)}
          className="w-full md:w-auto px-4 sm:px-6 py-2 sm:py-2.5 text-sm sm:text-base bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 font-medium shadow-lg shadow-red-900/20 border border-red-900/20"
        >
          Reset All Data
        </button>
      </div>

      {/* Add New Outlet */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            value={newOutletName}
            onChange={(e) => {
              setNewOutletName(e.target.value);
              setError(null); // Clear error when input changes
            }}
            placeholder="Enter outlet name"
            className={`flex-1 rounded-md bg-gray-900/70 border ${
              error ? 'border-red-500' : 'border-gray-800'
            } text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors`}
          />
          <button
            onClick={handleAddOutlet}
            className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 text-sm sm:text-base bg-purple-600/20 text-purple-400 rounded-lg hover:bg-purple-600/30 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 font-medium shadow-lg shadow-purple-900/20 border border-purple-900/20"
          >
            Add Outlet
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
          placeholder="Search outlets..."
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

      {/* Outlet List */}
      <div className="overflow-x-auto">
        <div className="h-[40vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
          <table className="min-w-full divide-y divide-gray-800">
            <thead className="bg-gray-900/50 sticky top-0">
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider bg-gray-900/50">ID</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider bg-gray-900/50">Name</th>
                <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider bg-gray-900/50">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredOutlets.map(([id, name]) => (
                <tr key={id} className="bg-gray-900/30 hover:bg-gray-900/50 transition-colors">
                  <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-gray-300">{id}</td>
                  <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-gray-100">{name}</td>
                  <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleDeleteOutlet(id)}
                      className="px-3 sm:px-4 py-1 sm:py-1.5 text-xs sm:text-sm bg-red-600/20 text-red-400 rounded-md hover:bg-red-600/30 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 font-medium shadow-sm shadow-red-900/20 border border-red-900/20"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filteredOutlets.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-center text-gray-500 italic">
                    No outlets found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-100 mb-4">Reset Confirmation</h3>
            <p className="text-gray-300 mb-6">Are you sure you want to reset all outlet data? This action cannot be undone.</p>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-6 py-2.5 bg-gray-600/20 text-gray-400 rounded-lg hover:bg-gray-600/30 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 font-medium shadow-lg shadow-gray-900/20 border border-gray-800/20"
              >
                Cancel
              </button>
              <button
                onClick={handleResetData}
                className="px-6 py-2.5 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 font-medium shadow-lg shadow-red-900/20 border border-red-900/20"
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

export default OutletManagementTable; 