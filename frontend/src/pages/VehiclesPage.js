import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Truck, Car, Motorcycle, Bus, Plus, Trash, Info, CheckCircle, Warning 
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider'; // Se não tiver slider, use input number
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL; // Lembre da lógica do https:// se precisar
const API = `${BACKEND_URL}/api`;

// --- Requirement #2: Smart Capacity Data ---
const VEHICLE_DEFAULTS = {
  motorcycle: { 
    label: "Moto", 
    icon: Motorcycle, 
    defaultWeight: 15, 
    defaultVolume: 45, 
    hint: "Equivalente a uma mochila grande ou baú padrão." 
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
    hint: "Espaço de uma mala despachada padrão." 
  }
};

const VehiclesPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Form State
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
      const res = await axios.get(`${API}/vehicles`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setVehicles(res.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // --- Smart Suggestion Logic ---
  const handleTypeChange = (value) => {
    const defaults = VEHICLE_DEFAULTS[value];
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

      await axios.post(`${API}/vehicles`, newVehicle, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success("Veículo adicionado!");
      setIsDialogOpen(false);
      fetchVehicles();
      
      // Reset form
      setNewVehicle({ type: '', name: '', license_plate: '', model: '', capacity_weight_kg: 0, capacity_volume_liters: 0 });

    } catch (error) {
      toast.error("Erro ao adicionar: " + (error.response?.data?.detail || error.message));
    }
  };

  const handleDelete = async (id) => {
    if(!window.confirm("Remover este veículo?")) return;
    try {
      await axios.delete(`${API}/vehicles/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Veículo removido");
      fetchVehicles();
    } catch (error) {
      toast.error("Erro ao remover");
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-jungle-900">Meus Transportes</h1>
          <p className="text-muted-foreground">Gerencie como você leva as encomendas</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-jungle hover:bg-jungle-800 text-white gap-2">
              <Plus size={20} /> Adicionar Novo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Novo Método de Transporte</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {/* Step 1: Type Selection */}
              <div>
                <Label>Como você vai transportar?</Label>
                <Select onValueChange={handleTypeChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(VEHICLE_DEFAULTS).map(([key, data]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <data.icon size={16} /> {data.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Step 2: Basic Info */}
              <div>
                <Label>Apelido (Ex: Meu Carro, Viagem pra SP)</Label>
                <Input 
                  value={newVehicle.name}
                  onChange={e => setNewVehicle({...newVehicle, name: e.target.value})}
                  placeholder="Identifique este transporte"
                />
              </div>

              {/* Conditional Inputs for Motor Vehicles */}
              {['car', 'motorcycle', 'van', 'truck'].includes(newVehicle.type) && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Modelo</Label>
                    <Input 
                      placeholder="Ex: Fiat Uno" 
                      value={newVehicle.model}
                      onChange={e => setNewVehicle({...newVehicle, model: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Placa</Label>
                    <Input 
                      placeholder="ABC-1234" 
                      className="uppercase"
                      value={newVehicle.license_plate}
                      onChange={e => setNewVehicle({...newVehicle, license_plate: e.target.value})}
                    />
                  </div>
                </div>
              )}

              {/* Step 3: Smart Capacity (Sliders/Inputs) */}
              {newVehicle.type && (
                <div className="bg-muted/30 p-4 rounded-lg border space-y-4">
                  <div className="flex items-center gap-2 text-jungle-700">
                    <Info size={18} />
                    <span className="text-sm font-medium">Capacidade Estimada</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    {VEHICLE_DEFAULTS[newVehicle.type].hint}
                  </p>

                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <Label>Peso Máximo (kg)</Label>
                      <span className="font-bold">{newVehicle.capacity_weight_kg} kg</span>
                    </div>
                    {/* Se não tiver componente Slider, use Input type="number" */}
                    <Input 
                        type="number" 
                        value={newVehicle.capacity_weight_kg}
                        onChange={e => setNewVehicle({...newVehicle, capacity_weight_kg: Number(e.target.value)})}
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <Label>Volume Estimado (Litros)</Label>
                      <span className="font-bold">{newVehicle.capacity_volume_liters} L</span>
                    </div>
                    <Input 
                        type="number" 
                        value={newVehicle.capacity_volume_liters}
                        onChange={e => setNewVehicle({...newVehicle, capacity_volume_liters: Number(e.target.value)})}
                    />
                  </div>
                </div>
              )}

              <Button onClick={handleSubmit} className="w-full bg-jungle">
                Salvar Transporte
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* List of Vehicles */}
      <div className="grid md:grid-cols-2 gap-4">
        {vehicles.map(v => {
          const Icon = VEHICLE_DEFAULTS[v.type]?.icon || Truck;
          return (
            <Card key={v._id} className="relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-1 h-full ${v.is_verified ? 'bg-green-500' : 'bg-yellow-400'}`} />
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div className="flex gap-4">
                    <div className="h-12 w-12 bg-gray-100 rounded-full flex items-center justify-center text-jungle-700">
                      <Icon size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{v.name}</h3>
                      <p className="text-sm text-muted-foreground capitalize">
                        {VEHICLE_DEFAULTS[v.type]?.label || v.type} • {v.model || 'Sem modelo'}
                      </p>
                      {v.license_plate && (
                        <Badge variant="outline" className="mt-1 font-mono text-xs">
                          {v.license_plate}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-600" onClick={() => handleDelete(v._id)}>
                    <Trash size={18} />
                  </Button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-muted p-2 rounded text-center">
                    <span className="block font-bold">{v.capacity_weight_kg} kg</span>
                    <span className="text-xs text-muted-foreground">Peso</span>
                  </div>
                  <div className="bg-muted p-2 rounded text-center">
                    <span className="block font-bold">{v.capacity_volume_liters} L</span>
                    <span className="text-xs text-muted-foreground">Volume</span>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 text-xs">
                  {v.is_verified ? (
                    <span className="flex items-center gap-1 text-green-600 font-medium">
                      <CheckCircle size={14} /> Verificado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-yellow-600 font-medium">
                      <Warning size={14} /> Pendente de Validação
                    </span>
                  )}
                  {!v.is_verified && (
                    <span className="text-muted-foreground ml-auto">
                      Será validado no 1º envio
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        
        {vehicles.length === 0 && !loading && (
          <div className="col-span-full text-center py-12 border-2 border-dashed rounded-lg">
            <Truck size={48} className="mx-auto text-muted-foreground mb-4 opacity-50" />
            <h3 className="font-medium text-lg">Nenhum transporte cadastrado</h3>
            <p className="text-muted-foreground">Adicione um veículo ou método de viagem para começar.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VehiclesPage;
