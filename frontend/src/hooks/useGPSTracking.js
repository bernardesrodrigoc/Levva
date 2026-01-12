import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook for GPS tracking via WebSocket
 * Inclui lógica de Wake Lock para manter o dispositivo ativo durante o rastreamento
 */
export const useGPSTracking = (matchId, token, isCarrier = false) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [routeHistory, setRouteHistory] = useState([]);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000'; // Fallback de segurança
  const WS_URL = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');

  const connect = useCallback(() => {
    if (!matchId || !token) return;

    // Evita múltiplas conexões
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        return;
    }

    const endpoint = isCarrier ? 'carrier' : 'watch';
    const wsUrl = `${WS_URL}/ws/tracking/${matchId}/${endpoint}?token=${token}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[GPS] WebSocket connected as ${endpoint}`);
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleMessage(data);
        } catch (e) {
          console.error('[GPS] Error parsing WebSocket message:', e);
        }
      };

      ws.onclose = (event) => {
        console.log('[GPS] WebSocket closed:', event.code, event.reason);
        setIsConnected(false);
        
        // Se a conexão cair, não necessariamente paramos o tracking (ex: túnel), 
        // mas avisamos a UI se for crítico.
        // O isTracking aqui refere-se ao estado "Lógico" da entrega, não apenas da conexão.

        // Reconnect logic
        if (event.code !== 1000 && event.code !== 4000) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[GPS] Attempting to reconnect...');
            connect();
          }, 3000);
        } else {
            // Se foi fechamento intencional (ex: entrega finalizada), paramos o tracking
            setIsTracking(false);
        }
      };

      ws.onerror = (event) => {
        console.error('[GPS] WebSocket error:', event);
        // Não setamos erro fatal imediatamente para permitir tentativas de reconexão
      };
    } catch (e) {
      console.error('[GPS] Error creating WebSocket:', e);
      setError('Erro ao conectar ao serviço de rastreamento');
    }
  }, [matchId, token, isCarrier, WS_URL]);

  const handleMessage = (data) => {
    switch (data.type) {
      case 'connection_status':
        // Apenas atualiza se tivermos certeza do estado
        if (data.is_tracking_active !== undefined) setIsTracking(data.is_tracking_active);
        break;

      case 'location_update':
        setCurrentLocation(data.location);
        // Otimização: Limitar histórico para evitar estouro de memória em viagens longas (ex: max 1000 pontos)
        setRouteHistory(prev => {
            const newHistory = [...prev, data.location];
            if (newHistory.length > 2000) return newHistory.slice(-2000);
            return newHistory;
        });
        break;

      case 'tracking_started':
      case 'tracking_resumed':
        setIsTracking(true);
        break;

      case 'tracking_stopped':
      case 'tracking_paused':
        setIsTracking(false);
        break;

      case 'last_location':
        if (data.location) setCurrentLocation(data.location);
        break;

      case 'route_history':
        setRouteHistory(data.route_points || []);
        break;

      default:
        break;
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

  // Comandos de controle
  const pauseTracking = useCallback(() => wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify({ type: 'pause_tracking' })), []);
  const resumeTracking = useCallback(() => wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify({ type: 'resume_tracking' })), []);
  const requestLastLocation = useCallback(() => wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify({ type: 'get_last_location' })), []);
  const requestRouteHistory = useCallback(() => wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify({ type: 'get_route_history' })), []);

  useEffect(() => {
    return () => disconnect();
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
 * Inclui Wake Lock API para impedir que a tela desligue.
 */
export const useCarrierGPS = (matchId, token, intervalSeconds = 15) => {
  const [isTracking, setIsTracking] = useState(false);
  const [lastSentLocation, setLastSentLocation] = useState(null);
  const [error, setError] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState('unknown');
  
  const gpsTracking = useGPSTracking(matchId, token, true);
  const watchIdRef = useRef(null);
  const lastSendTimeRef = useRef(0);
  const wakeLockRef = useRef(null);

  // --- WAKE LOCK LOGIC ---
  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        console.log('[WakeLock] Screen Wake Lock active');
        
        wakeLockRef.current.addEventListener('release', () => {
          console.log('[WakeLock] Screen Wake Lock released');
        });
      }
    } catch (err) {
      console.warn(`[WakeLock] Failed to request Wake Lock: ${err.name}, ${err.message}`);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch (err) {
        console.error('[WakeLock] Error releasing:', err);
      }
    }
  }, []);

  // Re-request wake lock if visibility changes (app comes to foreground)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isTracking) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isTracking, requestWakeLock]);
  // -----------------------

  const requestLocationPermission = useCallback(async () => {
    if (!navigator.geolocation) {
      setError('Geolocalização não suportada neste navegador.');
      setPermissionStatus('unavailable');
      return false;
    }
    // Simplificado pois nem todos browsers suportam query detalhada
    return true; 
  }, []);

  const startTracking = useCallback(async () => {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) return;

    gpsTracking.connect();
    await requestWakeLock();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        const interval = intervalSeconds * 1000;

        // Throttling de envio (Data Saving)
        if (now - lastSendTimeRef.current >= interval) {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed,
            heading: position.coords.heading,
            // Opcional: pegar nível da bateria se disponível
            // battery_level: ...
          };

          gpsTracking.sendLocation(location);
          setLastSentLocation(location);
          lastSendTimeRef.current = now;
        }
      },
      (err) => {
        console.error('[GPS] Geolocation error:', err);
        setError('Erro ao obter localização: ' + err.message);
      },
      {
        enableHighAccuracy: true, // Necessário para rotas precisas
        timeout: 10000,
        maximumAge: 0 // Força leitura fresca do hardware
      }
    );

    setIsTracking(true);
    setError(null);
  }, [gpsTracking, intervalSeconds, requestLocationPermission, requestWakeLock]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    gpsTracking.disconnect();
    releaseWakeLock(); // Solta a tela para economizar bateria
    setIsTracking(false);
  }, [gpsTracking, releaseWakeLock]);

  // Cleanup final
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      releaseWakeLock();
    };
  }, [releaseWakeLock]);

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
