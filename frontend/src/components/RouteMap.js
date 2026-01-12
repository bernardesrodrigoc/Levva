import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom icons
const createIcon = (color) => new L.Icon({
  iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const greenIcon = createIcon('green');
const redIcon = createIcon('red');
const blueIcon = createIcon('blue');
const orangeIcon = createIcon('orange');

const RouteMap = ({ 
  originCity,
  originLat,
  originLng,
  originAddress,
  destinationCity,
  destinationLat,
  destinationLng,
  destinationAddress,
  routePolyline = null,  // Real polyline from backend [[lat, lng], ...]
  corridorRadiusKm = 10,
  showCorridor = false,
  pickupLocation = null,  // {lat, lng, address} for shipment pickup
  dropoffLocation = null, // {lat, lng, address} for shipment dropoff
  carrierLocation = null, // Optional: current carrier GPS location [lat, lng]
  status = 'pending_payment',
  height = '350px'
}) => {
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);

  useEffect(() => {
    // Use provided coordinates or fall back to city lookup
    if (originLat && originLng) {
      setOrigin([originLat, originLng]);
    } else if (originCity) {
      setOrigin(getCoordinates(originCity));
    }
    
    if (destinationLat && destinationLng) {
      setDestination([destinationLat, destinationLng]);
    } else if (destinationCity) {
      setDestination(getCoordinates(destinationCity));
    }
  }, [originLat, originLng, originCity, destinationLat, destinationLng, destinationCity]);

  // Brazilian city coordinates (approximate)
  const cityCoordinates = {
    'São Paulo': [-23.5505, -46.6333],
    'Rio de Janeiro': [-22.9068, -43.1729],
    'Belo Horizonte': [-19.9167, -43.9345],
    'Brasília': [-15.7801, -47.9292],
    'Salvador': [-12.9714, -38.5014],
    'Fortaleza': [-3.7172, -38.5433],
    'Curitiba': [-25.4284, -49.2733],
    'Recife': [-8.0476, -34.8770],
    'Porto Alegre': [-30.0346, -51.2177],
    'Manaus': [-3.1190, -60.0217],
    'Campinas': [-22.9099, -47.0626],
    'Goiânia': [-16.6869, -49.2648],
    'Santos': [-23.9608, -46.3336],
    'Florianópolis': [-27.5954, -48.5480],
    'Vitória': [-20.2976, -40.2958],
    'Natal': [-5.7945, -35.2110],
    'João Pessoa': [-7.1195, -34.8450],
    'Maceió': [-9.6498, -35.7089],
    'Aracaju': [-10.9472, -37.0731],
    'Teresina': [-5.0892, -42.8019]
  };

  const getCoordinates = (city) => {
    if (!city) return [-23.5505, -46.6333];
    
    // Try to find exact match
    if (cityCoordinates[city]) {
      return cityCoordinates[city];
    }
    
    // Try to find partial match
    const cityLower = city.toLowerCase();
    for (const [name, coords] of Object.entries(cityCoordinates)) {
      if (name.toLowerCase().includes(cityLower) || cityLower.includes(name.toLowerCase())) {
        return coords;
      }
    }
    
    // Default to São Paulo if not found
    return [-23.5505, -46.6333];
  };

  if (!origin || !destination) {
    return (
      <div className="bg-muted rounded-lg flex items-center justify-center" style={{ height }}>
        <span className="text-muted-foreground">Carregando mapa...</span>
      </div>
    );
  }

  // Calculate center and zoom
  const allPoints = [origin, destination];
  if (pickupLocation?.lat) allPoints.push([pickupLocation.lat, pickupLocation.lng]);
  if (dropoffLocation?.lat) allPoints.push([dropoffLocation.lat, dropoffLocation.lng]);
  if (routePolyline?.length) allPoints.push(...routePolyline);
  
  const lats = allPoints.map(p => p[0]);
  const lngs = allPoints.map(p => p[1]);
  const center = [
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lngs) + Math.max(...lngs)) / 2
  ];

  const latDiff = Math.max(...lats) - Math.min(...lats);
  const lngDiff = Math.max(...lngs) - Math.min(...lngs);
  const maxDiff = Math.max(latDiff, lngDiff);
  let zoom = 6;
  if (maxDiff < 0.5) zoom = 11;
  else if (maxDiff < 1) zoom = 9;
  else if (maxDiff < 2) zoom = 8;
  else if (maxDiff < 5) zoom = 6;
  else if (maxDiff < 10) zoom = 5;
  else zoom = 4;

  // Use real polyline if available, otherwise straight line
  const routePath = routePolyline && routePolyline.length > 0 
    ? routePolyline 
    : [origin, destination];

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height, width: '100%', borderRadius: '0.5rem' }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      {/* Route polyline */}
      <Polyline
        positions={routePath}
        color="#166534"
        weight={4}
        opacity={0.8}
      />
      
      {/* Corridor visualization (semi-transparent circles along the route) */}
      {showCorridor && routePolyline && routePolyline.length > 0 && (
        <>
          {/* Show corridor as semi-transparent buffer - sample every 10th point */}
          {routePolyline.filter((_, i) => i % 10 === 0).map((point, idx) => (
            <Circle
              key={idx}
              center={point}
              radius={corridorRadiusKm * 1000} // Convert km to meters
              pathOptions={{
                color: '#166534',
                fillColor: '#166534',
                fillOpacity: 0.05,
                weight: 0
              }}
            />
          ))}
        </>
      )}
      
      {/* Origin marker */}
      <Marker position={origin} icon={greenIcon}>
        <Popup>
          <strong>Origem</strong><br />
          {originAddress || originCity}
        </Popup>
      </Marker>
      
      {/* Destination marker */}
      <Marker position={destination} icon={redIcon}>
        <Popup>
          <strong>Destino</strong><br />
          {destinationAddress || destinationCity}
        </Popup>
      </Marker>
      
      {/* Pickup location (for shipment) */}
      {pickupLocation?.lat && pickupLocation?.lng && (
        <Marker position={[pickupLocation.lat, pickupLocation.lng]} icon={orangeIcon}>
          <Popup>
            <strong>Coleta</strong><br />
            {pickupLocation.address || 'Ponto de coleta'}
          </Popup>
        </Marker>
      )}
      
      {/* Dropoff location (for shipment) */}
      {dropoffLocation?.lat && dropoffLocation?.lng && (
        <Marker position={[dropoffLocation.lat, dropoffLocation.lng]} icon={orangeIcon}>
          <Popup>
            <strong>Entrega</strong><br />
            {dropoffLocation.address || 'Ponto de entrega'}
          </Popup>
        </Marker>
      )}
      
      {/* Carrier location (if in transit) */}
      {carrierLocation && status === 'in_transit' && (
        <Marker position={carrierLocation} icon={blueIcon}>
          <Popup>
            <strong>Transportador</strong><br />
            Localização atual
          </Popup>
        </Marker>
      )}
    </MapContainer>
  );
};

export default RouteMap;
