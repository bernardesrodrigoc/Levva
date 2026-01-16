import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Trash, Plus } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MyShipmentsPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchMyShipments(); }, []);

  const fetchMyShipments = async () => {
    try {
      const res = await axios.get(`${API}/shipments/my-shipments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setShipments(res.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Tem certeza que deseja desistir deste envio?")) return;
    try {
      await axios.delete(`${API}/shipments/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Envio removido!");
      fetchMyShipments();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erro ao remover");
    }
  };

  if (loading) return <div className="p-8 text-center">Carregando...</div>;

  return (
    <div className="container mx-auto px-6 py-8 min-h-screen bg-background">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-heading font-bold text-lime-900">Meus Envios</h1>
        <Button onClick={() => navigate('/criar-envio')} className="bg-lime-600 hover:bg-lime-700 text-white">
          <Plus className="mr-2" /> Novo Envio
        </Button>
      </div>

      {shipments.length === 0 ? (
        <div className="text-center py-12 bg-muted/20 rounded-lg border-2 border-dashed">
          <Package size={48} className="mx-auto text-muted-foreground mb-4" />
          <p>Você não tem envios cadastrados.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {shipments.map(ship => (
            <Card key={ship.id}>
              <CardContent className="p-6 flex flex-col md:flex-row items-center gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={ship.status === 'published' ? 'bg-lime-100 text-lime-800' : 'bg-gray-100 text-gray-800'}>
                      {ship.status === 'published' ? 'Disponível' : ship.status}
                    </Badge>
                    <span className="font-bold">{ship.package.weight_kg} kg</span>
                  </div>
                  <div className="flex items-center gap-3 text-lg font-bold">
                    <span>{ship.origin.city}</span>
                    <span className="text-muted-foreground">→</span>
                    <span>{ship.destination.city}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{ship.package.description}</p>
                </div>

                <div className="flex gap-2">
                  {/* Botão de Excluir só aparece se estiver Publicado */}
                  {ship.status === 'published' && (
                    <Button variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => handleDelete(ship.id)}>
                      <Trash size={20} /> Desistir
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

export default MyShipmentsPage;
