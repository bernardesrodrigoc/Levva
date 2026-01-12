import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook for GPS tracking via WebSocket
 * @param {string} matchId - The match ID to track
 * @param {string} token - JWT token for authentication
 * @param {boolean} isCarrier - Whether the current user is the carrier
 */
export const useGPSTracking = (matchId, token, isCarrier = false) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [routeHistory, setRouteHistory] = useState([]);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
  const WS_URL = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');

  const connect = useCallback(() => {
    if (!matchId || !token) return;

    const endpoint = isCarrier ? 'carrier' : 'watch';
    const wsUrl = `${WS_URL}/ws/tracking/${matchId}/${endpoint}?token=${token}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleMessage(data);
        } catch (e) {
          console.error('Error parsing WebSocket message:', e);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setIsConnected(false);
        setIsTracking(false);

        // Reconnect after 3 seconds if not intentionally closed
        if (event.code !== 1000 && event.code !== 4000) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('Erro de conexão');
      };
    } catch (e) {
      console.error('Error creating WebSocket:', e);
      setError('Erro ao conectar');
    }
  }, [matchId, token, isCarrier, WS_URL]);

  const handleMessage = (data) => {
    switch (data.type) {
      case 'connection_status':
        setIsTracking(data.is_tracking_active);
        break;

      case 'location_update':
        setCurrentLocation(data.location);
        setRouteHistory(prev => [...prev, data.location]);
        break;

      case 'tracking_started':
        setIsTracking(true);
        break;

      case 'tracking_stopped':
      case 'tracking_paused':
        setIsTracking(false);
        break;

      case 'tracking_resumed':
        setIsTracking(true);
        break;

      case 'last_location':
        if (data.location) {
          setCurrentLocation(data.location);
        }
        break;

      case 'route_history':
        setRouteHistory(data.route_points || []);
        break;

      case 'location_ack':
        // Acknowledgment received
        break;

      case 'pong':
        // Keep-alive response
        break;

      default:
        console.log('Unknown message type:', data.type);
    }
  };

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    setIsConnected(false);
    setIsTracking(false);
  }, []);

  const sendLocation = useCallback((location) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'location_update',
        lat: location.latitude,
        lng: location.longitude,
        accuracy: location.accuracy || 0,
        speed: location.speed || 0,
        heading: location.heading || 0,
        battery_level: location.battery_level || null
      }));
    }
  }, []);

  const pauseTracking = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'pause_tracking' }));
    }
  }, []);

  const resumeTracking = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'resume_tracking' }));
    }
  }, []);

  const requestLastLocation = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'get_last_location' }));
    }
  }, []);

  const requestRouteHistory = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'get_route_history' }));
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isTracking,
    currentLocation,
    routeHistory,
    error,
    connect,
    disconnect,
    sendLocation,
    pauseTracking,
    resumeTracking,
    requestLastLocation,
    requestRouteHistory
  };
};

/**
 * Custom hook for carrier to send their GPS location
 * @param {string} matchId - The match ID
 * @param {string} token - JWT token
 * @param {number} intervalSeconds - Update interval in seconds (10-30)
 */
export const useCarrierGPS = (matchId, token, intervalSeconds = 15) => {
  const [isTracking, setIsTracking] = useState(false);
  const [lastSentLocation, setLastSentLocation] = useState(null);
  const [error, setError] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState('unknown');
  
  const gpsTracking = useGPSTracking(matchId, token, true);
  const watchIdRef = useRef(null);
  const lastSendTimeRef = useRef(0);

  const requestLocationPermission = useCallback(async () => {
    try {
      if (!navigator.geolocation) {
        setError('Geolocalização não suportada');
        setPermissionStatus('unavailable');
        return false;
      }

      const permission = await navigator.permissions.query({ name: 'geolocation' });
      setPermissionStatus(permission.state);

      permission.onchange = () => {
        setPermissionStatus(permission.state);
      };

      return permission.state === 'granted' || permission.state === 'prompt';
    } catch (e) {
      console.error('Error checking permission:', e);
      return true; // Assume we can try
    }
  }, []);

  const startTracking = useCallback(async () => {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      setError('Permissão de localização negada');
      return;
    }

    gpsTracking.connect();

    // Start watching position
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        const interval = intervalSeconds * 1000;

        // Only send if enough time has passed
        if (now - lastSendTimeRef.current >= interval) {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed,
            heading: position.coords.heading
          };

          gpsTracking.sendLocation(location);
          setLastSentLocation(location);
          lastSendTimeRef.current = now;
        }
      },
      (err) => {
        console.error('Geolocation error:', err);
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setError('Permissão de localização negada');
            setPermissionStatus('denied');
            break;
          case err.POSITION_UNAVAILABLE:
            setError('Localização indisponível');
            break;
          case err.TIMEOUT:
            setError('Tempo limite excedido');
            break;
          default:
            setError('Erro ao obter localização');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
      }
    );

    setIsTracking(true);
    setError(null);
  }, [gpsTracking, intervalSeconds, requestLocationPermission]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    gpsTracking.disconnect();
    setIsTracking(false);
  }, [gpsTracking]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return {
    isTracking,
    isConnected: gpsTracking.isConnected,
    lastSentLocation,
    error: error || gpsTracking.error,
    permissionStatus,
    startTracking,
    stopTracking,
    pauseTracking: gpsTracking.pauseTracking,
    resumeTracking: gpsTracking.resumeTracking
  };
};

export default useGPSTracking;
