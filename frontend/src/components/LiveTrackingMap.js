import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom icons
const createIcon = (color, isMoving = false) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
      <circle cx="12" cy="12" r="10" fill="${color}" opacity="0.2"/>
      <circle cx="12" cy="12" r="6" fill="${color}"/>
      ${isMoving ? '<circle cx="12" cy="12" r="10" fill="none" stroke="' + color + '" stroke-width="2" opacity="0.5"><animate attributeName="r" from="6" to="12" dur="1s" repeatCount="indefinite"/><animate attributeName="opacity" from="0.5" to="0" dur="1s" repeatCount="indefinite"/></circle>' : ''}
    </svg>
  `;
  
  return L.divIcon({
    html: svg,
    className: 'custom-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

const carrierIcon = createIcon('#166534', true); // Green moving
const carrierStaticIcon = createIcon('#166534', false); // Green static
const pickupIcon = createIcon('#3b82f6'); // Blue
const dropoffIcon = createIcon('#ef4444'); // Red

// Component to auto-center map on carrier
const MapAutoCenter = ({ position, follow }) => {
  const map = useMap();
  
  useEffect(() => {
    if (follow && position) {
      map.setView([position.lat, position.lng], map.getZoom());
    }
  }, [position, follow, map]);
  
  return null;
};

const LiveTrackingMap = ({
  carrierLocation,
  pickupLocation,
  dropoffLocation,
  routePolyline,
  routeHistory,
  isTracking,
  followCarrier = true,
  className = '',
  height = '400px'
}) => {
  const [mapCenter, setMapCenter] = useState(null);
  const [shouldFollow, setShouldFollow] = useState(followCarrier);
  const mapRef = useRef(null);

  // Calculate initial center
  useEffect(() => {
    if (carrierLocation) {
      setMapCenter([carrierLocation.lat, carrierLocation.lng]);
    } else if (pickupLocation) {
      setMapCenter([pickupLocation.lat, pickupLocation.lng]);
    } else {
      setMapCenter([-23.5505, -46.6333]); // Default to São Paulo
    }
  }, []);

  // Generate route history polyline
  const historyPolyline = routeHistory?.length > 1
    ? routeHistory.map(point => [point.lat, point.lng])
    : [];

  if (!mapCenter) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 ${className}`} style={{ height }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-jungle"></div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} style={{ height }}>
      <MapContainer
        center={mapCenter}
        zoom={14}
        className="w-full h-full rounded-lg"
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Auto-center on carrier */}
        {carrierLocation && (
          <MapAutoCenter position={carrierLocation} follow={shouldFollow} />
        )}

        {/* Route polyline (original route) */}
        {routePolyline && routePolyline.length > 0 && (
          <Polyline
            positions={routePolyline}
            pathOptions={{ color: '#166534', weight: 4, opacity: 0.6, dashArray: '10, 10' }}
          />
        )}

        {/* Route history polyline (actual path traveled) */}
        {historyPolyline.length > 0 && (
          <Polyline
            positions={historyPolyline}
            pathOptions={{ color: '#3b82f6', weight: 3, opacity: 0.8 }}
          />
        )}

        {/* Pickup location */}
        {pickupLocation && (
          <Marker position={[pickupLocation.lat, pickupLocation.lng]} icon={pickupIcon}>
            <Popup>
              <div className="text-sm">
                <strong>Ponto de Coleta</strong>
                {pickupLocation.address && <p className="text-muted-foreground">{pickupLocation.address}</p>}
              </div>
            </Popup>
          </Marker>
        )}

        {/* Dropoff location */}
        {dropoffLocation && (
          <Marker position={[dropoffLocation.lat, dropoffLocation.lng]} icon={dropoffIcon}>
            <Popup>
              <div className="text-sm">
                <strong>Ponto de Entrega</strong>
                {dropoffLocation.address && <p className="text-muted-foreground">{dropoffLocation.address}</p>}
              </div>
            </Popup>
          </Marker>
        )}

        {/* Carrier location */}
        {carrierLocation && (
          <Marker
            position={[carrierLocation.lat, carrierLocation.lng]}
            icon={isTracking ? carrierIcon : carrierStaticIcon}
          >
            <Popup>
              <div className="text-sm">
                <strong>Transportador</strong>
                <p className="text-muted-foreground">
                  {isTracking ? 'Em movimento' : 'Última localização conhecida'}
                </p>
                {carrierLocation.speed > 0 && (
                  <p className="text-xs">Velocidade: {Math.round(carrierLocation.speed * 3.6)} km/h</p>
                )}
                {carrierLocation.accuracy && (
                  <p className="text-xs">Precisão: ~{Math.round(carrierLocation.accuracy)}m</p>
                )}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Map controls overlay */}
      <div className="absolute bottom-4 left-4 z-[1000] flex flex-col gap-2">
        <button
          onClick={() => setShouldFollow(!shouldFollow)}
          className={`p-2 rounded-lg shadow-md transition-colors ${
            shouldFollow ? 'bg-jungle text-white' : 'bg-white text-gray-700'
          }`}
          title={shouldFollow ? 'Desativar seguir transportador' : 'Seguir transportador'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      </div>

      {/* Status indicator */}
      <div className="absolute top-4 right-4 z-[1000]">
        <div className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 shadow-md ${
          isTracking ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
        }`}>
          <span className={`w-2 h-2 rounded-full ${isTracking ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
          {isTracking ? 'Rastreamento Ativo' : 'Rastreamento Inativo'}
        </div>
      </div>

      {/* Carrier info overlay */}
      {carrierLocation && (
        <div className="absolute bottom-4 right-4 z-[1000] bg-white rounded-lg shadow-md p-3 text-sm">
          <div className="flex items-center gap-2 mb-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-jungle">
              <rect width="20" height="12" x="2" y="6" rx="2"/>
              <path d="M14 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
              <circle cx="16" cy="18" r="2"/>
              <circle cx="8" cy="18" r="2"/>
            </svg>
            <span className="font-medium">Transportador</span>
          </div>
          {carrierLocation.speed > 0 && (
            <p className="text-xs text-muted-foreground">
              {Math.round(carrierLocation.speed * 3.6)} km/h
            </p>
          )}
          {carrierLocation.timestamp && (
            <p className="text-xs text-muted-foreground">
              Atualizado: {new Date(carrierLocation.timestamp).toLocaleTimeString('pt-BR')}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default LiveTrackingMap;
