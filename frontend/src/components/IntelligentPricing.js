import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { DollarSign, Package, Ruler, Scale, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

/**
 * PriceEstimate - Displays price ESTIMATE (Phase A - UX only)
 * 
 * IMPORTANT: This component shows NON-BINDING estimates.
 * The actual price is calculated at shipment creation time
 * and stored in shipment.price (immutable).
 * 
 * PRICING ARCHITECTURE:
 * - Frontend NEVER calculates final prices
 * - This component calls /api/pricing/estimate for display
 * - Post-creation, all screens use shipment.price.final_price
 */
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
  transporterPricePerKm,
  showBreakdown = false
}) => {
  const { token } = useAuth();
  const [priceData, setPriceData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  // REACTIVE EFFECT - Fetches estimate whenever inputs change
  useEffect(() => {
    // Parse all values to ensure consistent comparison
    const oLat = parseFloat(originLat);
    const oLng = parseFloat(originLng);
    const dLat = parseFloat(destLat);
    const dLng = parseFloat(destLng);
    const weight = parseFloat(weightKg) || 0;

    // Validate required fields
    const hasValidLocation = !isNaN(oLat) && !isNaN(oLng) && !isNaN(dLat) && !isNaN(dLng) 
                            && oLat !== 0 && dLat !== 0;
    const hasValidWeight = weight > 0;

    if (!hasValidLocation || !hasValidWeight) {
      setPriceData(null);
      return;
    }

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Debounced price estimate request
    const timeoutId = setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        // Use the NEW unified pricing endpoint
        const response = await axios.post(
          `${API}/pricing/estimate`,
          {
            origin_lat: oLat,
            origin_lng: oLng,
            dest_lat: dLat,
            dest_lng: dLng,
            weight_kg: weight
          },
          { signal }
        );
        
        setPriceData({
          total_price: response.data.estimated_avg,
          estimated_min: response.data.estimated_min,
          estimated_max: response.data.estimated_max,
          distance_km: response.data.distance_km,
          isEstimate: true,
          disclaimer: response.data.disclaimer
        });
      } catch (err) {
        // Ignore abort errors
        if (err.name === 'CanceledError' || err.name === 'AbortError') {
          return;
        }
        console.error('Error fetching price estimate:', err);
        setError('Erro ao calcular estimativa');
        setPriceData(null);
      } finally {
        setLoading(false);
      }
    }, 400);

    // Cleanup: cancel timeout and abort request on unmount or dependency change
    return () => {
      clearTimeout(timeoutId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [originLat, originLng, destLat, destLng, weightKg]);

  // Loading state
  if (loading) {
    return (
      <Card className="border-jungle/20" data-testid="price-loading">
        <CardContent className="p-4 text-center">
          <DollarSign className="w-5 h-5 mx-auto animate-pulse text-jungle" />
          <p className="text-sm text-muted-foreground mt-1">Calculando preço...</p>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-red-200 bg-red-50" data-testid="price-error">
        <CardContent className="p-4 text-center text-red-600 text-sm">
          {error}
        </CardContent>
      </Card>
    );
  }

  // No data yet
  if (!priceData) return null;

  // Estimate view (always shows range now)
  if (priceData.isEstimate) {
    return (
      <Card className="border-jungle/20 bg-gradient-to-r from-jungle/5 to-transparent" data-testid="price-estimate">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-jungle" />
              <span className="text-sm font-medium">Estimativa de Preço</span>
            </div>
            <Badge variant="outline" className="text-jungle border-jungle/30 text-xs">
              {priceData.distance_km?.toFixed(0)}km
            </Badge>
          </div>
          
          <div className="text-center py-2">
            <p className="text-2xl font-bold text-jungle" data-testid="total-price">
              R$ {priceData.estimated_min?.toFixed(2)} - R$ {priceData.estimated_max?.toFixed(2)}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Média: R$ {priceData.total_price?.toFixed(2)}
            </p>
          </div>
          
          <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-xs text-yellow-700">
              <Info className="w-3 h-3 inline mr-1" />
              {priceData.disclaimer || "O preço final será calculado ao criar o envio."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Full price view (legacy - shouldn't be reached with new architecture)
  return (
    <Card className="border-jungle/20 bg-gradient-to-r from-jungle/5 to-lime/5" data-testid="price-calculated">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-jungle" />
            <span className="font-medium">Preço Calculado</span>
          </div>
          <Badge variant="outline" className="text-jungle border-jungle/30">
            {priceData.distance_km?.toFixed(0)}km
          </Badge>
        </div>

        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold text-jungle" data-testid="total-price">
              R$ {priceData.total_price?.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Transportador recebe: R$ {priceData.carrier_earnings?.toFixed(2)}
            </p>
          </div>

          {showBreakdown && priceData._breakdown && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-4 h-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <div className="text-xs space-y-1">
                    <p>Base: R$ {priceData._breakdown.base_distance_price?.toFixed(2)}</p>
                    <p>Categoria: {priceData._breakdown.category_name} (x{priceData._breakdown.category_multiplier})</p>
                    <p>Peso: {priceData._breakdown.weight_kg}kg (x{priceData._breakdown.weight_factor?.toFixed(2)})</p>
                    <p>Taxa plataforma: {(priceData._breakdown.commission_rate * 100).toFixed(0)}%</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Package info summary */}
        <div className="flex gap-4 mt-3 pt-3 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Scale className="w-3 h-3" />
            <span>{parseFloat(weightKg) || 1}kg</span>
          </div>
          <div className="flex items-center gap-1">
            <Ruler className="w-3 h-3" />
            <span>{parseFloat(lengthCm) || 20}x{parseFloat(widthCm) || 20}x{parseFloat(heightCm) || 20}cm</span>
          </div>
          {category && (
            <div className="flex items-center gap-1">
              <Package className="w-3 h-3" />
              <span className="capitalize">{category}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * CargoCategories - Category selector with price hints
 */
const CargoCategories = ({ value, onChange }) => {
  const categories = [
    { value: 'document', label: 'Documento', description: 'Envelopes, papéis', multiplier: 0.8 },
    { value: 'small', label: 'Pequeno', description: 'Até 5kg, 30x30x30cm', multiplier: 0.9 },
    { value: 'medium', label: 'Médio', description: '5-15kg, 50x50x50cm', multiplier: 1.0 },
    { value: 'large', label: 'Grande', description: '15-30kg, 80x80x80cm', multiplier: 1.3 },
    { value: 'extra_large', label: 'Extra Grande', description: '30-50kg, 100x100x100cm', multiplier: 1.5 }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      {categories.map((cat) => (
        <button
          key={cat.value}
          type="button"
          onClick={() => onChange(cat.value)}
          className={`p-3 rounded-lg border text-left transition-all ${
            value === cat.value
              ? 'border-jungle bg-jungle/10 ring-1 ring-jungle'
              : 'border-gray-200 hover:border-jungle/50'
          }`}
          data-testid={`category-${cat.value}`}
        >
          <p className="font-medium text-sm">{cat.label}</p>
          <p className="text-xs text-muted-foreground">{cat.description}</p>
          {cat.multiplier !== 1.0 && (
            <Badge variant="outline" className="mt-1 text-xs">
              {cat.multiplier < 1 ? `-${((1 - cat.multiplier) * 100).toFixed(0)}%` : `+${((cat.multiplier - 1) * 100).toFixed(0)}%`}
            </Badge>
          )}
        </button>
      ))}
    </div>
  );
};

export { PriceEstimate, CargoCategories };
