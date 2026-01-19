import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Calendar, MapPin, Clock, TrendingUp, Lightbulb } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const SmartSuggestions = ({ 
  originCity, 
  destinationCity, 
  originLat, 
  originLng, 
  destLat, 
  destLng,
  isShipment = true,
  onSelectDate,
  onSelectOriginLocation,
  onSelectDestLocation,
  compact = false
}) => {
  const { token } = useAuth();
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('dates');

  useEffect(() => {
    if (originCity && destinationCity && originLat && originLng) {
      fetchSuggestions();
    }
  }, [originCity, destinationCity, originLat, originLng, destLat, destLng]);

  const fetchSuggestions = async () => {
    if (!token) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams({
        origin_city: originCity,
        destination_city: destinationCity,
        origin_lat: originLat,
        origin_lng: originLng,
        dest_lat: destLat || originLat,
        dest_lng: destLng || originLng,
        is_shipment: isShipment
      });

      const response = await axios.post(
        `${API}/intelligence/suggestions/comprehensive?${params}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setSuggestions(response.data);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!originCity || !destinationCity) return null;

  if (loading) {
    return (
      <Card className="border-dashed border-jungle/30">
        <CardContent className="p-4 text-center text-muted-foreground">
          <Lightbulb className="w-5 h-5 mx-auto mb-2 animate-pulse" />
          Analisando melhores opções...
        </CardContent>
      </Card>
    );
  }

  if (!suggestions) return null;

  const getRecommendationColor = (level) => {
    const colors = {
      alta: 'bg-green-100 text-green-700',
      média: 'bg-yellow-100 text-yellow-700',
      baixa: 'bg-gray-100 text-gray-700'
    };
    return colors[level] || colors.baixa;
  };

  if (compact) {
    // Compact version - just show best recommendation
    const best = suggestions.best_recommendation;
    if (!best?.date && !best?.origin) return null;

    return (
      <Card className="border-jungle/20 bg-jungle/5">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-sm">
            <Lightbulb className="w-4 h-4 text-jungle" />
            <span className="font-medium text-jungle">Sugestão Inteligente:</span>
          </div>
          {best.date && (
            <p className="text-sm mt-1">
              📅 Melhor data: <strong>{best.date.day_name}</strong> - {best.date.availability}
            </p>
          )}
          {best.origin && (
            <p className="text-sm mt-1">
              📍 Coleta sugerida: <strong>{best.origin.name}</strong> ({best.origin.distance_km}km)
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-jungle/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-jungle" />
          Sugestões Inteligentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Tabs */}
        <div className="flex gap-1 mb-3">
          <Button
            variant={activeTab === 'dates' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('dates')}
            className={activeTab === 'dates' ? 'bg-jungle' : ''}
          >
            <Calendar className="w-4 h-4 mr-1" />
            Datas
          </Button>
          <Button
            variant={activeTab === 'locations' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('locations')}
            className={activeTab === 'locations' ? 'bg-jungle' : ''}
          >
            <MapPin className="w-4 h-4 mr-1" />
            Locais
          </Button>
          <Button
            variant={activeTab === 'times' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('times')}
            className={activeTab === 'times' ? 'bg-jungle' : ''}
          >
            <Clock className="w-4 h-4 mr-1" />
            Horários
          </Button>
        </div>

        {/* Date Suggestions */}
        {activeTab === 'dates' && suggestions.dates && (
          <div className="space-y-2">
            {suggestions.dates.slice(0, 5).map((date, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 rounded-lg border hover:border-jungle/50 cursor-pointer transition-colors"
                onClick={() => onSelectDate?.(date.date)}
              >
                <div className="flex items-center gap-3">
                  <div className="text-center min-w-[50px]">
                    <p className="text-xs text-muted-foreground">{date.day_name}</p>
                    <p className="font-semibold">{new Date(date.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</p>
                  </div>
                  <div>
                    <Badge className={getRecommendationColor(date.recommendation_level)}>
                      {date.recommendation_level}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">{date.availability}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    <span className="text-sm font-medium">{date.match_probability_score}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Location Suggestions */}
        {activeTab === 'locations' && (
          <div className="space-y-3">
            {suggestions.origin_locations?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">📤 Locais de Coleta</p>
                {suggestions.origin_locations.slice(0, 3).map((loc, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg border hover:border-jungle/50 cursor-pointer transition-colors mb-1"
                    onClick={() => onSelectOriginLocation?.(loc)}
                  >
                    <div>
                      <p className="font-medium text-sm">{loc.name}</p>
                      <p className="text-xs text-muted-foreground">{loc.reason}</p>
                    </div>
                    <Badge variant="outline">{loc.distance_km}km</Badge>
                  </div>
                ))}
              </div>
            )}

            {suggestions.destination_locations?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">📥 Locais de Entrega</p>
                {suggestions.destination_locations.slice(0, 3).map((loc, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg border hover:border-jungle/50 cursor-pointer transition-colors mb-1"
                    onClick={() => onSelectDestLocation?.(loc)}
                  >
                    <div>
                      <p className="font-medium text-sm">{loc.name}</p>
                      <p className="text-xs text-muted-foreground">{loc.reason}</p>
                    </div>
                    <Badge variant="outline">{loc.distance_km}km</Badge>
                  </div>
                ))}
              </div>
            )}

            {!suggestions.origin_locations?.length && !suggestions.destination_locations?.length && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma sugestão de local disponível para esta rota.
              </p>
            )}
          </div>
        )}

        {/* Time Slot Suggestions */}
        {activeTab === 'times' && suggestions.time_slots && (
          <div className="grid grid-cols-2 gap-2">
            {suggestions.time_slots.map((slot, idx) => (
              <div
                key={idx}
                className="p-2 rounded-lg border text-center"
              >
                <p className="font-medium text-sm">{slot.name}</p>
                <Badge className={getRecommendationColor(slot.recommendation)}>
                  {slot.available_trips} viagem(ns)
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SmartSuggestions;
