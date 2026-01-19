import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { DollarSign, Package, Ruler, Scale, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const PriceEstimate = ({
  originLat,
  originLng,
  destLat,
  destLng,
  originCity,
  destinationCity,
  weightKg,
  lengthCm,
  widthCm,
  heightCm,
  category,
  showBreakdown = false
}) => {
  const { token } = useAuth();
  const [priceData, setPriceData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (originLat && destLat && weightKg > 0) {
      calculatePrice();
    }
  }, [originLat, originLng, destLat, destLng, weightKg, lengthCm, widthCm, heightCm, category]);

  const calculatePrice = async () => {
    setLoading(true);
    try {
      if (token) {
        // Full calculation with authentication
        const response = await axios.post(
          `${API}/intelligence/pricing/calculate`,
          {
            origin_lat: originLat,
            origin_lng: originLng,
            dest_lat: destLat,
            dest_lng: destLng,
            origin_city: originCity || '',
            destination_city: destinationCity || '',
            weight_kg: weightKg,
            length_cm: lengthCm || 20,
            width_cm: widthCm || 20,
            height_cm: heightCm || 20,
            category: category || 'medium'
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setPriceData(response.data);
      } else {
        // Quick estimate without authentication
        const params = new URLSearchParams({
          origin_lat: originLat,
          origin_lng: originLng,
          dest_lat: destLat,
          dest_lng: destLng,
          weight_kg: weightKg
        });
        
        const response = await axios.get(`${API}/intelligence/pricing/estimate?${params}`);
        setPriceData({
          ...response.data,
          isEstimate: true
        });
      }
    } catch (error) {
      console.error('Error calculating price:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-jungle/20">
        <CardContent className="p-4 text-center">
          <DollarSign className="w-5 h-5 mx-auto animate-pulse text-jungle" />
          <p className="text-sm text-muted-foreground mt-1">Calculando preço...</p>
        </CardContent>
      </Card>
    );
  }

  if (!priceData) return null;

  if (priceData.isEstimate) {
    return (
      <Card className="border-jungle/20 bg-gradient-to-r from-jungle/5 to-transparent">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-jungle" />
              <span className="text-sm text-muted-foreground">Preço estimado:</span>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-jungle">
                R$ {priceData.estimated_min?.toFixed(2)} - R$ {priceData.estimated_max?.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">
                {priceData.distance_km}km de distância
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-jungle/20 bg-gradient-to-r from-jungle/5 to-transparent">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-jungle" />
            <span className="font-medium">Preço do Envio</span>
          </div>
          <Badge className="bg-jungle text-white text-lg px-3 py-1">
            R$ {priceData.total_price?.toFixed(2)}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          <div className="bg-muted/20 rounded-lg p-2">
            <Ruler className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
            <p className="font-medium">{priceData.distance_km}km</p>
            <p className="text-xs text-muted-foreground">Distância</p>
          </div>
          <div className="bg-muted/20 rounded-lg p-2">
            <Package className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
            <p className="font-medium">{priceData.category_name}</p>
            <p className="text-xs text-muted-foreground">Categoria</p>
          </div>
          <div className="bg-muted/20 rounded-lg p-2">
            <Scale className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
            <p className="font-medium">{weightKg}kg</p>
            <p className="text-xs text-muted-foreground">Peso</p>
          </div>
        </div>

        {showBreakdown && (
          <div className="mt-3 pt-3 border-t border-muted/30">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Você receberá:</span>
              <span className="font-medium text-green-600">R$ {priceData.carrier_earnings?.toFixed(2)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};


// Cargo category selector component
const CargoCategories = ({ selected, onSelect }) => {
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API}/intelligence/pricing/categories`);
      setCategories(response.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const getCategoryIcon = (value) => {
    const icons = {
      document: '📄',
      small: '📦',
      medium: '📬',
      large: '🏷️',
      extra_large: '🚚'
    };
    return icons[value] || '📦';
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      {categories.map((cat) => (
        <div
          key={cat.value}
          onClick={() => onSelect(cat.value)}
          className={`
            p-3 rounded-lg border cursor-pointer transition-all text-center
            ${selected === cat.value 
              ? 'border-jungle bg-jungle/10' 
              : 'border-muted hover:border-jungle/50'
            }
          `}
        >
          <span className="text-2xl">{getCategoryIcon(cat.value)}</span>
          <p className="font-medium text-sm mt-1">{cat.name}</p>
          <p className="text-xs text-muted-foreground">até {cat.max_weight_kg}kg</p>
        </div>
      ))}
    </div>
  );
};


// Trip capacity display component
const TripCapacity = ({ tripId }) => {
  const { token } = useAuth();
  const [capacity, setCapacity] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tripId && token) {
      fetchCapacity();
    }
  }, [tripId, token]);

  const fetchCapacity = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${API}/intelligence/capacity/trip/${tripId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCapacity(response.data);
    } catch (error) {
      console.error('Error fetching capacity:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !capacity) return null;

  const getUtilizationColor = (percent) => {
    if (percent >= 80) return 'text-red-500';
    if (percent >= 50) return 'text-yellow-500';
    return 'text-green-500';
  };

  return (
    <Card className="border-muted">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-medium">Capacidade da Viagem</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge className={capacity.is_full ? 'bg-red-500' : 'bg-jungle'}>
                  {capacity.combined_utilization_percent.toFixed(0)}% usado
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Peso: {capacity.weight_percent.toFixed(1)}%</p>
                <p>Volume: {capacity.volume_percent.toFixed(1)}%</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Progress bars */}
        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>Peso</span>
              <span>{capacity.used_weight_kg}/{capacity.max_weight_kg}kg</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full ${getUtilizationColor(capacity.weight_percent)} bg-current transition-all`}
                style={{ width: `${Math.min(capacity.weight_percent, 100)}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>Volume</span>
              <span>{capacity.used_volume_liters.toFixed(0)}/{capacity.max_volume_liters.toFixed(0)}L</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full ${getUtilizationColor(capacity.volume_percent)} bg-current transition-all`}
                style={{ width: `${Math.min(capacity.volume_percent, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Matched shipments */}
        {capacity.matched_shipments_count > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-2">
              {capacity.matched_shipments_count} envio(s) nesta viagem
            </p>
            <div className="space-y-1">
              {capacity.matched_shipments.map((shipment, idx) => (
                <div key={idx} className="flex justify-between text-xs bg-muted/20 rounded p-1.5">
                  <span>{shipment.description}</span>
                  <span>{shipment.weight_kg}kg / {shipment.volume_liters}L</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};


export { PriceEstimate, CargoCategories, TripCapacity };
export default PriceEstimate;
