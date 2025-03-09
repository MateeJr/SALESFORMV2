'use client';

import { useState, useEffect, useRef } from 'react';
import { getSalesNames, getOutletNames, getProducts } from '@/lib/redis';

const StatusPanel = () => {
  const [salesCount, setSalesCount] = useState<number>(0);
  const [outletCount, setOutletCount] = useState<number>(0);
  const [productCount, setProductCount] = useState<number>(0);
  const [redisStatus, setRedisStatus] = useState<'checking' | 'online' | 'offline' | 'timeout'>('checking');
  const [webStatus, setWebStatus] = useState<'online' | 'error'>('online');
  const [networkStatus, setNetworkStatus] = useState<'checking' | 'stable' | 'unstable'>('checking');
  const [deviceInfo, setDeviceInfo] = useState<string>('checking...');
  const [ipAddress, setIpAddress] = useState<string>('checking...');
  const [pingTime, setPingTime] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const networkIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    // Listen for Next.js errors
    const handleError = () => {
      setWebStatus('error');
    };

    // Get counts
    const getCounts = async () => {
      try {
        const salesData = await getSalesNames();
        const outletData = await getOutletNames();
        const productData = await getProducts();
        setSalesCount(Object.keys(salesData).length);
        setOutletCount(Object.keys(outletData).length);
        setProductCount(Object.keys(productData).length);
        setRedisStatus('online');
      } catch (error) {
        console.error('Error fetching data:', error);
        setRedisStatus('offline');
      }
    };

    // Check server status with timeout
    const checkServer = async () => {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );

      try {
        await Promise.race([getCounts(), timeoutPromise]);
      } catch (error: unknown) {
        if (error instanceof Error && error.message === 'Timeout') {
          setRedisStatus('timeout');
        } else {
          setRedisStatus('offline');
        }
      }
    };

    // Get device info
    const getDeviceInfo = () => {
      const ua = window.navigator.userAgent;
      let deviceType = 'Unknown';
      
      if (/(Windows)/i.test(ua)) deviceType = 'Windows';
      else if (/(Android)/i.test(ua)) deviceType = 'Android';
      else if (/(iPhone|iPad|iPod)/i.test(ua)) deviceType = 'iOS';
      else if (/(Mac)/i.test(ua)) deviceType = 'MacOS';
      else if (/(Linux)/i.test(ua)) deviceType = 'Linux';
      
      setDeviceInfo(deviceType);
    };

    // Get IP address
    const getIpAddress = async () => {
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        setIpAddress(data.ip);
      } catch (error) {
        setIpAddress('Failed to get IP');
      }
    };

    // Check network status
    const checkNetwork = async () => {
      try {
        const startTime = performance.now();
        await fetch('https://www.google.com/favicon.ico', { mode: 'no-cors' });
        const endTime = performance.now();
        const latency = endTime - startTime;
        setPingTime(Math.round(latency));
        setNetworkStatus(latency <= 150 ? 'stable' : 'unstable');
      } catch {
        setNetworkStatus('unstable');
      }
    };

    // Store ref value at the start of the effect
    const currentStatusRef = statusRef.current;
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          checkServer();
          checkNetwork();
        }
      });
    });

    if (currentStatusRef) {
      observer.observe(currentStatusRef);
    }

    const interval = setInterval(checkServer, 30000);
    networkIntervalRef.current = setInterval(checkNetwork, 30000);

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleError);

    checkServer();
    getDeviceInfo();
    getIpAddress();

    return () => {
      clearInterval(interval);
      if (networkIntervalRef.current) {
        clearInterval(networkIntervalRef.current);
      }
      if (currentStatusRef) {
        observer.unobserve(currentStatusRef);
      }
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleError);
    };
  }, []);

  return (
    <div className="space-y-6" ref={statusRef}>
      <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-800 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Server Status Section */}
          <div className="space-y-3 bg-black/20 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Server Status</h3>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <span className="text-gray-300 w-16">REDIS:</span>
                <div className={`w-2 h-2 rounded-full ${
                  redisStatus === 'online' ? 'bg-green-500' :
                  redisStatus === 'checking' ? 'bg-yellow-500 animate-pulse' :
                  'bg-red-500'
                }`} />
                <span className={`font-medium ${
                  redisStatus === 'online' ? 'text-green-400' :
                  redisStatus === 'checking' ? 'text-yellow-400' :
                  'text-red-400'
                }`}>
                  {redisStatus === 'online' ? 'Online' :
                   redisStatus === 'checking' ? 'Checking...' :
                   redisStatus === 'timeout' ? 'Timeout' :
                   'Offline'}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-gray-300 w-16">WEB:</span>
                <div className={`w-2 h-2 rounded-full ${
                  webStatus === 'online' ? 'bg-green-500' : 'bg-red-500'
                }`} />
                <span className={`font-medium ${
                  webStatus === 'online' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {webStatus === 'online' ? 'Online' : 'ERROR'}
                </span>
              </div>
            </div>
          </div>

          {/* Network Status Section */}
          <div className="space-y-3 bg-black/20 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Network Status</h3>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                networkStatus === 'stable' ? 'bg-green-500' :
                networkStatus === 'checking' ? 'bg-yellow-500 animate-pulse' :
                'bg-red-500'
              }`} />
              <span className={`font-medium ${
                networkStatus === 'stable' ? 'text-green-400' :
                networkStatus === 'checking' ? 'text-yellow-400' :
                'text-red-400'
              }`}>
                {networkStatus === 'stable' ? 'Stable' :
                 networkStatus === 'checking' ? 'Checking...' :
                 'Unstable'}
                {pingTime && ` (${pingTime}ms)`}
              </span>
            </div>
          </div>

          {/* Counts Section */}
          <div className="space-y-3 bg-black/20 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Current Counts</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Total Sales:</span>
                <span className="text-purple-400 font-medium">{salesCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Total Outlets:</span>
                <span className="text-purple-400 font-medium">{outletCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Total Products:</span>
                <span className="text-purple-400 font-medium">{productCount}</span>
              </div>
            </div>
          </div>

          {/* Device Info Section */}
          <div className="space-y-3 bg-black/20 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Device Info</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Device Type:</span>
                <span className="text-purple-400 font-medium">{deviceInfo}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">IP Address:</span>
                <span className="text-purple-400 font-medium">{ipAddress}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatusPanel; 