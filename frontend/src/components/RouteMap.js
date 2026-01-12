import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
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
  return cityCoordinates['São Paulo'];
};

const RouteMap = ({ 
  originCity, 
  destinationCity, 
  carrierLocation = null, // Optional: current carrier GPS location [lat, lng]
  status = 'pending_payment',
  height = '300px'
}) => {
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);

  useEffect(() => {
    if (originCity) {
      setOrigin(getCoordinates(originCity));
    }
    if (destinationCity) {
      setDestination(getCoordinates(destinationCity));
    }
  }, [originCity, destinationCity]);

  if (!origin || !destination) {
    return (
      <div className="h-[300px] bg-muted rounded-lg flex items-center justify-center">
        <span className="text-muted-foreground">Carregando mapa...</span>
      </div>
    );
  }

  // Calculate center point between origin and destination
  const center = [
    (origin[0] + destination[0]) / 2,
    (origin[1] + destination[1]) / 2
  ];

  // Calculate zoom based on distance
  const latDiff = Math.abs(origin[0] - destination[0]);
  const lngDiff = Math.abs(origin[1] - destination[1]);
  const maxDiff = Math.max(latDiff, lngDiff);
  let zoom = 6;
  if (maxDiff < 1) zoom = 9;
  else if (maxDiff < 2) zoom = 8;
  else if (maxDiff < 5) zoom = 6;
  else if (maxDiff < 10) zoom = 5;
  else zoom = 4;

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
      
      {/* Origin marker */}
      <Marker position={origin} icon={greenIcon}>
        <Popup>
          <strong>Origem</strong><br />
          {originCity}
        </Popup>
      </Marker>
      
      {/* Destination marker */}
      <Marker position={destination} icon={redIcon}>
        <Popup>
          <strong>Destino</strong><br />
          {destinationCity}
        </Popup>
      </Marker>
      
      {/* Carrier location (if in transit) */}
      {carrierLocation && status === 'in_transit' && (
        <Marker position={carrierLocation} icon={blueIcon}>
          <Popup>
            <strong>Transportador</strong><br />
            Localização atual
          </Popup>
        </Marker>
      )}
      
      {/* Route line */}
      <Polyline
        positions={carrierLocation && status === 'in_transit' 
          ? [origin, carrierLocation, destination]
          : [origin, destination]
        }
        color={status === 'in_transit' ? '#0ea5e9' : '#166534'}
        weight={3}
        dashArray={status === 'in_transit' ? null : '10, 10'}
      />
    </MapContainer>
  );
};

export default RouteMap;
