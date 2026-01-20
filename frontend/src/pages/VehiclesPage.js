import React, { useState, useEffect, useCallback } from 'react';
import { 
  Truck, Car, Motorcycle, Bus, Plus, Trash, CheckCircle, Warning, Package,
  Lightbulb, TrendingUp
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const getBackendUrl = () => {
  let url = process.env.REACT_APP_BACKEND_URL || '';
  if (url && !url.startsWith('http')) {
    url = `https://${url}`;
  }
  return url.replace(/\/$/, '');
};

const API = `${getBackendUrl()}/api`;

// Vehicle type icons and labels
const VEHICLE_ICONS = {
  motorcycle: { label: "Moto", icon: Motorcycle },
  car: { label: "Carro", icon: Car },
  van: { label: "Van / Utilitário", icon: Truck },
  truck: { label: "Caminhão", icon: Truck },
  bus_passenger: { label: "Passageiro de Ônibus", icon: Bus },
  carpool_passenger: { label: "Passageiro em Carona", icon: Package }
};

const VehiclesPage = () => {
  const { token } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Vehicle type defaults from API
  const [vehicleDefaults, setVehicleDefaults] = useState([]);
  
  // Form state
  const [newVehicle, setNewVehicle] = useState({
    type: '',
    name: '',
    license_plate: '',
    brand: '',
    model: '',
    year: '',
    capacity_weight_kg: 0,
    capacity_volume_liters: 0
  });
  
  // Intelligence state
  const [suggestion, setSuggestion] = useState(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [deviation, setDeviation] = useState(null);

  useEffect(() => {
    fetchVehicles();
    fetchDefaults();
  }, []);

  const fetchVehicles = async () => {
    try {
      const res = await axios.get(`${API}/vehicles`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setVehicles(res.data);
    } catch (error) {
      console.error("Erro ao buscar veículos:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDefaults = async () => {
    try {
      const res = await axios.get(`${API}/vehicles/intelligence/defaults`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setVehicleDefaults(res.data);
    } catch (error) {
      console.error("Erro ao buscar defaults:", error);
    }
  };

  // Fetch intelligent capacity suggestion
  const fetchSuggestion = useCallback(async (type, brand, model, year) => {
    if (!type) return;
    
    setLoadingSuggestion(true);
    try {
      const res = await axios.post(
        `${API}/vehicles/intelligence/suggest-capacity`,
        {
          vehicle_type: type,
          brand: brand || null,
          model: model || null,
          year: year ? parseInt(year) : null
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setSuggestion(res.data);
      
      // Auto-fill capacity if user hasn't modified it
      if (newVehicle.capacity_weight_kg === 0 || !newVehicle.capacity_weight_kg) {
        setNewVehicle(prev => ({
          ...prev,
          capacity_weight_kg: res.data.weight_kg,
          capacity_volume_liters: res.data.volume_liters
        }));
      }
    } catch (error) {
      console.error("Erro ao buscar sugestão:", error);
    } finally {
      setLoadingSuggestion(false);
    }
  }, [token, newVehicle.capacity_weight_kg]);

  // Check deviation when user changes capacity
  const checkDeviation = useCallback(async () => {
    if (!newVehicle.type || !suggestion) return;
    
    try {
      const res = await axios.post(
        `${API}/vehicles/intelligence/check-deviation?` + new URLSearchParams({
          vehicle_type: newVehicle.type,
          user_weight_kg: newVehicle.capacity_weight_kg,
          user_volume_liters: newVehicle.capacity_volume_liters,
          ...(newVehicle.brand && { brand: newVehicle.brand }),
          ...(newVehicle.model && { model: newVehicle.model }),
          ...(newVehicle.year && { year: newVehicle.year })
        }),
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setDeviation(res.data.deviation);
    } catch (error) {
      console.error("Erro ao verificar desvio:", error);
    }
  }, [token, newVehicle, suggestion]);

  // Fetch suggestion when type/brand/model changes
  useEffect(() => {
    if (newVehicle.type) {
      const debounce = setTimeout(() => {
        fetchSuggestion(newVehicle.type, newVehicle.brand, newVehicle.model, newVehicle.year);
      }, 500);
      return () => clearTimeout(debounce);
    }
  }, [newVehicle.type, newVehicle.brand, newVehicle.model, newVehicle.year, fetchSuggestion]);

  // Check deviation when capacity changes
  useEffect(() => {
    if (suggestion && newVehicle.capacity_weight_kg > 0) {
      const debounce = setTimeout(() => {
        checkDeviation();
      }, 300);
      return () => clearTimeout(debounce);
    }
  }, [newVehicle.capacity_weight_kg, newVehicle.capacity_volume_liters, suggestion, checkDeviation]);

  const handleTypeChange = (value) => {
    // Find default for this type
    const defaultData = vehicleDefaults.find(d => d.type === value);
    
    setNewVehicle(prev => ({
      ...prev,
      type: value,
      capacity_weight_kg: defaultData?.default_weight_kg || 0,
      capacity_volume_liters: defaultData?.default_volume_liters || 0
    }));
    
    setSuggestion(null);
    setDeviation(null);
  };

  const applySuggestion = () => {
    if (suggestion) {
      setNewVehicle(prev => ({
        ...prev,
        capacity_weight_kg: suggestion.weight_kg,
        capacity_volume_liters: suggestion.volume_liters
      }));
      toast.success("Valores sugeridos aplicados!");
    }
  };

  const handleSubmit = async () => {
    try {
      if (!newVehicle.type || !newVehicle.name) {
        toast.error("Preencha o tipo e o nome do veículo.");
        return;
      }

      const payload = {
        ...newVehicle,
        year: newVehicle.year ? parseInt(newVehicle.year) : null
      };

      await axios.post(`${API}/vehicles`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success("Veículo adicionado com sucesso!");
      setIsDialogOpen(false);
      fetchVehicles();
      
      // Reset form
      setNewVehicle({ 
        type: '', name: '', license_plate: '', brand: '', model: '', year: '',
        capacity_weight_kg: 0, capacity_volume_liters: 0 
      });
      setSuggestion(null);
      setDeviation(null);

    } catch (error) {
      console.error(error);
      toast.error("Erro ao adicionar: " + (error.response?.data?.detail || error.message));
    }
  };

  const handleDelete = async (id) => {
    if(!window.confirm("Tem certeza que deseja remover este veículo?")) return;
    try {
      await axios.delete(`${API}/vehicles/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Veículo removido");
      fetchVehicles();
    } catch (error) {
      toast.error("Erro ao remover veículo");
    }
  };

  const getConfidenceColor = (confidence) => {
    const colors = {
      high: 'text-green-600 bg-green-50',
      medium: 'text-yellow-600 bg-yellow-50',
      low: 'text-gray-600 bg-gray-50'
    };
    return colors[confidence] || colors.low;
  };

  const getConfidenceLabel = (confidence) => {
    const labels = {
      high: 'Alta confiança',
      medium: 'Confiança média',
      low: 'Valor padrão'
    };
    return labels[confidence] || 'Estimativa';
  };

  const getSourceLabel = (source) => {
    const labels = {
      platform_statistics: 'Dados da plataforma',
      known_models_database: 'Modelo conhecido',
      vehicle_type_default: 'Valor padrão'
    };
    return labels[source] || source;
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
            <Button className="bg-jungle hover:bg-jungle-800 text-white gap-2 shadow-lg" data-testid="add-vehicle-btn">
              <Plus size={20} /> Adicionar Novo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg bg-white dark:bg-zinc-900 max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Novo Método de Transporte</DialogTitle>
              <DialogDescription>
                Cadastre os detalhes do seu veículo. Nossa IA sugere a capacidade ideal baseada em dados reais.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {/* Step 1: Vehicle Type */}
              <div>
                <Label>Como você vai transportar?</Label>
                <Select onValueChange={handleTypeChange} value={newVehicle.type}>
                  <SelectTrigger className="mt-1" data-testid="vehicle-type-select">
                    <SelectValue placeholder="Selecione o tipo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicleDefaults.map((vd) => {
                      const IconData = VEHICLE_ICONS[vd.type];
                      return (
                        <SelectItem key={vd.type} value={vd.type}>
                          <div className="flex items-center gap-2">
                            {IconData && <IconData.icon size={18} className="text-jungle" />}
                            <span>{vd.name}</span>
                            <span className="text-xs text-muted-foreground">({vd.default_weight_kg}kg)</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Step 2: Basic Info */}
              <div>
                <Label>Apelido (Ex: Meu Carro, Viagem pra SP)</Label>
                <Input 
                  className="mt-1"
                  value={newVehicle.name}
                  onChange={e => setNewVehicle({...newVehicle, name: e.target.value})}
                  placeholder="Identifique este transporte"
                  data-testid="vehicle-name-input"
                />
              </div>

              {/* Step 3: Brand/Model (for motorized vehicles) */}
              {['car', 'motorcycle', 'van', 'truck'].includes(newVehicle.type) && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Marca</Label>
                      <Input 
                        className="mt-1"
                        placeholder="Ex: Honda, Fiat" 
                        value={newVehicle.brand}
                        onChange={e => setNewVehicle({...newVehicle, brand: e.target.value})}
                        data-testid="vehicle-brand-input"
                      />
                    </div>
                    <div>
                      <Label>Modelo</Label>
                      <Input 
                        className="mt-1"
                        placeholder="Ex: Civic, Argo" 
                        value={newVehicle.model}
                        onChange={e => setNewVehicle({...newVehicle, model: e.target.value})}
                        data-testid="vehicle-model-input"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Ano</Label>
                      <Input 
                        className="mt-1"
                        type="number"
                        placeholder="Ex: 2022" 
                        value={newVehicle.year}
                        onChange={e => setNewVehicle({...newVehicle, year: e.target.value})}
                        data-testid="vehicle-year-input"
                      />
                    </div>
                    <div>
                      <Label>Placa</Label>
                      <Input 
                        className="mt-1 uppercase"
                        placeholder="ABC-1234" 
                        value={newVehicle.license_plate}
                        onChange={e => setNewVehicle({...newVehicle, license_plate: e.target.value})}
                        data-testid="vehicle-plate-input"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Step 4: Intelligent Capacity Suggestion */}
              {newVehicle.type && (
                <div className="bg-gradient-to-br from-jungle/5 to-lime/5 p-4 rounded-lg border border-jungle/20 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-jungle-700 dark:text-jungle-400">
                      <Lightbulb size={18} weight="fill" />
                      <span className="text-sm font-bold">Capacidade Inteligente</span>
                    </div>
                    {loadingSuggestion && (
                      <span className="text-xs text-muted-foreground animate-pulse">Calculando...</span>
                    )}
                  </div>

                  {/* Suggestion Info */}
                  {suggestion && !loadingSuggestion && (
                    <div className="bg-white dark:bg-zinc-800 rounded-md p-3 border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          {getSourceLabel(suggestion.source)}
                        </span>
                        <Badge variant="outline" className={`text-xs ${getConfidenceColor(suggestion.confidence)}`}>
                          {getConfidenceLabel(suggestion.confidence)}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div>
                          <span className="text-2xl font-bold text-jungle">{suggestion.weight_kg}</span>
                          <span className="text-sm text-muted-foreground ml-1">kg</span>
                        </div>
                        <div className="text-muted-foreground">/</div>
                        <div>
                          <span className="text-2xl font-bold text-jungle">{suggestion.volume_liters}</span>
                          <span className="text-sm text-muted-foreground ml-1">L</span>
                        </div>
                      </div>

                      {suggestion.sample_size > 0 && (
                        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                          <TrendingUp size={12} />
                          Baseado em {suggestion.sample_size} veículos similares na plataforma
                        </p>
                      )}

                      {(suggestion.brand || suggestion.model) && (
                        <p className="text-xs text-jungle mt-1">
                          Sugestão para: {[suggestion.brand, suggestion.model].filter(Boolean).join(' ')}
                        </p>
                      )}

                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-3 w-full border-jungle text-jungle hover:bg-jungle/10"
                        onClick={applySuggestion}
                      >
                        Usar valores sugeridos
                      </Button>
                    </div>
                  )}

                  {/* Editable Capacity Fields */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Peso Máximo (kg)</Label>
                      <Input 
                        type="number" 
                        className="mt-1 font-bold"
                        value={newVehicle.capacity_weight_kg}
                        onChange={e => setNewVehicle({...newVehicle, capacity_weight_kg: Number(e.target.value)})}
                        data-testid="vehicle-weight-input"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Volume (Litros)</Label>
                      <Input 
                        type="number" 
                        className="mt-1 font-bold"
                        value={newVehicle.capacity_volume_liters}
                        onChange={e => setNewVehicle({...newVehicle, capacity_volume_liters: Number(e.target.value)})}
                        data-testid="vehicle-volume-input"
                      />
                    </div>
                  </div>

                  {/* Deviation Warning */}
                  {deviation?.any_flagged && (
                    <Alert className="border-yellow-400 bg-yellow-50">
                      <Warning size={16} className="text-yellow-600" />
                      <AlertDescription className="text-yellow-800 text-xs">
                        Os valores informados diferem significativamente da sugestão 
                        ({deviation.weight_deviation_percent.toFixed(0)}% peso, {deviation.volume_deviation_percent.toFixed(0)}% volume).
                        <br />
                        <span className="font-medium">Isso não impede o cadastro</span>, mas você pode ajustar se necessário.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              <Button 
                onClick={handleSubmit} 
                className="w-full bg-jungle hover:bg-jungle-800 text-white font-bold"
                data-testid="save-vehicle-btn"
              >
                Salvar Transporte
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Vehicle List */}
      <div className="grid md:grid-cols-2 gap-4">
        {vehicles.map(v => {
          const IconData = VEHICLE_ICONS[v.type];
          const Icon = IconData?.icon || Truck;
          return (
            <Card key={v._id || v.id} className="relative overflow-hidden border hover:shadow-md transition-shadow" data-testid={`vehicle-card-${v._id || v.id}`}>
              {/* Status indicator */}
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
                        {IconData?.label || v.type} 
                        {v.brand && <span>• {v.brand}</span>}
                        {v.model && <span>{v.model}</span>}
                        {v.year && <span>({v.year})</span>}
                      </p>
                      {v.license_plate && (
                        <Badge variant="outline" className="mt-1 font-mono text-xs border-jungle/30">
                          {v.license_plate}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-red-400 hover:text-red-600 hover:bg-red-50" 
                    onClick={() => handleDelete(v._id || v.id)}
                    data-testid={`delete-vehicle-${v._id || v.id}`}
                  >
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
                  
                  {v.capacity_deviation_flagged && (
                    <Badge variant="outline" className="text-xs border-yellow-400 text-yellow-600">
                      Capacidade atípica
                    </Badge>
                  )}
                  
                  {!v.is_verified && !v.capacity_deviation_flagged && (
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
