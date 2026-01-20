import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Truck, Star, MapPin, Calendar, Package, ChevronRight, Route } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

/**
 * MatchingTrips Component
 * 
 * Displays trips that match a shipment based on GEOSPATIAL criteria.
 * Uses coordinates as the primary matching criterion, not city names.
 * 
 * Matching logic:
 * - Shipment coordinates within trip's corridor radius
 * - Trip has sufficient capacity
 * - Trip departs within the date range
 */
const MatchingTrips = ({ 
  originLat, 
  originLng, 
  destLat, 
  destLng,
  weightKg = 1.0,
  onSelectTrip,
  showDetails = true
}) => {
  const { token } = useAuth();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchMatchingTrips = async () => {
    if (!token || !originLat || !originLng || !destLat || !destLng) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.post(
        `${API}/intelligence/suggestions/matching-trips`,
        {
          origin_lat: parseFloat(originLat),
          origin_lng: parseFloat(originLng),
          dest_lat: parseFloat(destLat),
          dest_lng: parseFloat(destLng),
          weight_kg: parseFloat(weightKg) || 1.0,
          days_ahead: 14
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setTrips(response.data.trips || []);
    } catch (err) {
      console.error('Error fetching matching trips:', err);
      setError('Não foi possível buscar viagens compatíveis');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatchingTrips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originLat, originLng, destLat, destLng, weightKg, token]);

  const formatDate = (dateString) => {
    if (!dateString) return 'Data não definida';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { 
      weekday: 'short', 
      day: '2-digit', 
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getMatchScoreColor = (score) => {
    if (score >= 70) return 'bg-green-100 text-green-700 border-green-200';
    if (score >= 40) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    return 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const getMatchScoreLabel = (score) => {
    if (score >= 70) return 'Excelente';
    if (score >= 40) return 'Bom';
    return 'Possível';
  };

  // Don't render if no coordinates
  if (!originLat || !originLng || !destLat || !destLng) return null;

  if (loading) {
    return (
      <Card className="border-dashed border-jungle/30" data-testid="matching-trips-loading">
        <CardContent className="p-6 text-center">
          <Truck className="w-8 h-8 mx-auto mb-3 text-jungle animate-pulse" />
          <p className="text-muted-foreground">Buscando transportadores compatíveis...</p>
          <p className="text-xs text-muted-foreground mt-1">Analisando rotas por proximidade geográfica</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50" data-testid="matching-trips-error">
        <CardContent className="p-4 text-center text-red-600 text-sm">
          {error}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-jungle/20" data-testid="matching-trips-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Route className="w-5 h-5 text-jungle" />
          Viagens Compatíveis
          {trips.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {trips.length} encontrada{trips.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="text-xs">
          Transportadores cuja rota passa próximo aos seus pontos de coleta e entrega
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {trips.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhuma viagem compatível no momento</p>
            <p className="text-xs mt-1">
              Publique seu envio e transportadores serão notificados quando houver rotas compatíveis
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {trips.slice(0, 5).map((trip, idx) => (
              <div
                key={trip.trip_id || idx}
                className="p-3 rounded-lg border hover:border-jungle/50 cursor-pointer transition-all hover:shadow-sm"
                onClick={() => onSelectTrip?.(trip)}
                data-testid={`matching-trip-${idx}`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Trip Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm truncate">
                        {trip.carrier_name}
                      </span>
                      {trip.carrier_rating > 0 && (
                        <div className="flex items-center gap-0.5 text-yellow-500">
                          <Star className="w-3 h-3 fill-current" />
                          <span className="text-xs">{trip.carrier_rating.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate">
                        {trip.origin_city} → {trip.destination_city}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        <span>{formatDate(trip.departure_date)}</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Package className="w-3 h-3" />
                        <span>{trip.available_capacity_kg}kg disponível</span>
                      </div>
                    </div>

                    {/* Match Details */}
                    {showDetails && trip.match_details && (
                      <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
                        <span className="font-medium">Desvio da rota:</span>{' '}
                        {trip.match_details.total_deviation_km.toFixed(1)}km
                        <span className="mx-2">•</span>
                        <span className="font-medium">Raio:</span>{' '}
                        {trip.corridor_radius_km}km
                      </div>
                    )}
                  </div>

                  {/* Match Score */}
                  <div className="flex flex-col items-end gap-1">
                    <Badge 
                      variant="outline" 
                      className={`${getMatchScoreColor(trip.match_score)} text-xs`}
                    >
                      {getMatchScoreLabel(trip.match_score)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {trip.match_score.toFixed(0)}% match
                    </span>
                    {trip.price_per_kg && (
                      <span className="text-xs font-medium text-jungle">
                        R$ {trip.price_per_kg.toFixed(2)}/kg
                      </span>
                    )}
                  </div>
                </div>

                {/* Action hint */}
                <div className="flex items-center justify-end mt-2 text-xs text-jungle">
                  <span>Ver detalhes</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            ))}

            {trips.length > 5 && (
              <p className="text-center text-xs text-muted-foreground pt-2">
                +{trips.length - 5} outras viagens compatíveis
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MatchingTrips;
