import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, MagnifyingGlass, X, Crosshair } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';

// Fix for default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom draggable marker icon
const createCustomIcon = (color) => new L.Icon({
  iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Nominatim API for geocoding (free, no API key needed)
const searchAddress = async (query) => {
  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: `${query}, Brasil`,
        format: 'json',
        addressdetails: 1,
        limit: 5
      },
      headers: {
        'User-Agent': 'LevvaApp/1.0'
      }
    });
    return response.data.map(item => ({
      display_name: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      city: item.address?.city || item.address?.town || item.address?.village || '',
      state: item.address?.state || ''
    }));
  } catch (error) {
    console.error('Geocoding error:', error);
    return [];
  }
};

// Reverse geocoding
const reverseGeocode = async (lat, lng) => {
  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: {
        lat,
        lon: lng,
        format: 'json',
        addressdetails: 1
      },
      headers: {
        'User-Agent': 'LevvaApp/1.0'
      }
    });
    const data = response.data;
    return {
      display_name: data.display_name,
      city: data.address?.city || data.address?.town || data.address?.village || '',
      state: data.address?.state || '',
      address: `${data.address?.road || ''} ${data.address?.house_number || ''}`.trim() || data.display_name.split(',')[0]
    };
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
};

// Map click handler component
const MapClickHandler = ({ onLocationSelect }) => {
  useMapEvents({
    click: async (e) => {
      const { lat, lng } = e.latlng;
      const geoData = await reverseGeocode(lat, lng);
      onLocationSelect({
        lat,
        lng,
        city: geoData?.city || '',
        state: geoData?.state || '',
        address: geoData?.address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`
      });
    }
  });
  return null;
};

// Component to recenter map
const MapRecenter = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, 14);
    }
  }, [center, map]);
  return null;
};

const LocationPicker = ({ 
  label, 
  value, 
  onChange, 
  markerColor = 'blue',
  placeholder = 'Buscar endereço...',
  testIdPrefix = 'location'
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [mapCenter, setMapCenter] = useState([-23.5505, -46.6333]); // São Paulo default
  const searchTimeout = useRef(null);
  const resultsRef = useRef(null);

  // Update map center when value changes
  useEffect(() => {
    if (value?.lat && value?.lng) {
      setMapCenter([value.lat, value.lng]);
    }
  }, [value?.lat, value?.lng]);

  // Debounced search
  const handleSearchChange = useCallback((query) => {
    setSearchQuery(query);
    
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }
    
    if (query.length < 3) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    
    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      const results = await searchAddress(query);
      setSearchResults(results);
      setShowResults(true);
      setIsSearching(false);
    }, 500);
  }, []);

  const handleResultSelect = (result) => {
    onChange({
      lat: result.lat,
      lng: result.lng,
      city: result.city,
      state: result.state,
      address: result.display_name.split(',').slice(0, 2).join(',')
    });
    setSearchQuery(result.display_name.split(',').slice(0, 2).join(','));
    setShowResults(false);
    setMapCenter([result.lat, result.lng]);
  };

  const handleMapLocationSelect = (location) => {
    onChange(location);
    setSearchQuery(location.address);
  };

  const handleMarkerDrag = async (e) => {
    const { lat, lng } = e.target.getLatLng();
    const geoData = await reverseGeocode(lat, lng);
    const location = {
      lat,
      lng,
      city: geoData?.city || '',
      state: geoData?.state || '',
      address: geoData?.address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    };
    onChange(location);
    setSearchQuery(location.address);
  };

  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState(null);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocalização não suportada neste navegador');
      return;
    }
    
    setGeoLoading(true);
    setGeoError(null);
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const geoData = await reverseGeocode(latitude, longitude);
          const location = {
            lat: latitude,
            lng: longitude,
            city: geoData?.city || '',
            state: geoData?.state || '',
            address: geoData?.address || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
          };
          onChange(location);
          setSearchQuery(location.address);
          setMapCenter([latitude, longitude]);
          setGeoError(null);
        } catch (err) {
          setGeoError('Erro ao buscar endereço. Tente novamente.');
        } finally {
          setGeoLoading(false);
        }
      },
      (error) => {
        setGeoLoading(false);
        console.error('Geolocation error:', error);
        
        // User-friendly error messages
        switch(error.code) {
          case error.PERMISSION_DENIED:
            setGeoError('Permissão de localização negada. Clique no ícone de cadeado na barra de endereço para permitir.');
            break;
          case error.POSITION_UNAVAILABLE:
            setGeoError('Localização indisponível. Verifique se o GPS está ativado.');
            break;
          case error.TIMEOUT:
            setGeoError('Tempo esgotado ao buscar localização. Tente novamente.');
            break;
          default:
            setGeoError('Erro ao obter localização. Use a busca por endereço.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (resultsRef.current && !resultsRef.current.contains(event.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2">
        <MapPin size={18} className="text-jungle" />
        {label}
      </Label>
      
      {/* Search Input */}
      <div className="relative" ref={resultsRef}>
        <div className="relative">
          <MagnifyingGlass 
            size={18} 
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" 
          />
          <Input
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={placeholder}
            className="pl-10 pr-20 h-12"
            data-testid={`${testIdPrefix}-search`}
          />
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex gap-1">
            {searchQuery && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                }}
              >
                <X size={16} />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handleUseCurrentLocation}
              title="Usar localização atual"
            >
              <Crosshair size={16} />
            </Button>
          </div>
        </div>
        
        {/* Search Results Dropdown */}
        {showResults && searchResults.length > 0 && (
          <Card className="absolute z-50 w-full mt-1 max-h-60 overflow-auto">
            <CardContent className="p-0">
              {searchResults.map((result, index) => (
                <div
                  key={index}
                  className="px-4 py-3 hover:bg-muted cursor-pointer border-b last:border-b-0"
                  onClick={() => handleResultSelect(result)}
                  data-testid={`${testIdPrefix}-result-${index}`}
                >
                  <p className="text-sm font-medium truncate">{result.display_name.split(',').slice(0, 2).join(',')}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {result.city && `${result.city}, `}{result.state}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        
        {isSearching && (
          <div className="absolute z-50 w-full mt-1 bg-background border rounded-md p-3 text-center text-sm text-muted-foreground">
            Buscando...
          </div>
        )}
      </div>

      {/* Map */}
      <div className="rounded-lg overflow-hidden border" style={{ height: '250px' }}>
        <MapContainer
          center={mapCenter}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onLocationSelect={handleMapLocationSelect} />
          <MapRecenter center={value?.lat && value?.lng ? [value.lat, value.lng] : null} />
          
          {value?.lat && value?.lng && (
            <Marker
              position={[value.lat, value.lng]}
              icon={createCustomIcon(markerColor)}
              draggable={true}
              eventHandlers={{
                dragend: handleMarkerDrag
              }}
            />
          )}
        </MapContainer>
      </div>

      {/* Selected Location Display */}
      {value?.lat && value?.lng && (
        <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
          <p className="font-medium text-foreground">{value.address || 'Localização selecionada'}</p>
          <p>
            {value.city && `${value.city}, `}
            {value.state && `${value.state} • `}
            <span className="font-mono text-xs">{value.lat.toFixed(6)}, {value.lng.toFixed(6)}</span>
          </p>
        </div>
      )}
    </div>
  );
};

export default LocationPicker;
