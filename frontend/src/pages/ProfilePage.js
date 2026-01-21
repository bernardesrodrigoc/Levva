import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, User, Star, ShieldCheck, MapPin, Phone, Calendar, Medal, Bank, Warning, Check, Pencil } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ProfilePage = () => {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Pix state
  const [payoutMethod, setPayoutMethod] = useState(null);
  const [pixKey, setPixKey] = useState('');
  const [pixType, setPixType] = useState('');
  const [savingPix, setSavingPix] = useState(false);
  
  // Edit profile state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    fetchProfileData();
    fetchPayoutMethod();
  }, []);

  const fetchPayoutMethod = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`${API}/users/payout-method`, { headers });
      setPayoutMethod(res.data);
      if (res.data.pix_key) {
        setPixKey(res.data.pix_key);
        setPixType(res.data.pix_type);
      }
    } catch (error) {
      console.error('Erro ao carregar método de pagamento:', error);
    }
  };

  const handleSavePix = async () => {
    if (!pixKey || !pixType) {
      toast.error('Preencha todos os campos');
      return;
    }
    
    setSavingPix(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.post(
        `${API}/users/payout-method`,
        { pix_key: pixKey, pix_type: pixType },
        { headers }
      );
      
      toast.success(res.data.message);
      if (res.data.payouts_unblocked > 0) {
        toast.info(`${res.data.payouts_unblocked} pagamento(s) desbloqueado(s)!`);
      }
      fetchPayoutMethod();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao salvar');
    } finally {
      setSavingPix(false);
    }
  };

  const openEditDialog = () => {
    setEditName(profile?.name || '');
    setEditPhone(profile?.phone || '');
    setShowEditDialog(true);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    
    setSavingProfile(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      await axios.put(
        `${API}/users/profile`,
        { name: editName.trim(), phone: editPhone.trim() },
        { headers }
      );
      
      toast.success('Perfil atualizado com sucesso!');
      setShowEditDialog(false);
      fetchProfileData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao salvar perfil');
    } finally {
      setSavingProfile(false);
    }
  };

  const fetchProfileData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      const [userRes, ratingsRes, tripsRes, shipmentsRes] = await Promise.all([
        axios.get(`${API}/auth/me`, { headers }),
        axios.get(`${API}/ratings/${user.id}`, { headers }),
        axios.get(`${API}/trips/my-trips`, { headers }),
        axios.get(`${API}/shipments/my-shipments`, { headers })
      ]);

      setProfile(userRes.data);
      setRatings(ratingsRes.data);
      setStats({
        trips: tripsRes.data.length,
        shipments: shipmentsRes.data.length,
        deliveries: userRes.data.total_deliveries || 0
      });
    } catch (error) {
      toast.error('Erro ao carregar perfil');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getTrustBadgeColor = (level) => {
    const colors = {
      level_1: 'bg-slate-100 text-slate-700 border-slate-300',
      level_2: 'bg-blue-100 text-blue-700 border-blue-300',
      level_3: 'bg-lime-100 text-lime-700 border-lime-300',
      level_4: 'bg-jungle-100 text-jungle-700 border-jungle-300',
      level_5: 'bg-yellow-100 text-yellow-700 border-yellow-300'
    };
    return colors[level] || colors.level_1;
  };

  const getTrustLevelName = (level) => {
    const names = {
      level_1: 'Iniciante',
      level_2: 'Bronze',
      level_3: 'Prata',
      level_4: 'Ouro',
      level_5: 'Platina'
    };
    return names[level] || 'Iniciante';
  };

  const getRoleLabel = (role) => {
    const labels = {
      sender: 'Remetente',
      carrier: 'Transportador',
      both: 'Remetente e Transportador',
      admin: 'Administrador'
    };
    return labels[role] || role;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-jungle"></div>
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
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/dashboard')} 
            data-testid="back-to-dashboard-btn"
          >
            <span className="hidden md:inline">Voltar ao Dashboard</span>
            <span className="md:hidden">Voltar</span>
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 md:px-6 py-4 md:py-8 max-w-6xl">
        {/* Profile Header - Mobile Optimized */}
        <Card className="mb-4 md:mb-8">
          <CardContent className="p-4 md:p-8">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-8">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-3 md:gap-4">
                <Avatar className="w-24 h-24 md:w-32 md:h-32">
                  <AvatarImage src={profile?.profile_photo_url} />
                  <AvatarFallback className="bg-jungle/10 text-jungle text-2xl md:text-3xl">
                    {profile?.name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                              <Button 
                  variant="outline" 
                  size="sm"
                  onClick={openEditDialog}
                  data-testid="edit-profile-btn"
                  className="text-sm gap-2"
                >
                  <Pencil size={16} />
                  Editar Perfil
                </Button>
              </div>

              {/* Info */}
              <div className="flex-1 text-center md:text-left w-full">
                <div className="flex items-center justify-center md:justify-start gap-2 md:gap-3 mb-3 md:mb-4">
                  <h1 className="text-xl md:text-3xl font-heading font-bold">{profile?.name}</h1>
                  {profile?.verification_status === 'verified' && (
                    <ShieldCheck size={24} weight="fill" className="text-jungle" />
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 md:gap-3 mb-4 md:mb-6">
                  <Badge className={`${getTrustBadgeColor(profile?.trust_level)} text-xs md:text-sm`}>
                    <Medal size={14} className="mr-1 md:mr-2" />
                    {getTrustLevelName(profile?.trust_level)}
                  </Badge>
                  <Badge variant="outline" className="text-xs md:text-sm">{getRoleLabel(profile?.role)}</Badge>
                  {profile?.rating > 0 && (
                    <div className="flex items-center gap-1 bg-yellow-50 px-2 md:px-3 py-1 rounded-full border border-yellow-200">
                      <Star size={14} weight="fill" className="text-yellow-500" />
                      <span className="font-semibold text-yellow-700 text-sm">{profile?.rating.toFixed(1)}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4 mb-4 md:mb-6 text-sm">
                  <div className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground">
                    <Phone size={16} />
                    <span>{profile?.phone}</span>
                  </div>
                  <div className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground">
                    <Calendar size={16} />
                    <span>Desde {new Date(profile?.created_at).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>

                {/* Stats - Mobile Optimized */}
                <div className="grid grid-cols-3 gap-2 md:gap-4">
                  <div className="text-center p-3 md:p-4 bg-muted rounded-lg">
                    <p className="text-xl md:text-2xl font-bold text-foreground">{stats?.trips || 0}</p>
                    <p className="text-[10px] md:text-sm text-muted-foreground">Viagens</p>
                  </div>
                  <div className="text-center p-3 md:p-4 bg-muted rounded-lg">
                    <p className="text-xl md:text-2xl font-bold text-foreground">{stats?.shipments || 0}</p>
                    <p className="text-[10px] md:text-sm text-muted-foreground">Envios</p>
                  </div>
                  <div className="text-center p-3 md:p-4 bg-muted rounded-lg">
                    <p className="text-xl md:text-2xl font-bold text-foreground">{stats?.deliveries || 0}</p>
                    <p className="text-[10px] md:text-sm text-muted-foreground">Entregas</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pix Payout Method - For carriers */}
        {(profile?.role === 'carrier' || profile?.role === 'both') && (
          <Card className="mb-4 md:mb-8" data-testid="pix-card">
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <Bank size={20} className="text-jungle" />
                Método de Recebimento (Pix)
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                Configure sua chave Pix para receber pagamentos das entregas
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0">
              {!payoutMethod?.has_payout_method && (
                <Alert className="mb-4 border-yellow-400 bg-yellow-50">
                  <Warning size={16} className="text-yellow-600" />
                  <AlertDescription className="text-yellow-800 text-sm">
                    <strong>Atenção:</strong> Você precisa cadastrar uma chave Pix para receber pagamentos.
                    Sem isso, seus ganhos ficarão retidos na plataforma.
                  </AlertDescription>
                </Alert>
              )}
              
              {payoutMethod?.has_payout_method && (
                <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-2 text-green-700 mb-2">
                    <Check size={18} weight="bold" />
                    <span className="font-medium">Pix configurado</span>
                  </div>
                  <p className="text-sm text-green-600">
                    Tipo: <span className="font-medium uppercase">{payoutMethod.pix_type}</span>
                  </p>
                  <p className="text-sm text-green-600">
                    Chave: <span className="font-mono">{payoutMethod.pix_key}</span>
                  </p>
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <Label>Tipo de Chave Pix</Label>
                  <Select value={pixType} onValueChange={setPixType}>
                    <SelectTrigger className="mt-1" data-testid="pix-type-select">
                      <SelectValue placeholder="Selecione o tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cpf">CPF</SelectItem>
                      <SelectItem value="cnpj">CNPJ</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="phone">Telefone</SelectItem>
                      <SelectItem value="random">Chave Aleatória</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Chave Pix</Label>
                  <Input
                    className="mt-1"
                    placeholder={
                      pixType === 'cpf' ? '000.000.000-00' :
                      pixType === 'cnpj' ? '00.000.000/0000-00' :
                      pixType === 'email' ? 'seu@email.com' :
                      pixType === 'phone' ? '+5511999999999' :
                      'Cole sua chave aleatória'
                    }
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    data-testid="pix-key-input"
                  />
                </div>
                
                <Button
                  className="w-full bg-jungle hover:bg-jungle-800"
                  onClick={handleSavePix}
                  disabled={savingPix || !pixKey || !pixType}
                  data-testid="save-pix-btn"
                >
                  {savingPix ? 'Salvando...' : payoutMethod?.has_payout_method ? 'Atualizar Pix' : 'Cadastrar Pix'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ratings Section - Mobile Optimized */}
        <Card>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-base md:text-lg">Avaliações Recebidas</CardTitle>
            <CardDescription className="text-xs md:text-sm">
              {ratings.length > 0 ? `${ratings.length} avaliações` : 'Nenhuma avaliação ainda'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            {ratings.length === 0 ? (
              <div className="text-center py-8 md:py-12">
                <Star size={40} className="mx-auto text-muted-foreground mb-3 md:mb-4" />
                <p className="text-sm md:text-base text-muted-foreground">Você ainda não tem avaliações</p>
                <p className="text-xs md:text-sm text-muted-foreground">Complete sua primeira entrega para receber avaliações</p>
              </div>
            ) : (
              <div className="space-y-4">
                {ratings.map((rating) => (
                  <div key={rating.id} className="border rounded-lg p-4" data-testid={`rating-${rating.id}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback className="bg-jungle/10 text-jungle">
                            {rating.rater_name?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold">{rating.rater_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(rating.created_at).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            size={18}
                            weight={i < rating.rating ? 'fill' : 'regular'}
                            className={i < rating.rating ? 'text-yellow-500' : 'text-gray-300'}
                          />
                        ))}
                      </div>
                    </div>
                    {rating.comment && (
                      <p className="text-muted-foreground">{rating.comment}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Profile Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Perfil</DialogTitle>
            <DialogDescription>
              Atualize suas informações básicas
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome completo</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Seu nome"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Telefone</Label>
              <Input
                id="edit-phone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="(XX) XXXXX-XXXX"
              />
            </div>
            
            {profile?.verification_status !== 'verified' && (
              <Alert className="border-amber-200 bg-amber-50">
                <Warning size={18} className="text-amber-600" />
                <AlertDescription className="ml-2 text-amber-800 text-sm">
                  Para alterar outros dados (documentos, foto), acesse a{' '}
                  <button 
                    className="underline font-medium"
                    onClick={() => {
                      setShowEditDialog(false);
                      navigate('/verificacao');
                    }}
                  >
                    página de verificação
                  </button>.
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="bg-jungle hover:bg-jungle-800"
            >
              {savingProfile ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProfilePage;