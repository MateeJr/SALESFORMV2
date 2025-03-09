'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getSalesNames, getOutletNames, getProducts, Product } from '@/lib/redis';
import SalesLoginModal from './SalesLoginModal';

type ValidationErrors = {
  sales?: string;
  namaOutlet?: string;
  alamat?: string;
  selectedProducts?: string;
  productPrices?: Record<string, string>;
  productQuantities?: Record<string, string>;
  images?: string;
};

// Add new types for image data
type ImageWithLocation = {
  imageData: string;
  location?: {
    latitude: number;
    longitude: number;
    timestamp: number;
  };
  isLoadingLocation?: boolean;
};

const SalesForm = () => {
  const [salesOptions, setSalesOptions] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [selectedSalesId, setSelectedSalesId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Add new state variables for status checks
  const [gpsStatus, setGpsStatus] = useState<{ status: 'checking' | 'allowed' | 'denied' | 'error' | 'weak' | 'strong', message: string }>({ status: 'checking', message: 'Checking for GPS...' });
  const [cameraStatus, setCameraStatus] = useState<{ status: 'checking' | 'allowed' | 'denied' | 'error', message: string }>({ status: 'checking', message: 'Checking for Camera...' });
  const [networkStatus, setNetworkStatus] = useState<{ status: 'checking' | 'stable' | 'unstable' | 'error', message: string }>({ status: 'checking', message: 'Checking for Network...' });
  const [locationInfo, setLocationInfo] = useState<string>('');

  // Add product options with their respective images
  const [productOptions, setProductOptions] = useState<Product[]>([]);

  const taxTypes = [
    { id: 'pkp', name: 'PKP' },
    { id: 'non_pkp', name: 'NON PKP' },
  ];

  const customerCategories = [
    { id: 'noo', name: 'NOO' },
    { id: 'existing', name: 'Existing' },
  ];

  const [formData, setFormData] = useState({
    sales: '',
    namaOutlet: 'outlet1',
    tipeOutlet: 'NOO',
    alamat: '',
    tipePesanan: 'NEW',
    selectedProducts: {} as Record<string, { hargaJual: string, jumlah: string }>,
    tipePajak: 'NON PKP',
    kategoriCustomer: 'NOO',
    bonus: '',
    alasanTidakPesan: '',
    penagihan: 'TERTAGIH',
    alasanTidakTertagih: '',
  });

  // Add state for product search
  const [productSearchTerm, setProductSearchTerm] = useState('');

  // Filter products based on search term
  const filteredProducts = productOptions.filter(product =>
    product.name.toLowerCase().includes(productSearchTerm.toLowerCase())
  );

  const [outletOptions, setOutletOptions] = useState<Record<string, string>>({});
  const [outletSearchTerm, setOutletSearchTerm] = useState('');
  const [isOutletDropdownOpen, setIsOutletDropdownOpen] = useState(false);
  const outletDropdownRef = useRef<HTMLDivElement>(null);

  // Add new state for captured images
  const [capturedImages, setCapturedImages] = useState<ImageWithLocation[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showNotification, setShowNotification] = useState(false);

  // Add new state variables for GPS monitoring
  const [watchId, setWatchId] = useState<number | null>(null);
  const [lastPosition, setLastPosition] = useState<GeolocationPosition | null>(null);

  // Add state for dropdown visibility
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const productDropdownRef = useRef<HTMLDivElement>(null);

  // Add new state variables for dropdowns
  const [isTipeOutletDropdownOpen, setIsTipeOutletDropdownOpen] = useState(false);
  const [isTipePesananDropdownOpen, setIsTipePesananDropdownOpen] = useState(false);
  const [isTipePajakDropdownOpen, setIsTipePajakDropdownOpen] = useState(false);
  const [isKategoriCustomerDropdownOpen, setIsKategoriCustomerDropdownOpen] = useState(false);
  const [isPenagihanDropdownOpen, setIsPenagihanDropdownOpen] = useState(false);

  // Add refs for dropdowns
  const tipeOutletDropdownRef = useRef<HTMLDivElement>(null);
  const tipePesananDropdownRef = useRef<HTMLDivElement>(null);
  const tipePajakDropdownRef = useRef<HTMLDivElement>(null);
  const kategoriCustomerDropdownRef = useRef<HTMLDivElement>(null);
  const penagihanDropdownRef = useRef<HTMLDivElement>(null);

  // Add validation state
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  // Add state for submission overlay
  const [showSubmitOverlay, setShowSubmitOverlay] = useState(false);
  const [submitProgressSteps, setSubmitProgressSteps] = useState<{
    step: 'preparing' | 'connecting' | 'sending' | 'processing' | 'confirming' | 'complete';
    message: string;
    progress: number;
  }>({
    step: 'preparing',
    message: 'Menyiapkan data...',
    progress: 0
  });
  const [submitRetryCount, setSubmitRetryCount] = useState(0);
  const [submitErrorMessage, setSubmitErrorMessage] = useState('');

  // Add state for tracking submit location
  const [submitLocation, setSubmitLocation] = useState<{
    latitude: number;
    longitude: number;
    timestamp: number;
  } | null>(null);

  // Add notification timeout cleanup
  useEffect(() => {
    if (showNotification) {
      const timer = setTimeout(() => {
        setShowNotification(false);
      }, 3000); // Hide after 3 seconds

      return () => clearTimeout(timer);
    }
  }, [showNotification]);

  // Load sales data from Redis
  useEffect(() => {
    const loadSalesData = async () => {
      try {
        setIsLoading(true);
        const data = await getSalesNames();
        setSalesOptions(data);
      } catch (error) {
        console.error('Error loading sales data:', error);
        setSalesOptions({});
      } finally {
        setIsLoading(false);
      }
    };

    loadSalesData();
    checkAuthentication();
  }, []);

  const checkAuthentication = () => {
    const cookies = document.cookie.split(';');
    const salesIdCookie = cookies.find(cookie => cookie.trim().startsWith('salesId='));
    
    if (salesIdCookie) {
      const salesId = salesIdCookie.split('=')[1];
      // Check if cookie is not empty
      if (salesId && salesId.trim() !== '') {
        setSelectedSalesId(salesId);
        setIsAuthenticated(true);
        setFormData(prev => ({ ...prev, sales: salesId }));
      } else {
        // Clear the invalid cookie
        document.cookie = 'salesId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        setFormData(prev => ({ ...prev, sales: '' }));
      }
    } else {
      setFormData(prev => ({ ...prev, sales: '' }));
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSalesSelect = (salesId: string, salesName: string) => {
    if (!isAuthenticated || selectedSalesId !== salesId) {
      setSelectedSalesId(salesId);
      setShowLoginModal(true);
    } else {
      setFormData(prev => ({ ...prev, sales: salesId }));
    }
    setIsDropdownOpen(false);
  };

  // Filter and sort sales options
  const filteredSalesOptions = Object.entries(salesOptions)
    .filter(([_, name]) => 
      name.toLowerCase().includes((searchTerm || '').toLowerCase())
    )
    .sort((a, b) => a[1].localeCompare(b[1]));

  const handleLoginSuccess = () => {
    setShowLoginModal(false);
    setIsAuthenticated(true);
    if (selectedSalesId) {
      setFormData(prev => ({ ...prev, sales: selectedSalesId }));
    }
  };

  const handleLoginCancel = () => {
    setShowLoginModal(false);
    setSelectedSalesId(null);
    setFormData(prev => ({ ...prev, sales: '' }));
  };

  // Load outlet data from Redis
  useEffect(() => {
    const loadOutletData = async () => {
      try {
        const data = await getOutletNames();
        setOutletOptions(data);
      } catch (error) {
        console.error('Error loading outlet data:', error);
        setOutletOptions({});
      }
    };

    loadOutletData();
  }, []);

  // Close outlet dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (outletDropdownRef.current && !outletDropdownRef.current.contains(event.target as Node)) {
        setIsOutletDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter and sort outlet options
  const filteredOutletOptions = Object.entries(outletOptions)
    .filter(([_, name]) => 
      name.toLowerCase().includes((outletSearchTerm || '').toLowerCase())
    )
    .sort((a, b) => a[1].localeCompare(b[1]));

  const formatToRupiah = (value: string) => {
    const number = value.replace(/[^\d]/g, '');
    return new Intl.NumberFormat('id-ID').format(Number(number));
  };

  const calculateTotal = () => {
    const total = Object.values(formData.selectedProducts).reduce((sum, product) => {
      const harga = Number(product.hargaJual.replace(/[^\d]/g, ''));
      const jumlah = Number(product.jumlah);
      return sum + (isNaN(harga) || isNaN(jumlah) ? 0 : harga * jumlah);
    }, 0);
    return `Rp ${new Intl.NumberFormat('id-ID').format(total)}`;
  };

  // Helper function to get Google Maps link from coordinates
  const getGoogleMapsLink = (latitude: number, longitude: number): string => {
    return `https://www.google.com/maps?q=${latitude},${longitude}`;
  };

  // Helper function to get current position
  const getCurrentPosition = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0
      });
    });
  };

  // Modified handleImageCapture function
  const handleImageCapture = async (file: File) => {
    if (file.type.startsWith('image/') && 
        (!file.lastModified || Date.now() - file.lastModified < 1000)) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const imageData = reader.result as string;
        
        // Add image with loading state
        const newImage: ImageWithLocation = {
          imageData,
          isLoadingLocation: true
        };
        
        setCapturedImages(prev => [...prev, newImage]);
        
        try {
          // Get location for this image
          const position = await getCurrentPosition();
          
          // Update the image with its location
          setCapturedImages(prev => prev.map((img, idx) => 
            img.imageData === imageData ? {
              ...img,
              location: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                timestamp: position.timestamp
              },
              isLoadingLocation: false
            } : img
          ));
        } catch (error) {
          console.error('Error getting location for image:', error);
          // Update to remove loading state even if location failed
          setCapturedImages(prev => prev.map((img, idx) => 
            img.imageData === imageData ? {
              ...img,
              isLoadingLocation: false
            } : img
          ));
        }

        // Clear validation errors if we have images now
        if (validationErrors.images) {
          setValidationErrors(prev => {
            const newErrors = { ...prev } as ValidationErrors;
            delete newErrors.images;
            return newErrors;
          });
        }
      };
      reader.readAsDataURL(file);
    } else {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setShowNotification(true);
    }
  };

  // Load product data from Redis
  useEffect(() => {
    const loadProductData = async () => {
      try {
        const data = await getProducts();
        // Convert Record to array and sort by name
        const productArray = Object.values(data).sort((a, b) => a.name.localeCompare(b.name));
        setProductOptions(productArray);
      } catch (error) {
        console.error('Error loading product data:', error);
        setProductOptions([]);
      }
    };

    loadProductData();
  }, []);

  const resetForm = () => {
    setFormData({
      sales: '',
      namaOutlet: 'outlet1',
      tipeOutlet: 'NOO',
      alamat: '',
      tipePesanan: 'NEW',
      selectedProducts: {} as Record<string, { hargaJual: string, jumlah: string }>,
      tipePajak: 'NON PKP',
      kategoriCustomer: 'NOO',
      bonus: '',
      alasanTidakPesan: '',
      penagihan: 'TERTAGIH',
      alasanTidakTertagih: '',
    });
    setCapturedImages([]);
    setProductSearchTerm('');
    setOutletSearchTerm('');
  };

  // Modified handleSubmit function
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Reset validation errors
    setValidationErrors({});
    
    // Collect validation errors
    const errors: ValidationErrors = {};
    
    if (!formData.sales) {
      errors.sales = 'Sales harus dipilih';
    }
    
    if (!formData.namaOutlet) {
      errors.namaOutlet = 'Nama outlet harus diisi';
    }
    
    if (!formData.alamat) {
      errors.alamat = 'Alamat harus diisi';
    }
    
    if (Object.keys(formData.selectedProducts).length === 0) {
      errors.selectedProducts = 'Pilih minimal satu produk';
    }
    
    // Check if all selected products have prices and quantities
    const priceErrors: Record<string, string> = {};
    const quantityErrors: Record<string, string> = {};
    let hasPriceErrors = false;
    let hasQuantityErrors = false;
    
    Object.entries(formData.selectedProducts).forEach(([productId, product]) => {
      if (!product.hargaJual) {
        priceErrors[productId] = 'Harga jual harus diisi';
        hasPriceErrors = true;
      }
      if (!product.jumlah || Number(product.jumlah) <= 0) {
        quantityErrors[productId] = 'Jumlah harus diisi';
        hasQuantityErrors = true;
      }
    });
    
    if (hasPriceErrors) {
      errors.productPrices = priceErrors;
    }
    if (hasQuantityErrors) {
      errors.productQuantities = quantityErrors;
    }

    // Check for images
    if (capturedImages.length === 0) {
      errors.images = 'Foto bukti harus diambil';
    }

    // If there are errors, set them and stop submission
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      // Scroll to the first error
      const firstErrorElement = document.querySelector('[data-error]');
      if (firstErrorElement) {
        firstErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // Get submit location
    try {
      setSubmitProgressSteps({
        step: 'preparing',
        message: 'Tracking location...',
        progress: 5
      });

      const position = await getCurrentPosition();
      setSubmitLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        timestamp: position.timestamp
      });
    } catch (error) {
      console.error('Error getting submit location:', error);
    }

    // Reset submission state
    setSubmitRetryCount(0);
    setSubmitErrorMessage('');
    setSubmitStatus('submitting');
    setSubmitProgressSteps({
      step: 'preparing',
      message: 'Menyiapkan data...',
      progress: 10
    });
    setShowSubmitOverlay(true);

    // Prepare form data with locations
    const formDataToSubmit = {
      ...formData,
      selectedProducts: Object.fromEntries(
        Object.entries(formData.selectedProducts).map(([id, product]) => [
          id,
          { hargaJual: product.hargaJual.replace(/[^\d]/g, ''), jumlah: product.jumlah }
        ])
      ),
      images: capturedImages.map(img => img.imageData),
      imagesLocations: capturedImages.map(img => img.location ? {
        url: getGoogleMapsLink(img.location.latitude, img.location.longitude),
        timestamp: new Date(img.location.timestamp).toLocaleString('id-ID')
      } : null),
      submitLocation: submitLocation ? {
        url: getGoogleMapsLink(submitLocation.latitude, submitLocation.longitude),
        timestamp: new Date(submitLocation.timestamp).toLocaleString('id-ID')
      } : null,
      timestamp: new Date().toISOString()
    };

    await submitWithRetry(formDataToSubmit);
  };

  // Helper function to submit with retry
  const submitWithRetry = async (formDataToSubmit: any, currentRetry = 0) => {
    try {
      // Set progress to show we're starting - Preparing data
      setSubmitProgressSteps({
        step: 'preparing',
        message: 'Menyiapkan data untuk pengiriman...',
        progress: 10
      });
      await new Promise(resolve => setTimeout(resolve, 800)); // Simulate preparation time
      
      // Connecting to server
      setSubmitProgressSteps({
        step: 'connecting',
        message: 'Menghubungkan ke server...',
        progress: 25
      });
      await new Promise(resolve => setTimeout(resolve, 800)); // Simulate connection time
      
      // Sending data
      setSubmitProgressSteps({
        step: 'sending',
        message: 'Mengirim data ke server...',
        progress: 40
      });
      
      // Attempt to submit the form
      const response = await fetch('/api/sales/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formDataToSubmit),
      });
      
      // Processing response
      setSubmitProgressSteps({
        step: 'processing',
        message: 'Memproses respons dari server...',
        progress: 70
      });
      await new Promise(resolve => setTimeout(resolve, 600)); // Simulate processing time

      const result = await response.json();
      
      // Confirming submission
      setSubmitProgressSteps({
        step: 'confirming',
        message: 'Mengkonfirmasi pengiriman...',
        progress: 90
      });
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate confirmation time
      
      // Complete!
      setSubmitProgressSteps({
        step: 'complete',
        message: 'Pengiriman selesai!',
        progress: 100
      });
      
      if (result.success) {
        // Show success
        setSubmitStatus('success');
      } else {
        throw new Error(result.error || 'Failed to submit form');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      setSubmitErrorMessage((error as Error).message || 'Unknown error occurred');
      
      // If we have retries left, try again
      if (currentRetry < 2) { // Allow up to 3 attempts (0, 1, 2)
        setSubmitRetryCount(currentRetry + 1);
        // Reset progress for retry
        setSubmitProgressSteps({
          step: 'preparing',
          message: `Mencoba kembali (${currentRetry + 2}/3)...`,
          progress: 0
        });
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Try again
        await submitWithRetry(formDataToSubmit, currentRetry + 1);
      } else {
        // No more retries, show error
        setSubmitStatus('error');
      }
    }
  };

  // Function to reload the page
  const refreshPage = () => {
    window.location.reload();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // Clear validation error for the field being changed
    setValidationErrors(prev => {
      const newErrors = { ...prev } as ValidationErrors;
      const fieldName = name as keyof ValidationErrors;
      if (fieldName in newErrors) {
        delete newErrors[fieldName];
      }
      return newErrors;
    });
    
    if (name === 'hargaJual') {
      setFormData(prev => ({
        ...prev,
        [name]: formatToRupiah(value)
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleLogout = () => {
    document.cookie = 'salesId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    setIsAuthenticated(false);
    setSelectedSalesId(null);
    setFormData(prev => ({ ...prev, sales: '' }));
    setSearchTerm('');
  };

  // Function to get location info from coordinates
  const getLocationInfo = async (latitude: number, longitude: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
        { headers: { 'Accept-Language': 'id' } }
      );
      const data = await response.json();
      
      // Try to get the most relevant location info
      const address = data.address;
      let location = '';
      
      if (address.city || address.town || address.village) {
        location = address.city || address.town || address.village;
      }
      if (address.state) {
        location = location ? `${location}, ${address.state}` : address.state;
      }
      if (!location && address.country) {
        location = address.country;
      }
      
      setLocationInfo(location || 'Unknown Location');
    } catch (error) {
      console.error('Error getting location info:', error);
      setLocationInfo('Location Info Unavailable');
    }
  };

  // Function to check GPS status and signal strength with continuous monitoring
  const checkGPS = useCallback(async () => {
    // Skip GPS check on Windows devices
    const ua = window.navigator.userAgent;
    if (/(Windows)/i.test(ua)) {
      setGpsStatus({ status: 'error', message: 'GPS Signal: Tidak Tersedia untuk PC' });
      return;
    }

    try {
      const permissionResult = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      
      if (permissionResult.state === 'denied') {
        setGpsStatus({ status: 'denied', message: 'GPS Belum Diizinkan/Diaktifkan' });
        return;
      }

      // Clear existing watch if any
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }

      // Start continuous monitoring
      const id = navigator.geolocation.watchPosition(
        (position) => {
          setLastPosition(position);
          const accuracy = position.coords.accuracy;
          
          // Get location info when position changes
          getLocationInfo(position.coords.latitude, position.coords.longitude);
          
          // Update GPS status based on accuracy
          if (accuracy <= 20) {
            setGpsStatus({ status: 'strong', message: `GPS Signal: Kuat (${locationInfo})` });
          } else if (accuracy <= 100) {
            setGpsStatus({ status: 'weak', message: `GPS Signal: Lemah (${locationInfo})` });
          } else {
            setGpsStatus({ status: 'weak', message: `GPS Signal: Lemah (${Math.round(accuracy)}m) (${locationInfo})` });
          }
        },
        (error) => {
          console.error('GPS Error:', error);
          switch (error.code) {
            case error.PERMISSION_DENIED:
              setGpsStatus({ status: 'denied', message: 'GPS Belum Diizinkan/Diaktifkan' });
              break;
            case error.POSITION_UNAVAILABLE:
              setGpsStatus({ status: 'error', message: 'GPS Signal: Tidak Tersedia' });
              break;
            case error.TIMEOUT:
              setGpsStatus({ status: 'error', message: 'GPS Signal: Timeout' });
              break;
            default:
              setGpsStatus({ status: 'error', message: 'GPS Error: ' + error.message });
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 0
        }
      );
      
      // Store the watch ID for cleanup
      setWatchId(id);
    } catch (error) {
      console.error('GPS check error:', error);
      setGpsStatus({ status: 'error', message: 'ERROR: GPS check failed' });
    }
  }, [locationInfo, watchId, setWatchId, setLastPosition, setGpsStatus]);

  // Update GPS status when location info changes
  useEffect(() => {
    if (lastPosition && locationInfo) {
      const accuracy = lastPosition.coords.accuracy;
      if (accuracy <= 20) {
        setGpsStatus(prev => ({ ...prev, message: `GPS Signal: Kuat (${locationInfo})` }));
      } else if (accuracy <= 100) {
        setGpsStatus(prev => ({ ...prev, message: `GPS Signal: Lemah (${locationInfo})` }));
      } else {
        setGpsStatus(prev => ({ ...prev, message: `GPS Signal: Lemah (${Math.round(accuracy)}m) (${locationInfo})` }));
      }
    }
  }, [lastPosition, locationInfo]); // Explicitly declare all dependencies

  // Clean up GPS monitoring on component unmount
  useEffect(() => {
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [watchId]);

  // Function to check camera status
  const checkCamera = async () => {
    try {
      const permissionResult = await navigator.permissions.query({ name: 'camera' as PermissionName });
      
      if (permissionResult.state === 'denied') {
        setCameraStatus({ status: 'denied', message: 'Camera Access: Denied' });
        return;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasCamera = devices.some(device => device.kind === 'videoinput');

      if (!hasCamera) {
        setCameraStatus({ status: 'denied', message: 'No Camera Found' });
        return;
      }

      // Test camera access
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop()); // Stop the test stream immediately
      
      setCameraStatus({ status: 'allowed', message: 'Camera Access: ✓' });
    } catch (error) {
      setCameraStatus({ status: 'error', message: 'ERROR: Camera check failed' });
    }
  };

  // Function to check network status
  const checkNetwork = async () => {
    try {
      // Try multiple endpoints for better reliability
      const endpoints = [
        'https://www.google.com/favicon.ico',
        'https://www.cloudflare.com/favicon.ico',
        'https://www.microsoft.com/favicon.ico'
      ];

      const promises = endpoints.map(async endpoint => {
        const startTime = performance.now();
        const response = await fetch(endpoint, { mode: 'no-cors' });
        const endTime = performance.now();
        return endTime - startTime;
      });

      // Use Promise.race to get the fastest response
      const pingTime = await Promise.race(promises);

      if (pingTime <= 150) {
        setNetworkStatus({ 
          status: 'stable', 
          message: `Network: Stable (${Math.round(pingTime)}ms)` 
        });
      } else {
        setNetworkStatus({ 
          status: 'unstable', 
          message: `Network: Unstable (${Math.round(pingTime)}ms)` 
        });
      }
    } catch (error) {
      // Try alternative method using Image load time
      try {
        const img = new Image();
        const startTime = performance.now();
        
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = 'https://www.google.com/favicon.ico?t=' + startTime;
        });

        const endTime = performance.now();
        const pingTime = endTime - startTime;

        if (pingTime <= 150) {
          setNetworkStatus({ 
            status: 'stable', 
            message: `Network: Stable (${Math.round(pingTime)}ms)` 
          });
        } else {
          setNetworkStatus({ 
            status: 'unstable', 
            message: `Network: Unstable (${Math.round(pingTime)}ms)` 
          });
        }
      } catch {
        setNetworkStatus({ status: 'error', message: 'Network: Check Failed' });
      }
    }
  };

  // Run checks when component mounts
  useEffect(() => {
    checkGPS();
    checkCamera();
    checkNetwork();

    // Set timeout only for camera and network checks
    const timeout = setTimeout(() => {
      setCameraStatus(prev => prev.status === 'checking' ? { status: 'error', message: 'ERROR: Camera timeout' } : prev);
      setNetworkStatus(prev => prev.status === 'checking' ? { status: 'error', message: 'ERROR: Network timeout' } : prev);
    }, 7000);

    return () => clearTimeout(timeout);
  }, [checkGPS]); // Added checkGPS to dependencies

  // Close product dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target as Node)) {
        setIsProductDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Add useEffect for closing dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tipeOutletDropdownRef.current && !tipeOutletDropdownRef.current.contains(event.target as Node)) {
        setIsTipeOutletDropdownOpen(false);
      }
      if (tipePesananDropdownRef.current && !tipePesananDropdownRef.current.contains(event.target as Node)) {
        setIsTipePesananDropdownOpen(false);
      }
      if (tipePajakDropdownRef.current && !tipePajakDropdownRef.current.contains(event.target as Node)) {
        setIsTipePajakDropdownOpen(false);
      }
      if (kategoriCustomerDropdownRef.current && !kategoriCustomerDropdownRef.current.contains(event.target as Node)) {
        setIsKategoriCustomerDropdownOpen(false);
      }
      if (penagihanDropdownRef.current && !penagihanDropdownRef.current.contains(event.target as Node)) {
        setIsPenagihanDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Add error overlay component
  const ErrorOverlay = ({ message }: { message: string }) => (
    <div className="absolute -top-2 left-0 transform -translate-y-full bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg z-10 animate-fade-in">
      <div className="absolute bottom-0 left-2 transform translate-y-1/2 rotate-45 w-2 h-2 bg-red-500"></div>
      {message}
    </div>
  );

  // Add new function to handle product selection
  const handleProductSelect = (productId: string, isChecked: boolean) => {
    const newSelectedProducts = { ...formData.selectedProducts };
    if (!isChecked) {
      newSelectedProducts[productId] = { hargaJual: '', jumlah: '1' };
    } else {
      delete newSelectedProducts[productId];
    }
    
    // Clear validation errors related to products
    setValidationErrors(prev => {
      const newErrors = { ...prev } as ValidationErrors;
      delete newErrors.selectedProducts;
      delete newErrors.productPrices;
      delete newErrors.productQuantities;
      return newErrors;
    });

    setFormData(prev => ({
      ...prev,
      selectedProducts: newSelectedProducts
    }));
  };

  // Add new function to handle product price/quantity changes
  const handleProductChange = (productId: string, field: 'hargaJual' | 'jumlah', value: string) => {
    const newSelectedProducts = { ...formData.selectedProducts };
    newSelectedProducts[productId] = {
      ...newSelectedProducts[productId],
      [field]: field === 'hargaJual' ? formatToRupiah(value) : value
    };

    // Clear validation errors for the specific product
    setValidationErrors(prev => {
      const newErrors = { ...prev } as ValidationErrors;
      if (field === 'hargaJual' && newErrors.productPrices) {
        const newPriceErrors = { ...newErrors.productPrices };
        delete newPriceErrors[productId];
        if (Object.keys(newPriceErrors).length === 0) {
          delete newErrors.productPrices;
        } else {
          newErrors.productPrices = newPriceErrors;
        }
      }
      if (field === 'jumlah' && newErrors.productQuantities) {
        const newQuantityErrors = { ...newErrors.productQuantities };
        delete newQuantityErrors[productId];
        if (Object.keys(newQuantityErrors).length === 0) {
          delete newErrors.productQuantities;
        } else {
          newErrors.productQuantities = newQuantityErrors;
        }
      }
      return newErrors;
    });

    setFormData(prev => ({
      ...prev,
      selectedProducts: newSelectedProducts
    }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-gray-950 py-12 px-4 sm:px-6 lg:px-8 flex justify-center items-center">
        <div className="text-purple-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-gray-950 py-12 px-4 sm:px-6 lg:px-8">
      {/* Notification Overlay */}
      {showNotification && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in">
          <div className="bg-red-500/90 backdrop-blur-sm text-white px-6 py-3 rounded-lg shadow-xl border border-red-400 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <span>Gunakan kamera untuk mengambil foto</span>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto">
        <div className="backdrop-blur-lg bg-black/30 rounded-xl shadow-2xl p-8 space-y-6 border border-gray-800">
          <h2 className="text-3xl font-bold text-gray-100 text-center mb-8">Sales Form</h2>
          
          {/* Add status check box */}
          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800 space-y-2">
            <div className={`text-sm font-medium flex items-center animate-slide-in ${
              gpsStatus.status === 'denied' ? 'text-red-400' :
              gpsStatus.status === 'strong' ? 'text-green-400' :
              gpsStatus.status === 'weak' ? 'text-yellow-400' :
              gpsStatus.status === 'error' ? 'text-red-400' :
              'text-gray-400'
            }`}>
              {gpsStatus.status === 'checking' ? (
                <svg className="status-icon animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
              ) : gpsStatus.status === 'strong' || gpsStatus.status === 'weak' ? (
                <svg className={`status-icon ${gpsStatus.status === 'strong' ? 'text-green-400' : 'text-green-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : gpsStatus.status === 'denied' ? (
                <svg className="status-icon text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              ) : (
                <svg className="status-icon text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {gpsStatus.message}
            </div>
            <div className={`text-sm font-medium flex items-center animate-slide-in ${
              cameraStatus.status === 'allowed' ? 'text-green-400' :
              cameraStatus.status === 'denied' ? 'text-red-400' :
              cameraStatus.status === 'error' ? 'text-red-400' :
              'text-gray-400'
            }`}>
              {cameraStatus.status === 'checking' ? (
                <svg className="status-icon animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
              ) : cameraStatus.status === 'allowed' ? (
                <svg className="status-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="status-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {cameraStatus.message}
            </div>
            <div className={`text-sm font-medium flex items-center animate-slide-in ${
              networkStatus.status === 'stable' ? 'text-green-400' :
              networkStatus.status === 'unstable' ? 'text-yellow-400' :
              networkStatus.status === 'error' ? 'text-red-400' :
              'text-gray-400'
            }`}>
              {networkStatus.status === 'checking' ? (
                <svg className="status-icon animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
              ) : networkStatus.status === 'stable' ? (
                <svg className="status-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : networkStatus.status === 'unstable' ? (
                <svg className="status-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              ) : (
                <svg className="status-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {networkStatus.message}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Custom Sales Dropdown */}
            <div>
              <label htmlFor="sales" className="block text-sm font-medium text-gray-300">
                Sales
              </label>
              <div className="relative mt-1" ref={dropdownRef} data-error={validationErrors.sales}>
                {validationErrors.sales && <ErrorOverlay message={validationErrors.sales} />}
                {isAuthenticated ? (
                  <div className="flex items-center justify-between w-full rounded-md bg-gray-900/70 border border-gray-800 px-3 py-2">
                    <div className="text-gray-100">
                      Logged in as <span className="font-medium text-purple-400">{salesOptions[formData.sales]}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="ml-2 px-3 py-1 text-sm bg-red-600/20 text-red-400 rounded-md hover:bg-red-600/30 transition-colors"
                    >
                      Logout
                    </button>
                  </div>
                ) : (
                  <div
                    className="relative cursor-pointer"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  >
                    <input
                      type="text"
                      placeholder="Search sales..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setIsDropdownOpen(true);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsDropdownOpen(true);
                      }}
                      className="w-full rounded-md bg-gray-900/70 border border-gray-800 text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors pr-10"
                    />
                    <div 
                      className="absolute inset-y-0 right-0 flex items-center pr-2 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsDropdownOpen(!isDropdownOpen);
                      }}
                    >
                      <svg
                        className={`h-5 w-5 text-gray-400 transform transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
                )}

                {/* Dropdown Menu - Only show when not authenticated */}
                {!isAuthenticated && isDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md bg-gray-900/95 shadow-lg border border-gray-800 backdrop-blur-sm max-h-60 overflow-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                    <div className="py-1">
                      <div
                        className="px-3 py-2 text-gray-300 hover:bg-purple-600/20 cursor-pointer transition-colors"
                        onClick={() => {
                          setFormData(prev => ({ ...prev, sales: '' }));
                          setIsDropdownOpen(false);
                          setSearchTerm('');
                        }}
                      >
                        PILIH AKUNMU
                      </div>
                      {filteredSalesOptions.map(([key, value]) => (
                        <div
                          key={key}
                          className={`px-3 py-2 cursor-pointer transition-colors ${
                            formData.sales === key
                              ? 'bg-purple-600/30 text-white'
                              : 'text-gray-300 hover:bg-purple-600/20'
                          }`}
                          onClick={() => handleSalesSelect(key, value)}
                        >
                          {value}
                        </div>
                      ))}
                      {filteredSalesOptions.length === 0 && (
                        <div className="px-3 py-2 text-gray-500 italic">
                          No sales found
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Nama Outlet Dropdown */}
            <div>
              <label htmlFor="namaOutlet" className="block text-sm font-medium text-gray-300">
                Nama Outlet
              </label>
              <div className="relative mt-1" ref={outletDropdownRef} data-error={validationErrors.namaOutlet}>
                {validationErrors.namaOutlet && <ErrorOverlay message={validationErrors.namaOutlet} />}
                <div
                  className="relative cursor-pointer"
                  onClick={() => setIsOutletDropdownOpen(!isOutletDropdownOpen)}
                >
                  <input
                    type="text"
                    placeholder="Search outlet..."
                    value={outletSearchTerm}
                    onChange={(e) => {
                      setOutletSearchTerm(e.target.value);
                      setIsOutletDropdownOpen(true);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsOutletDropdownOpen(true);
                    }}
                    className="w-full rounded-md bg-gray-900/70 border border-gray-800 text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors pr-10"
                  />
                  <div 
                    className="absolute inset-y-0 right-0 flex items-center pr-2 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsOutletDropdownOpen(!isOutletDropdownOpen);
                    }}
                  >
                    <svg
                      className={`h-5 w-5 text-gray-400 transform transition-transform ${isOutletDropdownOpen ? 'rotate-180' : ''}`}
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>

                {/* Outlet Dropdown Menu */}
                {isOutletDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md bg-gray-900/95 shadow-lg border border-gray-800 backdrop-blur-sm max-h-60 overflow-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                    <div className="py-1">
                      {filteredOutletOptions.map(([key, value]) => (
                        <div
                          key={key}
                          className={`px-3 py-2 cursor-pointer transition-colors ${
                            formData.namaOutlet === key
                              ? 'bg-purple-600/30 text-white'
                              : 'text-gray-300 hover:bg-purple-600/20'
                          }`}
                          onClick={() => {
                            setFormData(prev => ({ ...prev, namaOutlet: key }));
                            setOutletSearchTerm(value);
                            setIsOutletDropdownOpen(false);
                          }}
                        >
                          {value}
                        </div>
                      ))}
                      {filteredOutletOptions.length === 0 && (
                        <div className="px-3 py-2 text-gray-500 italic">
                          No outlets found
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Tipe Outlet Dropdown */}
            <div>
              <label htmlFor="tipeOutlet" className="block text-sm font-medium text-gray-300">
                Tipe Outlet
              </label>
              <div className="relative mt-1" ref={tipeOutletDropdownRef}>
                <div
                  className="relative cursor-pointer"
                  onClick={() => setIsTipeOutletDropdownOpen(!isTipeOutletDropdownOpen)}
                >
                  <input
                    type="text"
                    readOnly
                    value={formData.tipeOutlet}
                    className="w-full rounded-md bg-gray-900/70 border border-gray-800 text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors pr-10 cursor-pointer"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                    <svg
                      className={`h-5 w-5 text-gray-400 transform transition-transform ${isTipeOutletDropdownOpen ? 'rotate-180' : ''}`}
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
                {isTipeOutletDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md bg-gray-900/95 shadow-lg border border-gray-800 backdrop-blur-sm">
                    <div className="py-1">
                      <div
                        className={`px-3 py-2 cursor-pointer transition-colors ${
                          formData.tipeOutlet === 'NOO'
                            ? 'bg-purple-600/30 text-white'
                            : 'text-gray-300 hover:bg-purple-600/20'
                        }`}
                        onClick={() => {
                          setFormData(prev => ({ ...prev, tipeOutlet: 'NOO' }));
                          setIsTipeOutletDropdownOpen(false);
                        }}
                      >
                        NOO
                      </div>
                      <div
                        className={`px-3 py-2 cursor-pointer transition-colors ${
                          formData.tipeOutlet === 'AO'
                            ? 'bg-purple-600/30 text-white'
                            : 'text-gray-300 hover:bg-purple-600/20'
                        }`}
                        onClick={() => {
                          setFormData(prev => ({ ...prev, tipeOutlet: 'AO' }));
                          setIsTipeOutletDropdownOpen(false);
                        }}
                      >
                        AO
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Alamat Input */}
            <div>
              <label htmlFor="alamat" className="block text-sm font-medium text-gray-300">
                Alamat
              </label>
              <div className="relative mt-1" data-error={validationErrors.alamat}>
                {validationErrors.alamat && <ErrorOverlay message={validationErrors.alamat} />}
              <textarea
                id="alamat"
                name="alamat"
                value={formData.alamat}
                onChange={handleChange}
                rows={3}
                  className={`mt-1 block w-full rounded-md bg-gray-900/70 border ${
                    validationErrors.alamat ? 'border-red-500' : 'border-gray-800'
                  } text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors placeholder-gray-500`}
                required
              />
              </div>
            </div>

            {/* Tipe Pesanan Dropdown */}
            <div>
              <label htmlFor="tipePesanan" className="block text-sm font-medium text-gray-300">
                Tipe Pesanan
              </label>
              <div className="relative mt-1" ref={tipePesananDropdownRef}>
                <div
                  className="relative cursor-pointer"
                  onClick={() => setIsTipePesananDropdownOpen(!isTipePesananDropdownOpen)}
                >
                  <input
                    type="text"
                    readOnly
                    value={formData.tipePesanan}
                    className="w-full rounded-md bg-gray-900/70 border border-gray-800 text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors pr-10 cursor-pointer"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                    <svg
                      className={`h-5 w-5 text-gray-400 transform transition-transform ${isTipePesananDropdownOpen ? 'rotate-180' : ''}`}
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
                {isTipePesananDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md bg-gray-900/95 shadow-lg border border-gray-800 backdrop-blur-sm">
                    <div className="py-1">
                      <div
                        className={`px-3 py-2 cursor-pointer transition-colors ${
                          formData.tipePesanan === 'NEW'
                            ? 'bg-purple-600/30 text-white'
                            : 'text-gray-300 hover:bg-purple-600/20'
                        }`}
                        onClick={() => {
                          setFormData(prev => ({ ...prev, tipePesanan: 'NEW' }));
                          setIsTipePesananDropdownOpen(false);
                        }}
                      >
                        NEW
                      </div>
                      <div
                        className={`px-3 py-2 cursor-pointer transition-colors ${
                          formData.tipePesanan === 'REPEAT ORDER'
                            ? 'bg-purple-600/30 text-white'
                            : 'text-gray-300 hover:bg-purple-600/20'
                        }`}
                        onClick={() => {
                          setFormData(prev => ({ ...prev, tipePesanan: 'REPEAT ORDER' }));
                          setIsTipePesananDropdownOpen(false);
                        }}
                      >
                        REPEAT ORDER
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Replace Product Dropdown with Checkbox List and Search */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Pilih Produk
              </label>
              <div className="space-y-3 bg-gray-900/70 rounded-md border border-gray-800 p-4">
                <input
                  type="text"
                  placeholder="Cari produk..."
                  value={productSearchTerm}
                  onChange={(e) => setProductSearchTerm(e.target.value)}
                  className="w-full rounded-md bg-gray-800 border border-gray-700 text-gray-100 px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {filteredProducts.map((product) => {
                    const isChecked = !!formData.selectedProducts[product.id];
                    return (
                      <div 
                        key={product.id} 
                        className={`flex items-center space-x-4 p-2 rounded-lg hover:bg-gray-800/50 transition-all duration-200 cursor-pointer ${
                          isChecked ? 'bg-gray-800/30' : ''
                        }`}
                        onClick={() => handleProductSelect(product.id, isChecked)}
                      >
                        <div className="relative flex items-center">
                          <div className={`w-6 h-6 border-2 rounded-md flex items-center justify-center transition-all duration-200 ${
                            isChecked 
                              ? 'border-purple-500 bg-purple-600/20' 
                              : 'border-gray-600 bg-gray-800/50'
                          }`}>
                            <svg
                              className={`w-4 h-4 text-purple-400 transition-opacity duration-200 ${
                                isChecked ? 'opacity-100' : 'opacity-0'
                              }`}
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-grow">
                          <span className="text-gray-300 hover:text-gray-100 transition-colors">
                        {product.name}
                          </span>
                    </div>
                      </div>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <div className="text-gray-500 text-center py-2">
                      Tidak ada produk yang cocok
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Harga Jual Input - with Rupiah formatting per product */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Harga Jual (Per Item)
              </label>
              <div className="space-y-3">
                {Object.entries(formData.selectedProducts).map(([productId, product]) => {
                  const productName = productOptions.find(p => p.id === productId)?.name || '';
                  const subtotal = Number(product.hargaJual.replace(/[^\d]/g, '')) * Number(product.jumlah);
                  return (
                    <div key={productId} className="bg-gray-900/50 p-3 rounded-md relative">
                      <button
                        type="button"
                        onClick={() => {
                          const newSelectedProducts = { ...formData.selectedProducts };
                          delete newSelectedProducts[productId];
                          setFormData(prev => ({
                            ...prev,
                            selectedProducts: newSelectedProducts
                          }));
                        }}
                        className="absolute top-2 right-2 p-1 bg-red-500/20 text-red-400 rounded-md hover:bg-red-500/30 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <div className="flex flex-col space-y-3 pr-8">
                        <div className="flex items-center">
                          <span className="text-gray-300">{productName}</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="relative flex-1" data-error={validationErrors.productPrices?.[productId]}>
                            {validationErrors.productPrices?.[productId] && (
                              <ErrorOverlay message={validationErrors.productPrices[productId]} />
                            )}
                            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                              Rp&nbsp;
                            </span>
                            <input
                              type="text"
                              value={product.hargaJual}
                              onChange={(e) => handleProductChange(productId, 'hargaJual', e.target.value)}
                              className={`w-full rounded-md bg-gray-800 border ${
                                validationErrors.productPrices?.[productId] ? 'border-red-500' : 'border-gray-700'
                              } text-gray-100 pl-12 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                              placeholder="0"
                            />
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-gray-400">×</span>
                            <div className="relative" data-error={validationErrors.productQuantities?.[productId]}>
                              {validationErrors.productQuantities?.[productId] && (
                                <ErrorOverlay message={validationErrors.productQuantities[productId]} />
                              )}
                            <input
                              type="number"
                              min="1"
                              value={product.jumlah}
                                onChange={(e) => handleProductChange(productId, 'jumlah', e.target.value)}
                                className={`w-20 rounded-md bg-gray-800 border ${
                                  validationErrors.productQuantities?.[productId] ? 'border-red-500' : 'border-gray-700'
                                } text-gray-100 px-2 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                              placeholder="Jumlah"
                            />
                          </div>
                        </div>
                      </div>
                      </div>
                      <div className="text-sm text-gray-400 text-right mt-2">
                        Subtotal: Rp {new Intl.NumberFormat('id-ID').format(subtotal)}
                      </div>
                    </div>
                  );
                })}
                {Object.keys(formData.selectedProducts).length === 0 && (
                  <div className="text-gray-500 text-center py-4">
                    Pilih produk untuk menambahkan harga
                  </div>
                )}
                <div className="mt-4 text-sm text-gray-400 font-medium border-t border-gray-800 pt-4">
                  Total: {calculateTotal()}
                </div>
              </div>
            </div>

            {/* Tax Type Selector */}
            <div>
              <label htmlFor="tipePajak" className="block text-sm font-medium text-gray-300">
                Tipe Pajak
              </label>
              <div className="relative mt-1" ref={tipePajakDropdownRef}>
                <div
                  className="relative cursor-pointer"
                  onClick={() => setIsTipePajakDropdownOpen(!isTipePajakDropdownOpen)}
                >
                  <input
                    type="text"
                    readOnly
                    value={formData.tipePajak}
                    className="w-full rounded-md bg-gray-900/70 border border-gray-800 text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors pr-10 cursor-pointer"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                    <svg
                      className={`h-5 w-5 text-gray-400 transform transition-transform ${isTipePajakDropdownOpen ? 'rotate-180' : ''}`}
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
                {isTipePajakDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md bg-gray-900/95 shadow-lg border border-gray-800 backdrop-blur-sm">
                    <div className="py-1">
                      {taxTypes.map((type) => (
                        <div
                          key={type.id}
                          className={`px-3 py-2 cursor-pointer transition-colors ${
                            formData.tipePajak === type.name
                              ? 'bg-purple-600/30 text-white'
                              : 'text-gray-300 hover:bg-purple-600/20'
                          }`}
                          onClick={() => {
                            setFormData(prev => ({ ...prev, tipePajak: type.name }));
                            setIsTipePajakDropdownOpen(false);
                          }}
                        >
                          {type.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Customer Category Selector */}
            <div>
              <label htmlFor="kategoriCustomer" className="block text-sm font-medium text-gray-300">
                Kategori Customer
              </label>
              <div className="relative mt-1" ref={kategoriCustomerDropdownRef}>
                <div
                  className="relative cursor-pointer"
                  onClick={() => setIsKategoriCustomerDropdownOpen(!isKategoriCustomerDropdownOpen)}
                >
                  <input
                    type="text"
                    readOnly
                    value={formData.kategoriCustomer}
                    className="w-full rounded-md bg-gray-900/70 border border-gray-800 text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors pr-10 cursor-pointer"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                    <svg
                      className={`h-5 w-5 text-gray-400 transform transition-transform ${isKategoriCustomerDropdownOpen ? 'rotate-180' : ''}`}
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
                {isKategoriCustomerDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md bg-gray-900/95 shadow-lg border border-gray-800 backdrop-blur-sm">
                    <div className="py-1">
                      {customerCategories.map((category) => (
                        <div
                          key={category.id}
                          className={`px-3 py-2 cursor-pointer transition-colors ${
                            formData.kategoriCustomer === category.name
                              ? 'bg-purple-600/30 text-white'
                              : 'text-gray-300 hover:bg-purple-600/20'
                          }`}
                          onClick={() => {
                            setFormData(prev => ({ ...prev, kategoriCustomer: category.name }));
                            setIsKategoriCustomerDropdownOpen(false);
                          }}
                        >
                          {category.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bonus Input */}
            <div>
              <label htmlFor="bonus" className="block text-sm font-medium text-gray-300">
                Bonus (Optional)
              </label>
              <input
                type="text"
                id="bonus"
                name="bonus"
                value={formData.bonus}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md bg-gray-900/70 border border-gray-800 text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors placeholder-gray-500"
                placeholder="Optional: Masukkan bonus jika ada"
              />
            </div>

            {/* Alasan Tidak Pesan Input - Now Optional */}
            <div>
              <label htmlFor="alasanTidakPesan" className="block text-sm font-medium text-gray-300">
                Alasan Tidak Pesan (Optional)
              </label>
              <textarea
                id="alasanTidakPesan"
                name="alasanTidakPesan"
                value={formData.alasanTidakPesan}
                onChange={handleChange}
                rows={3}
                className="mt-1 block w-full rounded-md bg-gray-900/70 border border-gray-800 text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors placeholder-gray-500"
                placeholder="Optional: Alasan tidak pesan"
              />
            </div>

            {/* Penagihan Dropdown */}
            <div>
              <label htmlFor="penagihan" className="block text-sm font-medium text-gray-300">
                Penagihan
              </label>
              <div className="relative mt-1" ref={penagihanDropdownRef}>
                <div
                  className="relative cursor-pointer"
                  onClick={() => setIsPenagihanDropdownOpen(!isPenagihanDropdownOpen)}
                >
                  <input
                    type="text"
                    readOnly
                    value={formData.penagihan}
                    className="w-full rounded-md bg-gray-900/70 border border-gray-800 text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors pr-10 cursor-pointer"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                    <svg
                      className={`h-5 w-5 text-gray-400 transform transition-transform ${isPenagihanDropdownOpen ? 'rotate-180' : ''}`}
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
                {isPenagihanDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md bg-gray-900/95 shadow-lg border border-gray-800 backdrop-blur-sm">
                    <div className="py-1">
                      <div
                        className={`px-3 py-2 cursor-pointer transition-colors ${
                          formData.penagihan === 'TERTAGIH'
                            ? 'bg-purple-600/30 text-white'
                            : 'text-gray-300 hover:bg-purple-600/20'
                        }`}
                        onClick={() => {
                          setFormData(prev => ({ ...prev, penagihan: 'TERTAGIH' }));
                          setIsPenagihanDropdownOpen(false);
                        }}
                      >
                        TERTAGIH
                      </div>
                      <div
                        className={`px-3 py-2 cursor-pointer transition-colors ${
                          formData.penagihan === 'TIDAK TERTAGIH'
                            ? 'bg-purple-600/30 text-white'
                            : 'text-gray-300 hover:bg-purple-600/20'
                        }`}
                        onClick={() => {
                          setFormData(prev => ({ ...prev, penagihan: 'TIDAK TERTAGIH' }));
                          setIsPenagihanDropdownOpen(false);
                        }}
                      >
                        TIDAK TERTAGIH
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Alasan Tidak Tertagih - Only shown when penagihan is TIDAK TERTAGIH */}
            {formData.penagihan === 'TIDAK TERTAGIH' && (
              <div>
                <label htmlFor="alasanTidakTertagih" className="block text-sm font-medium text-gray-300">
                  Alasan Tidak Tertagih
                </label>
                <textarea
                  id="alasanTidakTertagih"
                  name="alasanTidakTertagih"
                  value={formData.alasanTidakTertagih}
                  onChange={handleChange}
                  rows={3}
                  className="mt-1 block w-full rounded-md bg-gray-900/70 border border-gray-800 text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors placeholder-gray-500"
                  placeholder="Masukkan alasan tidak tertagih"
                  required
                />
              </div>
            )}

            {/* Camera Button and Image Preview Section */}
            <div className="space-y-4">
              <div className="relative flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-300">
                  Foto Bukti
                </label>
                {validationErrors.images && <ErrorOverlay message={validationErrors.images} />}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex items-center gap-2 px-4 py-2 ${
                    validationErrors.images 
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
                      : 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30'
                  } rounded-md transition-colors`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                  </svg>
                  Ambil Foto
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleImageCapture(file);
                  }
                }}
              />

              {/* Image Preview Grid */}
              {capturedImages.length > 0 && (
                <div className="grid grid-cols-2 gap-4">
                  {capturedImages.map((image, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={image.imageData}
                        alt={`Captured ${index + 1}`}
                        className="w-full h-40 object-cover rounded-lg border border-gray-800"
                      />
                      {image.isLoadingLocation && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                          <div className="text-white text-sm flex items-center gap-2">
                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Tracking Location...
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setCapturedImages(prev => prev.filter((_, i) => i !== index));
                        }}
                        className="absolute top-2 right-2 p-1 bg-red-500/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <button
                type="submit"
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-xl text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
              >
                Submit
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Login Modal */}
      {showLoginModal && selectedSalesId && (
        <SalesLoginModal
          salesId={selectedSalesId}
          salesName={salesOptions[selectedSalesId]}
          onClose={handleLoginCancel}
          onSuccess={handleLoginSuccess}
        />
      )}

      {/* Submission Overlay */}
      {showSubmitOverlay && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50">
          <div className="bg-gradient-to-b from-gray-900 to-black rounded-xl shadow-2xl p-8 max-w-md w-full mx-4 relative border border-gray-800">
            {/* Close button */}
            {submitStatus === 'success' && (
              <button 
                onClick={refreshPage} 
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

            {/* Content based on status */}
            {submitStatus === 'submitting' && (
              <div className="text-center">
                <h3 className="text-xl font-bold text-gray-100 mb-6">Pengiriman Data</h3>
                
                {/* Progress Status */}
                <div className="flex flex-col gap-4 mb-6">
                  {/* Preparing Step */}
                  <div className={`flex items-center ${submitProgressSteps.step === 'preparing' ? 'text-purple-400' : submitProgressSteps.progress > 10 ? 'text-green-400' : 'text-gray-500'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-4 ${
                      submitProgressSteps.step === 'preparing' ? 'bg-purple-600/20 border-2 border-purple-500' : 
                      submitProgressSteps.progress > 10 ? 'bg-green-600/20 border-2 border-green-500' : 'bg-gray-800 border-2 border-gray-700'
                    }`}>
                      {submitProgressSteps.progress > 10 ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span>1</span>
                      )}
                    </div>
                    <span>Menyiapkan Data</span>
                  </div>
                  
                  {/* Connecting Step */}
                  <div className={`flex items-center ${submitProgressSteps.step === 'connecting' ? 'text-purple-400' : submitProgressSteps.progress > 25 ? 'text-green-400' : 'text-gray-500'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-4 ${
                      submitProgressSteps.step === 'connecting' ? 'bg-purple-600/20 border-2 border-purple-500' : 
                      submitProgressSteps.progress > 25 ? 'bg-green-600/20 border-2 border-green-500' : 'bg-gray-800 border-2 border-gray-700'
                    }`}>
                      {submitProgressSteps.progress > 25 ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span>2</span>
                      )}
                    </div>
                    <span>Menghubungkan ke Server</span>
                  </div>
                  
                  {/* Sending Step */}
                  <div className={`flex items-center ${submitProgressSteps.step === 'sending' ? 'text-purple-400' : submitProgressSteps.progress > 40 ? 'text-green-400' : 'text-gray-500'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-4 ${
                      submitProgressSteps.step === 'sending' ? 'bg-purple-600/20 border-2 border-purple-500' : 
                      submitProgressSteps.progress > 40 ? 'bg-green-600/20 border-2 border-green-500' : 'bg-gray-800 border-2 border-gray-700'
                    }`}>
                      {submitProgressSteps.progress > 40 ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span>3</span>
                      )}
                    </div>
                    <span>Mengirim Data</span>
                  </div>
                  
                  {/* Processing Step */}
                  <div className={`flex items-center ${submitProgressSteps.step === 'processing' ? 'text-purple-400' : submitProgressSteps.progress > 70 ? 'text-green-400' : 'text-gray-500'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-4 ${
                      submitProgressSteps.step === 'processing' ? 'bg-purple-600/20 border-2 border-purple-500' : 
                      submitProgressSteps.progress > 70 ? 'bg-green-600/20 border-2 border-green-500' : 'bg-gray-800 border-2 border-gray-700'
                    }`}>
                      {submitProgressSteps.progress > 70 ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span>4</span>
                      )}
                    </div>
                    <span>Memproses Respons</span>
                  </div>
                  
                  {/* Confirming Step */}
                  <div className={`flex items-center ${submitProgressSteps.step === 'confirming' ? 'text-purple-400' : submitProgressSteps.progress > 90 ? 'text-green-400' : 'text-gray-500'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-4 ${
                      submitProgressSteps.step === 'confirming' ? 'bg-purple-600/20 border-2 border-purple-500' : 
                      submitProgressSteps.progress > 90 ? 'bg-green-600/20 border-2 border-green-500' : 'bg-gray-800 border-2 border-gray-700'
                    }`}>
                      {submitProgressSteps.progress > 90 ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span>5</span>
                      )}
                    </div>
                    <span>Konfirmasi</span>
                  </div>
                </div>
                
                {/* Current Activity */}
                <div className="mb-6">
                  <div className="mb-2">
                    <span className="text-gray-300">{submitProgressSteps.message}</span>
                    {submitRetryCount > 0 && (
                      <span className="text-amber-400 ml-2">
                        (Percobaan {submitRetryCount + 1}/3)
                      </span>
                    )}
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2.5">
                    <div 
                      className="bg-gradient-to-r from-purple-600 to-purple-400 h-2.5 rounded-full transition-all duration-500" 
                      style={{ width: `${submitProgressSteps.progress}%` }}
                    ></div>
                  </div>
                </div>
                
                <p className="text-gray-400 text-sm">
                  Mohon tunggu sebentar, data sedang diproses...
                </p>
              </div>
            )}

            {submitStatus === 'success' && (
              <div className="text-center">
                <div className="w-24 h-24 rounded-full bg-green-900/30 flex items-center justify-center mx-auto mb-6 border-2 border-green-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-green-400 mb-2">TERKIRIM!</h3>
                <p className="text-gray-300 mb-8">
                  Data telah berhasil terkirim dan disimpan. WhatsApp notifikasi telah dikirim ke administrator.
                </p>
                <button
                  onClick={refreshPage}
                  className="w-full py-3 bg-gradient-to-r from-green-600 to-green-700 text-white font-medium rounded-lg hover:from-green-700 hover:to-green-800 transition duration-200 shadow-lg shadow-green-900/30"
                >
                  OK
                </button>
              </div>
            )}

            {submitStatus === 'error' && (
              <div className="text-center">
                <div className="w-24 h-24 rounded-full bg-red-900/30 flex items-center justify-center mx-auto mb-6 border-2 border-red-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-red-400 mb-2">Pengiriman Gagal</h3>
                <p className="text-red-300 mb-2">
                  {submitErrorMessage || 'Terjadi kesalahan saat mengirim data.'}
                </p>
                <p className="text-gray-400 mb-8">
                  Silakan coba lagi atau hubungi administrator.
                </p>
                <div className="flex gap-4">
                  <button
                    onClick={() => setShowSubmitOverlay(false)}
                    className="flex-1 py-3 bg-gray-800 text-gray-200 font-medium rounded-lg hover:bg-gray-700 transition duration-200 shadow-lg shadow-gray-900/30"
                  >
                    Tutup
                  </button>
                  <button
                    onClick={() => {
                      setSubmitStatus('submitting');
                      setSubmitProgressSteps({
                        step: 'preparing',
                        message: 'Menyiapkan data...',
                        progress: 0
                      });
                      setSubmitRetryCount(0);
                      const formDataToSubmit = {
                        ...formData,
                        selectedProducts: Object.fromEntries(
                          Object.entries(formData.selectedProducts).map(([id, product]) => [
                            id,
                            { hargaJual: product.hargaJual.replace(/[^\d]/g, ''), jumlah: product.jumlah }
                          ])
                        ),
                        images: capturedImages.map(img => img.imageData),
                        imagesLocations: capturedImages.map(img => img.location ? {
                          url: getGoogleMapsLink(img.location.latitude, img.location.longitude),
                          timestamp: new Date(img.location.timestamp).toLocaleString('id-ID')
                        } : null),
                        submitLocation: submitLocation ? {
                          url: getGoogleMapsLink(submitLocation.latitude, submitLocation.longitude),
                          timestamp: new Date(submitLocation.timestamp).toLocaleString('id-ID')
                        } : null,
                        timestamp: new Date().toISOString()
                      };
                      submitWithRetry(formDataToSubmit);
                    }}
                    className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-medium rounded-lg hover:from-purple-700 hover:to-purple-800 transition duration-200 shadow-lg shadow-purple-900/30"
                  >
                    Coba Lagi
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Add this CSS at the end of the file to define the correct icon sizes
const styles = `
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translate(-50%, -20px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

@keyframes pulse {
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}

.animate-pulse {
  animation: pulse 1.5s ease-in-out infinite;
}

.animate-slide-in {
  animation: slideIn 0.3s ease-out forwards;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

.status-icon {
  display: inline-block;
  width: 16px;
  height: 16px;
  margin-right: 8px;
  vertical-align: middle;
}
`;

// Add the styles to the document
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}

export default SalesForm; 