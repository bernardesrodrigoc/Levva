import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Users, TruckIcon, ShieldCheck, Warning, Check, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AdminDashboard = () => {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [pendingVerifications, setPendingVerifications] = useState([]);
  const [selectedVerification, setSelectedVerification] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [reviewAction, setReviewAction] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if admin
    if (!user) {
      console.log('No user yet, waiting...');
      return;
    }
    
    console.log('User loaded:', user.email, 'Role:', user.role);
    
    if (user.role !== 'admin') {
      console.log('Not admin, redirecting to dashboard');
      navigate('/dashboard');
      return;
    }
    
    console.log('User is admin, fetching data...');
    fetchData();
  }, [user, navigate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      console.log('Fetching admin data with token:', token?.substring(0, 30) + '...');
      
      const statsRes = await axios.get(`${API}/admin/stats`, { headers });
      console.log('Stats received:', statsRes.data);
      
      const verificationsRes = await axios.get(`${API}/admin/verifications/pending`, { headers });
      console.log('Verifications received:', verificationsRes.data.length, 'items');
      
      setStats(statsRes.data);
      setPendingVerifications(verificationsRes.data);
      
      console.log('State updated with', verificationsRes.data.length, 'verifications');
    } catch (error) {
      console.error('Error fetching admin data:', error);
      console.error('Error details:', error.response?.data);
      toast.error('Erro ao carregar dados: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async () => {
    if (!selectedVerification || !reviewAction) return;

    try {
      await axios.post(
        `${API}/admin/verifications/${selectedVerification.id}/review`,
        {
          action: reviewAction,
          notes: reviewNotes
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success(
        reviewAction === 'approve' 
          ? 'Verificação aprovada!' 
          : 'Verificação rejeitada'
      );

      setShowDialog(false);
      setSelectedVerification(null);
      setReviewAction(null);
      setReviewNotes('');
      fetchData();
    } catch (error) {
      toast.error('Erro ao processar verificação');
    }
  };

  const openReviewDialog = (verification, action) => {
    setSelectedVerification(verification);
    setReviewAction(action);
    setShowDialog(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-jungle"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass border-b sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={32} weight="duotone" className="text-jungle" />
            <span className="text-2xl font-heading font-bold text-jungle">Levva Admin</span>
          </div>
          <Button variant="ghost" onClick={() => navigate('/dashboard')} data-testid="back-to-dashboard-btn">
            Voltar
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-heading font-bold mb-2">Painel Administrativo</h1>
          <p className="text-muted-foreground">Gerencie usuários, verificações e plataforma</p>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card data-testid="total-users-card">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users size={16} />
                Total de Usuários
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats?.total_users || 0}</p>
            </CardContent>
          </Card>

          <Card data-testid="active-trips-card">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TruckIcon size={16} />
                Viagens Ativas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats?.active_trips || 0}</p>
            </CardContent>
          </Card>

          <Card data-testid="active-shipments-card">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Package size={16} />
                Envios Ativos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats?.active_shipments || 0}</p>
            </CardContent>
          </Card>

          <Card data-testid="pending-verifications-card">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ShieldCheck size={16} />
                Verificações Pendentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-yellow-600">{stats?.pending_verifications || 0}</p>
            </CardContent>
          </Card>
        </div>

        {/* Verifications Review */}
        <Card>
          <CardHeader>
            <CardTitle>Verificações Pendentes</CardTitle>
            <CardDescription>
              Revise e aprove identidades de usuários
              {/* Debug info */}
              <div className="mt-2 text-xs font-mono bg-yellow-50 p-2 rounded">
                Debug: {pendingVerifications.length} verificações carregadas | 
                Loading: {loading ? 'sim' : 'não'} | 
                User role: {user?.role}
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingVerifications.length === 0 ? (
              <div className="text-center py-12">
                <ShieldCheck size={48} className="mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhuma verificação pendente</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingVerifications.map((verification) => (
                  <Card key={verification.id} className="border-2" data-testid={`verification-${verification.id}`}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-6">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 bg-jungle/10 rounded-full flex items-center justify-center">
                              <Users size={24} className="text-jungle" />
                            </div>
                            <div>
                              <p className="font-semibold text-lg">{verification.user_name}</p>
                              <p className="text-sm text-muted-foreground">{verification.user_email}</p>
                            </div>
                            <Badge>{verification.user_role}</Badge>
                          </div>

                          <div className="grid md:grid-cols-2 gap-4 mb-4">
                            <div>
                              <p className="text-xs text-muted-foreground">CPF</p>
                              <p className="font-medium">{verification.cpf}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Data de Nascimento</p>
                              <p className="font-medium">{new Date(verification.birth_date).toLocaleDateString('pt-BR')}</p>
                            </div>
                            <div className="md:col-span-2">
                              <p className="text-xs text-muted-foreground">Endereço</p>
                              <p className="font-medium">
                                {verification.address.street}, {verification.address.city} - {verification.address.state}
                              </p>
                            </div>
                          </div>

                          <div className="grid md:grid-cols-4 gap-4">
                            <div>
                              <p className="text-xs text-muted-foreground mb-2">Foto de Perfil</p>
                              <img 
                                src={verification.documents.profile_photo} 
                                alt="Perfil" 
                                className="w-full h-24 object-cover rounded-lg border"
                              />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-2">Doc. Frente</p>
                              <img 
                                src={verification.documents.id_front} 
                                alt="ID Front" 
                                className="w-full h-24 object-cover rounded-lg border"
                              />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-2">Doc. Verso</p>
                              <img 
                                src={verification.documents.id_back} 
                                alt="ID Back" 
                                className="w-full h-24 object-cover rounded-lg border"
                              />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-2">Selfie</p>
                              <img 
                                src={verification.documents.selfie} 
                                alt="Selfie" 
                                className="w-full h-24 object-cover rounded-lg border"
                              />
                            </div>
                            {verification.documents.driver_license && (
                              <div>
                                <p className="text-xs text-muted-foreground mb-2">CNH</p>
                                <img 
                                  src={verification.documents.driver_license} 
                                  alt="CNH" 
                                  className="w-full h-24 object-cover rounded-lg border"
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <Button
                            onClick={() => openReviewDialog(verification, 'approve')}
                            className="bg-jungle hover:bg-jungle-800"
                            data-testid={`approve-btn-${verification.id}`}
                          >
                            <Check size={20} className="mr-2" />
                            Aprovar
                          </Button>
                          <Button
                            onClick={() => openReviewDialog(verification, 'reject')}
                            variant="destructive"
                            data-testid={`reject-btn-${verification.id}`}
                          >
                            <X size={20} className="mr-2" />
                            Rejeitar
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Review Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === 'approve' ? 'Aprovar Verificação' : 'Rejeitar Verificação'}
            </DialogTitle>
            <DialogDescription>
              {reviewAction === 'approve' 
                ? 'O usuário poderá usar todas as funcionalidades da plataforma.' 
                : 'O usuário será notificado e precisará reenviar os documentos.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Observações (opcional)</label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Adicione comentários sobre a revisão..."
                rows={4}
                className="mt-2"
                data-testid="review-notes-input"
              />
            </div>
            <div className="flex gap-4">
              <Button variant="outline" className="flex-1" onClick={() => setShowDialog(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleReview} 
                className={reviewAction === 'approve' ? 'flex-1 bg-jungle hover:bg-jungle-800' : 'flex-1'}
                variant={reviewAction === 'reject' ? 'destructive' : 'default'}
                data-testid="confirm-review-btn"
              >
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;