import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, TruckIcon, Star, Lightning, MapPin, Calendar, Scales, ArrowRight } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const MatchSuggestionsPage = () => {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(null);

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const fetchSuggestions = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${API}/matches/suggestions`, { headers });
      setSuggestions(response.data);
    } catch (error) {
      toast.error('Erro ao carregar sugestões');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMatch = async (tripId, shipmentId) => {
    setCreating(`${tripId}-${shipmentId}`);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.post(
        `${API}/matches/create?trip_id=${tripId}&shipment_id=${shipmentId}`,
        {},
        { headers }
      );
      
      toast.success('Combinação criada com sucesso!');
      navigate(`/match/${response.data.id}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao criar combinação');
    } finally {
      setCreating(null);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Data não definida';
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getScoreBadge = (score) => {
    if (score >= 80) return <Badge className="bg-green-100 text-green-700">Excelente</Badge>;
    if (score >= 60) return <Badge className="bg-blue-100 text-blue-700">Bom</Badge>;
    return <Badge className="bg-yellow-100 text-yellow-700">Regular</Badge>;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 md:h-12 md:w-12 border-b-2 border-jungle"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      {/* Header - Mobile Optimized */}
      <header className="glass border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={28} weight="duotone" className="text-jungle" />
            <span className="text-xl md:text-2xl font-heading font-bold text-jungle">Levva</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} data-testid="back-btn">
            Voltar
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 md:px-6 py-4 md:py-8 max-w-4xl">
        {/* Title - Mobile Optimized */}
        <div className="mb-4 md:mb-8">
          <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-2">
            <Lightning size={24} weight="duotone" className="text-jungle" />
            <h1 className="text-xl md:text-3xl font-heading font-bold">Sugestões Inteligentes</h1>
          </div>
          <p className="text-sm md:text-base text-muted-foreground">
            Combinações automáticas baseadas nas suas viagens e envios
          </p>
        </div>

        {suggestions.length === 0 ? (
          <Card className="text-center py-10 md:py-12">
            <CardContent>
              <Lightning size={40} className="mx-auto text-muted-foreground mb-3 md:mb-4" />
              <h3 className="text-base md:text-lg font-semibold mb-1 md:mb-2">Nenhuma sugestão encontrada</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Crie viagens ou envios para receber sugestões.
              </p>
              <div className="flex flex-col md:flex-row gap-2 md:gap-4 justify-center">
                <Button onClick={() => navigate('/criar-viagem')} variant="outline" size="sm" className="md:size-default">
                  Criar Viagem
                </Button>
                <Button onClick={() => navigate('/criar-envio')} className="bg-jungle hover:bg-jungle-800" size="sm">
                  Criar Envio
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3 md:space-y-4">
            {suggestions.map((suggestion, index) => (
              <Card key={index} className="card-hover" data-testid={`suggestion-${index}`}>
                <CardHeader className="p-4 md:p-6 pb-2">
                  <div className="flex items-start md:items-center justify-between gap-2">
                    <CardTitle className="text-sm md:text-base flex items-center gap-1.5 md:gap-2">
                      {suggestion.type === 'trip_for_shipment' ? (
                        <>
                          <TruckIcon size={18} className="text-jungle flex-shrink-0" />
                          <span className="line-clamp-1">Viagem para seu envio</span>
                        </>
                      ) : (
                        <>
                          <Package size={18} className="text-lime flex-shrink-0" />
                          <span className="line-clamp-1">Envio para sua viagem</span>
                        </>
                      )}
                    </CardTitle>
                    {getScoreBadge(suggestion.match_score)}
                  </div>
                </CardHeader>
                <CardContent className="p-4 md:p-6 pt-2">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                    {/* Route - Mobile Optimized */}
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <div className="flex items-center gap-1">
                        <MapPin size={14} className="text-jungle" />
                        <span className="font-medium text-sm">{suggestion.origin}</span>
                      </div>
                      <ArrowRight size={14} className="text-muted-foreground" />
                      <div className="flex items-center gap-1">
                        <MapPin size={14} className="text-lime" />
                        <span className="font-medium text-sm">{suggestion.destination}</span>
                      </div>
                    </div>

                    {/* User Info */}
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <Star size={14} weight="fill" className="text-yellow-500" />
                      <span className="text-xs md:text-sm">
                        {suggestion.type === 'trip_for_shipment' 
                          ? `${suggestion.carrier_name} (${suggestion.carrier_rating > 0 ? suggestion.carrier_rating.toFixed(1) : 'Novo'})`
                          : `${suggestion.sender_name} (${suggestion.sender_rating > 0 ? suggestion.sender_rating.toFixed(1) : 'Novo'})`
                        }
                      </span>
                    </div>

                    {/* Date */}
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <Calendar size={14} className="text-muted-foreground" />
                      <span className="text-xs md:text-sm">{formatDate(suggestion.departure_date)}</span>
                    </div>
                  </div>

                  {/* Footer - Mobile Optimized */}
                  <div className="mt-3 md:mt-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-4 pt-3 border-t md:border-0 md:pt-0">
                    <div className="flex flex-wrap items-center gap-3 md:gap-4">
                      {suggestion.weight_kg && (
                        <div className="flex items-center gap-1 text-xs md:text-sm text-muted-foreground">
                          <Scales size={14} />
                          <span>{suggestion.weight_kg} kg</span>
                        </div>
                      )}
                      {/* Capacity info */}
                      {suggestion.trip_capacity_used_percent !== undefined && (
                        <div className="flex items-center gap-1 text-xs md:text-sm">
                          <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${suggestion.trip_capacity_used_percent >= 80 ? 'bg-red-500' : suggestion.trip_capacity_used_percent >= 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                              style={{ width: `${Math.min(suggestion.trip_capacity_used_percent, 100)}%` }}
                            />
                          </div>
                          <span className="text-muted-foreground">
                            {suggestion.trip_available_weight_kg?.toFixed(0)}kg disp.
                          </span>
                        </div>
                      )}
                      <span className="font-bold text-jungle text-base md:text-lg">
                        R$ {suggestion.estimated_price?.toFixed(2)}
                      </span>
                      {suggestion.carrier_earnings && (
                        <span className="text-xs text-muted-foreground">
                          (ganho: R$ {suggestion.carrier_earnings?.toFixed(2)})
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                      <Button
                        variant="outline"
                        onClick={() => {
                          const detailUrl = suggestion.type === 'trip_for_shipment' 
                            ? `/trip/${suggestion.trip_id}`
                            : `/shipment/${suggestion.shipment_id}`;
                          navigate(detailUrl);
                        }}
                        className="flex-1 md:flex-none h-10 text-sm border-jungle text-jungle hover:bg-jungle/10"
                        data-testid={`view-details-${index}`}
                      >
                        Ver Detalhes
                      </Button>
                      <Button
                        onClick={() => handleCreateMatch(suggestion.trip_id, suggestion.shipment_id)}
                        disabled={creating === `${suggestion.trip_id}-${suggestion.shipment_id}`}
                        className="bg-jungle hover:bg-jungle-800 flex-1 md:flex-none h-10 text-sm"
                        data-testid={`create-match-${index}`}
                      >
                        {creating === `${suggestion.trip_id}-${suggestion.shipment_id}` 
                          ? 'Criando...' 
                          : 'Criar Combinação'
                        }
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchSuggestionsPage;
