import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, MapPin, Calendar, Trash, Plus } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MyTripsPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchMyTrips(); }, []);

  const fetchMyTrips = async () => {
    try {
      const res = await axios.get(`${API}/trips/my-trips`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTrips(res.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Tem certeza que deseja cancelar esta viagem?")) return;
    try {
      await axios.delete(`${API}/trips/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Viagem removida!");
      fetchMyTrips(); // Recarrega a lista
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erro ao remover");
    }
  };

  if (loading) return <div className="p-8 text-center">Carregando...</div>;

  return (
    <div className="container mx-auto px-6 py-8 min-h-screen bg-background">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-heading font-bold text-jungle-900">Minhas Viagens</h1>
        <Button onClick={() => navigate('/criar-viagem')} className="bg-jungle hover:bg-jungle-800">
          <Plus className="mr-2" /> Nova Viagem
        </Button>
      </div>

      {trips.length === 0 ? (
        <div className="text-center py-12 bg-muted/20 rounded-lg border-2 border-dashed">
          <Truck size={48} className="mx-auto text-muted-foreground mb-4" />
          <p>Você não tem viagens cadastradas.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {trips.map(trip => (
            <Card key={trip.id} className="relative">
              <CardContent className="p-6 flex flex-col md:flex-row items-center gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant={trip.status === 'published' ? 'default' : 'secondary'}>
                      {trip.status === 'published' ? 'Aguardando Match' : trip.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{new Date(trip.departure_date).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-3 text-lg font-bold">
                    <span>{trip.origin.city}</span>
                    <span className="text-muted-foreground">→</span>
                    <span>{trip.destination.city}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => navigate(`/viagens/${trip.id}`)}>
                    Ver Detalhes
                  </Button>
                  
                  {/* Botão de Excluir só aparece se estiver Publicado */}
                  {trip.status === 'published' && (
                    <Button variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => handleDelete(trip.id)}>
                      <Trash size={20} />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyTripsPage;
