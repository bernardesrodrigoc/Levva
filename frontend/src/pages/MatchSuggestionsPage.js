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
          <p className="text-muted-foreground">
            Combinações automáticas baseadas nas suas viagens e envios
          </p>
        </div>

        {suggestions.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Lightning size={48} className="mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhuma sugestão encontrada</h3>
              <p className="text-muted-foreground mb-4">
                Crie viagens ou envios para receber sugestões automáticas de combinação.
              </p>
              <div className="flex gap-4 justify-center">
                <Button onClick={() => navigate('/criar-viagem')} variant="outline">
                  Criar Viagem
                </Button>
                <Button onClick={() => navigate('/criar-envio')} className="bg-jungle hover:bg-jungle-800">
                  Criar Envio
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {suggestions.map((suggestion, index) => (
              <Card key={index} className="card-hover" data-testid={`suggestion-${index}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      {suggestion.type === 'trip_for_shipment' ? (
                        <>
                          <TruckIcon size={20} className="text-jungle" />
                          Viagem disponível para seu envio
                        </>
                      ) : (
                        <>
                          <Package size={20} className="text-lime" />
                          Envio disponível para sua viagem
                        </>
                      )}
                    </CardTitle>
                    {getScoreBadge(suggestion.match_score)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-3 gap-4">
                    {/* Route */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <MapPin size={16} className="text-jungle" />
                        <span className="font-medium">{suggestion.origin}</span>
                      </div>
                      <ArrowRight size={16} className="text-muted-foreground" />
                      <div className="flex items-center gap-1">
                        <MapPin size={16} className="text-lime" />
                        <span className="font-medium">{suggestion.destination}</span>
                      </div>
                    </div>

                    {/* User Info */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Star size={16} weight="fill" className="text-yellow-500" />
                        <span className="text-sm">
                          {suggestion.type === 'trip_for_shipment' 
                            ? `${suggestion.carrier_name} (${suggestion.carrier_rating > 0 ? suggestion.carrier_rating.toFixed(1) : 'Novo'})`
                            : `${suggestion.sender_name} (${suggestion.sender_rating > 0 ? suggestion.sender_rating.toFixed(1) : 'Novo'})`
                          }
                        </span>
                      </div>
                    </div>

                    {/* Date */}
                    <div className="flex items-center gap-2">
                      <Calendar size={16} className="text-muted-foreground" />
                      <span className="text-sm">{formatDate(suggestion.departure_time)}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {suggestion.weight_kg && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Scales size={16} />
                          <span>{suggestion.weight_kg} kg</span>
                        </div>
                      )}
                      <span className="font-bold text-jungle text-lg">
                        R$ {suggestion.estimated_price?.toFixed(2)}
                      </span>
                    </div>
                    <Button
                      onClick={() => handleCreateMatch(suggestion.trip_id, suggestion.shipment_id)}
                      disabled={creating === `${suggestion.trip_id}-${suggestion.shipment_id}`}
                      className="bg-jungle hover:bg-jungle-800"
                      data-testid={`create-match-${index}`}
                    >
                      {creating === `${suggestion.trip_id}-${suggestion.shipment_id}` 
                        ? 'Criando...' 
                        : 'Criar Combinação'
                      }
                    </Button>
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
