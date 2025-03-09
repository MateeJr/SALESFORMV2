import { useState, useEffect } from 'react';
import { getProducts, addProduct, deleteProduct, Product } from '@/lib/redis';

const ProductManagementTable = () => {
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [newProductName, setNewProductName] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProductData();
  }, []);

  const loadProductData = async () => {
    try {
      setIsLoading(true);
      const data = await getProducts();
      setProducts(data);
    } catch (error) {
      console.error('Error loading product data:', error);
      setProducts({});
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddProduct = async () => {
    if (!newProductName.trim()) return;

    try {
      // Check for duplicate product names (case insensitive)
      const isDuplicate = Object.values(products).some(
        product => product.name.toLowerCase() === newProductName.trim().toLowerCase()
      );

      if (isDuplicate) {
        setError('A product with this name already exists');
        return;
      }

      // Clear any previous error
      setError(null);

      // Create product ID from name (lowercase, replace spaces with underscores)
      const productId = newProductName.trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');

      const newProduct: Product = {
        id: productId,
        name: newProductName.trim()
      };

      await addProduct(productId, newProduct);
      setNewProductName('');
      await loadProductData();
    } catch (error) {
      console.error('Error adding product:', error);
      setError('Failed to add product');
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      await deleteProduct(productId);
      await loadProductData();
    } catch (error) {
      console.error('Error deleting product:', error);
    }
  };

  const handleResetData = async () => {
    try {
      // Clear all product data from Redis
      for (const productId of Object.keys(products)) {
        await deleteProduct(productId);
      }
      await loadProductData();
      setShowResetConfirm(false);
    } catch (error) {
      console.error('Error resetting product data:', error);
    }
  };

  // Filter and sort products based on search term
  const filteredProducts = Object.entries(products)
    .filter(([_, product]) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => a[1].name.localeCompare(b[1].name));

  if (isLoading) {
    return (
      <div className="text-purple-500">Loading...</div>
    );
  }

  return (
    <div className="flex flex-col h-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <h2 className="text-xl font-semibold text-gray-100">Product Management</h2>
        <button
          onClick={() => setShowResetConfirm(true)}
          className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 text-sm bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 font-medium shadow-lg shadow-red-900/20 border border-red-900/20"
        >
          Reset All Data
        </button>
      </div>

      {/* Search and Add Product Section */}
      <div className="space-y-4 mb-6">
        {/* Search Products */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg bg-gray-900/70 border border-gray-800 text-gray-100 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

        {/* Add New Product */}
        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            placeholder="Product name"
            value={newProductName}
            onChange={(e) => setNewProductName(e.target.value)}
            className="flex-1 rounded-lg bg-gray-900/70 border border-gray-800 text-gray-100 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <button
            onClick={handleAddProduct}
            className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 text-sm bg-purple-600/20 text-purple-400 rounded-lg hover:bg-purple-600/30 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 font-medium shadow-lg shadow-purple-900/20 border border-purple-900/20"
          >
            Add Product
          </button>
        </div>

        {error && (
          <div className="text-red-400 text-sm">{error}</div>
        )}
      </div>

      {/* Product List - Scrollable Section */}
      <div className="overflow-hidden">
        <div className="h-[40vh] overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
          {filteredProducts.map(([id, product]) => (
            <div
              key={id}
              className="flex items-center justify-between p-2 rounded-lg bg-gray-900/50 border border-gray-800"
            >
              <div className="flex items-center gap-4">
                <span className="text-gray-100 text-sm sm:text-base">{product.name}</span>
              </div>
              <button
                onClick={() => handleDeleteProduct(id)}
                className="p-2 text-red-400 hover:bg-red-600/20 rounded-md transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 sm:w-5 sm:h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          {filteredProducts.length === 0 && (
            <div className="text-center text-gray-500 py-4">
              No products found
            </div>
          )}
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-xl max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-gray-100 mb-4">Reset All Data?</h3>
            <p className="text-gray-400 mb-6">
              This will permanently delete all product data. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 text-gray-400 hover:text-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResetData}
                className="px-4 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors"
              >
                Reset All Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductManagementTable;