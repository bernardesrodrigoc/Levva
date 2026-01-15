import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Truck, Car, Motorcycle, Bus, Plus, Trash, Info, CheckCircle, Warning, Package 
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

// Lógica de URL blindada
const getBackendUrl = () => {
  let url = process.env.REACT_APP_BACKEND_URL || '';
  if (url && !url.startsWith('http')) {
    url = `https://${url}`;
  }
  return url.replace(/\/$/, '');
};

const API = `${getBackendUrl()}/api`;

// --- Inteligência de Capacidade (Smart Defaults) ---
const VEHICLE_DEFAULTS = {
  motorcycle: { 
    label: "Moto", 
    icon: Motorcycle, 
    defaultWeight: 15, 
    defaultVolume: 45, 
    hint: "Equivalente a uma mochila grande ou baú de motoboy." 
  },
  car: { 
    label: "Carro de Passeio", 
    icon: Car, 
    defaultWeight: 50, 
    defaultVolume: 300, 
    hint: "Equivalente a um porta-malas médio (Hatch/Sedan)." 
  },
  van: { 
    label: "Van / Utilitário", 
    icon: Truck, 
    defaultWeight: 500, 
    defaultVolume: 1000, 
    hint: "Espaço de carga dedicado." 
  },
  bus_passenger: { 
    label: "Viajante de Ônibus", 
    icon: Bus, 
    defaultWeight: 23, 
    defaultVolume: 80, 
    hint: "Espaço de uma mala despachada padrão (23kg)." 
  },
  carpool_passenger: {
    label: "Passageiro em Carona",
    icon: Package,
    defaultWeight: 5,
    defaultVolume: 20,
    hint: "Levo no colo ou mochila pequena."
  }
};

const VehiclesPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Estado do Formulário
  const [newVehicle, setNewVehicle] = useState({
    type: '',
    name: '',
    license_plate: '',
    model: '',
    capacity_weight_kg: 0,
    capacity_volume_liters: 0
  });

  useEffect(() => {
    fetchVehicles();
  }, []);

  const fetchVehicles = async () => {
    try {
      // CORREÇÃO AQUI: Adicionada barra "/" no final para evitar erro 307 Redirect
      const res = await axios.get(`${API}/vehicles/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setVehicles(res.data);
    } catch (error) {
      console.error("Erro ao buscar veículos:", error);
      // Não mostra toast no load inicial para não poluir
    } finally {
      setLoading(false);
    }
  };

  const handleTypeChange = (value) => {
    const defaults = VEHICLE_DEFAULTS[value];
    // Preenche automaticamente com os valores sugeridos
    setNewVehicle(prev => ({
      ...prev,
      type: value,
      capacity_weight_kg: defaults.defaultWeight,
      capacity_volume_liters: defaults.defaultVolume
    }));
  };

  const handleSubmit = async () => {
    try {
      if (!newVehicle.type || !newVehicle.name) {
        toast.error("Preencha o tipo e o nome do veículo.");
        return;
      }

      // CORREÇÃO AQUI: Adicionada barra "/" no final para evitar erro 307 Redirect
      await axios.post(`${API}/vehicles/`, newVehicle, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success("Veículo adicionado com sucesso!");
      setIsDialogOpen(false);
      fetchVehicles();
      
      // Reset form
      setNewVehicle({ type: '', name: '', license_plate: '', model: '', capacity_weight_kg: 0, capacity_volume_liters: 0 });

    } catch (error) {
      console.error(error);
      toast.error("Erro ao adicionar: " + (error.response?.data?.detail || error.message));
    }
  };

  const handleDelete = async (id) => {
    if(!window.confirm("Tem certeza que deseja remover este veículo?")) return;
    try {
      // Aqui mantém a estrutura normal (ID já funciona como sufixo)
      await axios.delete(`${API}/vehicles/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Veículo removido");
      fetchVehicles();
    } catch (error) {
      toast.error("Erro ao remover veículo");
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl min-h-screen bg-background text-foreground">
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-jungle-900 dark:text-jungle-500">Meus Transportes</h1>
          <p className="text-muted-foreground">Gerencie como você leva as encomendas</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-jungle hover:bg-jungle-800 text-white gap-2 shadow-lg">
              <Plus size={20} /> Adicionar Novo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md bg-white dark:bg-zinc-900">
            <DialogHeader>
              <DialogTitle>Novo Método de Transporte</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {/* Passo 1: Seleção do Tipo */}
              <div>
                <Label>Como você vai transportar?</Label>
                <Select onValueChange={handleTypeChange}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione o tipo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(VEHICLE_DEFAULTS).map(([key, data]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <data.icon size={18} className="text-jungle" /> {data.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Passo 2: Informações Básicas */}
              <div>
                <Label>Apelido (Ex: Meu Carro, Viagem pra SP)</Label>
                <Input 
                  className="mt-1"
                  value={newVehicle.name}
                  onChange={e => setNewVehicle({...newVehicle, name: e.target.value})}
                  placeholder="Identifique este transporte"
                />
              </div>

              {/* Campos Condicionais para Veículos Motorizados */}
              {['car', 'motorcycle', 'van', 'truck'].includes(newVehicle.type) && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Modelo</Label>
                    <Input 
                      className="mt-1"
                      placeholder="Ex: Fiat Uno" 
                      value={newVehicle.model}
                      onChange={e => setNewVehicle({...newVehicle, model: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Placa</Label>
                    <Input 
                      className="mt-1 uppercase"
                      placeholder="ABC-1234" 
                      value={newVehicle.license_plate}
                      onChange={e => setNewVehicle({...newVehicle, license_plate: e.target.value})}
                    />
                  </div>
                </div>
              )}

              {/* Passo 3: Capacidade Inteligente */}
              {newVehicle.type && (
                <div className="bg-muted/40 p-4 rounded-lg border border-jungle/20 space-y-4">
                  <div className="flex items-center gap-2 text-jungle-700 dark:text-jungle-400">
                    <Info size={18} weight="fill" />
                    <span className="text-sm font-bold">Capacidade Estimada</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {VEHICLE_DEFAULTS[newVehicle.type].hint}
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Peso Máximo (kg)</Label>
                      <Input 
                        type="number" 
                        className="mt-1 font-bold text-jungle-800"
                        value={newVehicle.capacity_weight_kg}
                        onChange={e => setNewVehicle({...newVehicle, capacity_weight_kg: Number(e.target.value)})}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Volume (Litros)</Label>
                      <Input 
                        type="number" 
                        className="mt-1 font-bold text-jungle-800"
                        value={newVehicle.capacity_volume_liters}
                        onChange={e => setNewVehicle({...newVehicle, capacity_volume_liters: Number(e.target.value)})}
                      />
                    </div>
                  </div>
                </div>
              )}

              <Button onClick={handleSubmit} className="w-full bg-jungle hover:bg-jungle-800 text-white font-bold">
                Salvar Transporte
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Listagem de Veículos */}
      <div className="grid md:grid-cols-2 gap-4">
        {vehicles.map(v => {
          const Icon = VEHICLE_DEFAULTS[v.type]?.icon || Truck;
          return (
            <Card key={v.id} className="relative overflow-hidden border hover:shadow-md transition-shadow">
               {/* Faixa lateral indicando status */}
              <div className={`absolute top-0 left-0 w-1.5 h-full ${v.is_verified ? 'bg-green-500' : 'bg-yellow-400'}`} />
              
              <CardContent className="p-6 pl-8">
                <div className="flex justify-between items-start">
                  <div className="flex gap-4">
                    <div className="h-12 w-12 bg-jungle/10 rounded-full flex items-center justify-center text-jungle-700">
                      <Icon size={24} weight="duotone" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{v.name}</h3>
                      <p className="text-sm text-muted-foreground capitalize flex items-center gap-1">
                        {VEHICLE_DEFAULTS[v.type]?.label || v.type} 
                        {v.model && <span>• {v.model}</span>}
                      </p>
                      {v.license_plate && (
                        <Badge variant="outline" className="mt-1 font-mono text-xs border-jungle/30">
                          {v.license_plate}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(v.id)}>
                    <Trash size={18} />
                  </Button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-muted p-2 rounded text-center border">
                    <span className="block font-bold text-lg">{v.capacity_weight_kg} <span className="text-xs font-normal">kg</span></span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">Capacidade</span>
                  </div>
                  <div className="bg-muted p-2 rounded text-center border">
                    <span className="block font-bold text-lg">{v.capacity_volume_liters} <span className="text-xs font-normal">L</span></span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">Volume</span>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs pt-2 border-t">
                  {v.is_verified ? (
                    <span className="flex items-center gap-1 text-green-600 font-bold">
                      <CheckCircle size={16} weight="fill" /> Verificado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-yellow-600 font-bold">
                      <Warning size={16} weight="fill" /> Pendente
                    </span>
                  )}
                  
                  {!v.is_verified && (
                    <span className="text-muted-foreground italic">
                      Validação no 1º envio
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        
        {vehicles.length === 0 && !loading && (
          <div className="col-span-full text-center py-16 border-2 border-dashed rounded-lg bg-muted/20">
            <Truck size={64} className="mx-auto text-muted-foreground mb-4 opacity-30" />
            <h3 className="font-medium text-xl mb-2">Nenhum transporte cadastrado</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mb-6">
              Adicione um veículo ou método de viagem (como passageiro de ônibus) para começar a oferecer fretes.
            </p>
            <Button onClick={() => setIsDialogOpen(true)} variant="outline" className="border-jungle text-jungle hover:bg-jungle/10">
              Cadastrar Agora
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VehiclesPage;
