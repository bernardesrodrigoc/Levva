import React, { useEffect, useRef, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// --- CONFIGURAÇÃO DE ÍCONES ---

// Fix padrão do Leaflet no React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Ícone de Navegação (Seta) que rotaciona
const createNavIcon = (color, heading = 0) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40" style="transform: rotate(${heading}deg); transition: transform 0.5s ease;">
      <circle cx="12" cy="12" r="10" fill="white" stroke="${color}" stroke-width="2" shadow="0 2px 4px rgba(0,0,0,0.2)"/>
      <path d="M12 4L17 16H7L12 4Z" fill="${color}"/>
    </svg>
  `;
  
  return L.divIcon({
    html: svg,
    className: 'nav-marker', // Classe vazia para remover estilos padrão quadrados
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
};

const staticIcon = (type) => {
    let color = '#3b82f6'; // blue default
    let innerSvg = '';

    if (type === 'pickup') {
        color = '#3b82f6'; // Blue
        innerSvg = '<rect x="7" y="7" width="10" height="10" rx="1" fill="white"/><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" fill="none" stroke="white" stroke-width="2"/>'; 
    } else if (type === 'dropoff') {
        color = '#ef4444'; // Red
        innerSvg = '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white"/><circle cx="12" cy="9" r="2.5" fill="' + color + '"/>';
    }

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
            <circle cx="12" cy="12" r="12" fill="${color}" opacity="0.2"/>
            <circle cx="12" cy="12" r="8" fill="${color}"/>
        </svg>
    `;
    
    return L.divIcon({
        html: svg,
        className: 'static-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
    });
};

// --- COMPONENTES AUXILIARES ---

// Função de Interpolação Linear (Lerp) para suavizar movimento
const lerp = (start, end, t) => {
    return start * (1 - t) + end * t;
};

// Componente Marcador que se move suavemente (Animation Loop)
const MovingMarker = ({ position, heading, iconCreateFn, isTracking }) => {
    const markerRef = useRef(null);
    const prevPosRef = useRef(position);
    const requestRef = useRef();
    const startTimeRef = useRef(null);
    const DURATION = 1000; // Duração da animação em ms (suavidade)

    // Atualiza o ícone quando o heading muda
    useEffect(() => {
        if (markerRef.current) {
            markerRef.current.setIcon(iconCreateFn('#166534', heading));
        }
    }, [heading, iconCreateFn]);

    // Lógica de Animação de Movimento
    useEffect(() => {
        const animate = (time) => {
            if (!startTimeRef.current) startTimeRef.current = time;
            const progress = (time - startTimeRef.current) / DURATION;

            if (progress < 1) {
                const lat = lerp(prevPosRef.current.lat, position.lat, progress);
                const lng = lerp(prevPosRef.current.lng, position.lng, progress);
                
                if (markerRef.current) {
                    markerRef.current.setLatLng([lat, lng]);
                }
                requestRef.current = requestAnimationFrame(animate);
            } else {
                // Fim da animação, garante posição final
                if (markerRef.current) {
                    markerRef.current.setLatLng([position.lat, position.lng]);
                }
                prevPosRef.current = position; // Atualiza a "última posição conhecida"
            }
        };

        // Se a posição mudou significativamente, inicia animação
        if (prevPosRef.current.lat !== position.lat || prevPosRef.current.lng !== position.lng) {
            startTimeRef.current = null;
            requestRef.current = requestAnimationFrame(animate);
        }

        return () => cancelAnimationFrame(requestRef.current);
    }, [position]);

    return (
        <Marker 
            ref={markerRef} 
            position={[prevPosRef.current.lat, prevPosRef.current.lng]} 
            icon={iconCreateFn('#166534', heading)}
        >
            <Popup>
                <div className="text-sm">
                    <strong>Transportador</strong>
                    <p className="text-muted-foreground">
                        {isTracking ? 'Em movimento' : 'Conectado'}
                    </p>
                </div>
            </Popup>
        </Marker>
    );
};

// Controlador de Eventos do Mapa (Detecta interação do usuário)
const MapController = ({ center, shouldFollow, onUserInteraction }) => {
    const map = useMap();
    const isFirstLoad = useRef(true);

    // Detecta arraste ou zoom do usuário
    useMapEvents({
        dragstart: () => onUserInteraction(),
        zoomstart: () => onUserInteraction(),
    });

    useEffect(() => {
        if (center && shouldFollow) {
            // Na primeira carga vai direto, nas próximas anima suave (flyTo)
            if (isFirstLoad.current) {
                map.setView(center, 15);
                isFirstLoad.current = false;
            } else {
                map.flyTo(center, map.getZoom(), { duration: 1.5 });
            }
        }
    }, [center, shouldFollow, map]);

    return null;
};

// --- COMPONENTE PRINCIPAL ---

const LiveTrackingMap = ({
  carrierLocation,
  pickupLocation,
  dropoffLocation,
  routePolyline,
  routeHistory,
  isTracking,
  className = '',
  height = '500px' // Aumentei um pouco a altura padrão
}) => {
  const [shouldFollow, setShouldFollow] = useState(true);
  
  // Define o centro inicial ou atual do transportador
  const centerPos = useMemo(() => {
    if (carrierLocation) return [carrierLocation.lat, carrierLocation.lng];
    if (pickupLocation) return [pickupLocation.lat, pickupLocation.lng];
    return [-23.5505, -46.6333]; // Fallback SP
  }, [carrierLocation, pickupLocation]);

  // Histórico de rota limpo para Polyline
  const historyPath = useMemo(() => {
    return routeHistory?.map(p => [p.lat, p.lng]) || [];
  }, [routeHistory]);

  const handleUserInteraction = () => {
    // Só desativa o "seguir" se estiver ativo, para evitar loops
    if (shouldFollow) {
        setShouldFollow(false);
    }
  };

  return (
    <div className={`relative rounded-lg overflow-hidden shadow-lg border border-gray-200 ${className}`} style={{ height }}>
      <MapContainer
        center={centerPos}
        zoom={13}
        className="w-full h-full"
        zoomControl={false} // Customizaremos os controles se necessário, ou deixe padrão
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" // CartoDB Voyager (mais limpo e moderno que o padrão OSM)
        />

        {/* Lógica de controle de câmera */}
        <MapController 
            center={centerPos} 
            shouldFollow={shouldFollow} 
            onUserInteraction={handleUserInteraction} 
        />

        {/* Rota Planejada (Linha Tracejada Cinza) */}
        {routePolyline && routePolyline.length > 0 && (
          <Polyline
            positions={routePolyline}
            pathOptions={{ color: '#64748b', weight: 4, opacity: 0.5, dashArray: '10, 10' }}
          />
        )}

        {/* Histórico Real (Linha Azul Sólida) */}
        {historyPath.length > 0 && (
          <Polyline
            positions={historyPath}
            pathOptions={{ color: '#3b82f6', weight: 4, opacity: 0.8 }}
          />
        )}

        {/* Pontos Fixos */}
        {pickupLocation && (
          <Marker position={[pickupLocation.lat, pickupLocation.lng]} icon={staticIcon('pickup')}>
            <Popup><strong>Coleta:</strong> {pickupLocation.address}</Popup>
          </Marker>
        )}

        {/* Transportador Animado */}
        {carrierLocation && (
            <MovingMarker 
                position={carrierLocation} 
                heading={carrierLocation.heading || 0}
                iconCreateFn={createNavIcon}
                isTracking={isTracking}
            />
        )}

        {dropoffLocation && (
          <Marker position={[dropoffLocation.lat, dropoffLocation.lng]} icon={staticIcon('dropoff')}>
            <Popup><strong>Entrega:</strong> {dropoffLocation.address}</Popup>
          </Marker>
        )}

      </MapContainer>

      {/* Controles Flutuantes (Overlay) */}
      <div className="absolute bottom-6 right-6 z-[1000] flex flex-col gap-2">
        {/* Botão de Recentralizar (só aparece se o usuário moveu o mapa) */}
        {!shouldFollow && carrierLocation && (
            <button
                onClick={() => setShouldFollow(true)}
                className="bg-white text-gray-800 p-3 rounded-full shadow-lg hover:bg-gray-50 transition-all flex items-center justify-center animate-in fade-in zoom-in duration-300"
                title="Recentralizar no veículo"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="16"></line>
                    <line x1="8" y1="12" x2="16" y2="12"></line>
                </svg>
            </button>
        )}
      </div>

      {/* Indicador de Status Superior */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000]">
        <div className={`px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 shadow-lg backdrop-blur-md ${
          isTracking 
            ? 'bg-green-500/90 text-white' 
            : 'bg-gray-800/80 text-white'
        }`}>
          <span className={`w-2.5 h-2.5 rounded-full bg-white ${isTracking ? 'animate-pulse' : ''}`}></span>
          {isTracking ? 'Em trânsito' : 'Aguardando sinal...'}
        </div>
      </div>

      {/* Painel de Velocidade e Informações */}
      {carrierLocation && (
        <div className="absolute bottom-6 left-6 z-[1000] bg-white/95 backdrop-blur rounded-xl shadow-xl p-4 min-w-[140px] border border-gray-100">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">Velocidade</span>
            <span className="text-2xl font-bold text-gray-800">
                {carrierLocation.speed ? Math.round(carrierLocation.speed * 3.6) : 0} 
                <span className="text-sm text-gray-500 font-normal ml-1">km/h</span>
            </span>
            {carrierLocation.accuracy && (
                <span className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                    GPS ±{Math.round(carrierLocation.accuracy)}m
                </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveTrackingMap;
