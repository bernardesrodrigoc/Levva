import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Package, Users, TruckIcon, ShieldCheck, Warning, Check, X, Gavel, 
  ChatCircle, MagnifyingGlassPlus, MagnifyingGlassMinus, ArrowsOut, Car, Flag,
  Bank, CurrencyDollar, Clock, CheckCircle
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AdminDashboard = () => {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  
  // Dados Principais
  const [stats, setStats] = useState(null);
  const [pendingVerifications, setPendingVerifications] = useState([]);
  const [approvedVerifications, setApprovedVerifications] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [flaggedVehicles, setFlaggedVehicles] = useState([]);
  const [vehicleStats, setVehicleStats] = useState(null);
  const [activeTab, setActiveTab] = useState('pending');
  const [userFilter, setUserFilter] = useState({ status: '', role: '' });
  
  // Payout states
  const [payoutStats, setPayoutStats] = useState(null);
  const [readyPayouts, setReadyPayouts] = useState([]);
  const [blockedPayouts, setBlockedPayouts] = useState([]);
  
  // Estados de Seleção e Modais
  const [selectedVerification, setSelectedVerification] = useState(null);
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showDisputeDialog, setShowDisputeDialog] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [showUserDetailDialog, setShowUserDetailDialog] = useState(false);
  const [showDeleteUserDialog, setShowDeleteUserDialog] = useState(false);
  
  // --- ESTADOS DO LIGHTBOX ---
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [previewImage, setPreviewImage] = useState({ url: '', title: '' });
  const [zoomLevel, setZoomLevel] = useState(1);

  // Estados de Formulário
  const [reviewAction, setReviewAction] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [revokeReason, setRevokeReason] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [disputeNote, setDisputeNote] = useState('');
  const [resolutionType, setResolutionType] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      return;
    }
    
    if (user.role !== 'admin') {
      navigate('/dashboard');
      return;
    }
    
    fetchData();
  }, [user, navigate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      const [statsRes, verificationsRes, approvedRes, usersRes, disputesRes, flaggedRes, vehicleStatsRes, payoutStatsRes, readyPayoutsRes, blockedPayoutsRes] = await Promise.all([
        axios.get(`${API}/admin/stats`, { headers }),
        axios.get(`${API}/admin/verifications/pending`, { headers }),
        axios.get(`${API}/admin/verifications/approved`, { headers }),
        axios.get(`${API}/admin/users`, { headers }),
        axios.get(`${API}/admin/disputes`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API}/admin/vehicles/flagged`, { headers }).catch(() => ({ data: { vehicles: [] } })),
        axios.get(`${API}/admin/vehicles/statistics`, { headers }).catch(() => ({ data: null })),
        axios.get(`${API}/admin/payouts/statistics`, { headers }).catch(() => ({ data: null })),
        axios.get(`${API}/admin/payouts/ready`, { headers }).catch(() => ({ data: { payouts: [] } })),
        axios.get(`${API}/admin/payouts/blocked`, { headers }).catch(() => ({ data: { blocked_payouts: [] } }))
      ]);
      
      setStats(statsRes.data);
      setPendingVerifications(verificationsRes.data);
      setApprovedVerifications(approvedRes.data);
      setAllUsers(usersRes.data);
      setDisputes(disputesRes.data);
      setFlaggedVehicles(flaggedRes.data.vehicles || []);
      setVehicleStats(vehicleStatsRes.data);
      setPayoutStats(payoutStatsRes.data);
      setReadyPayouts(readyPayoutsRes.data.payouts || []);
      setBlockedPayouts(blockedPayoutsRes.data.blocked_payouts || []);
      
    } catch (error) {
      console.error('Error fetching admin data:', error);
      toast.error('Erro ao carregar dados: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Payout management functions
  const handleMarkPayoutComplete = async (paymentId) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`${API}/admin/payouts/${paymentId}/complete`, {}, { headers });
      toast.success('Pagamento marcado como concluído');
      fetchData();
    } catch (error) {
      toast.error('Erro ao marcar pagamento: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleRunAutoConfirm = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.post(`${API}/admin/payouts/run-auto-confirm`, {}, { headers });
      toast.success(`Auto-confirmação executada: ${res.data.confirmed} confirmados, ${res.data.blocked} bloqueados`);
      fetchData();
    } catch (error) {
      toast.error('Erro ao executar auto-confirmação: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Vehicle management functions
  const handleClearVehicleFlag = async (vehicleId) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`${API}/admin/vehicles/${vehicleId}/clear-flag`, {}, { headers });
      toast.success('Flag removido com sucesso');
      fetchData();
    } catch (error) {
      toast.error('Erro ao remover flag: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleVerifyVehicle = async (vehicleId) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`${API}/admin/vehicles/${vehicleId}/verify`, {}, { headers });
      toast.success('Veículo verificado com sucesso');
      fetchData();
    } catch (error) {
      toast.error('Erro ao verificar veículo: ' + (error.response?.data?.detail || error.message));
    }
  };

  // --- LÓGICA DO LIGHTBOX (ZOOM) ---
  const handleOpenImage = (url, title, verificationContext) => {
    setPreviewImage({ url, title });
    // Se o contexto for passado, já seleciona a verificação para permitir aprovação rápida
    if (verificationContext) {
        setSelectedVerification(verificationContext);
    }
    setZoomLevel(1); // Reseta o zoom ao abrir
    setShowImageDialog(true);
  };

  const handleZoom = (delta) => {
    setZoomLevel(prev => {
        const newZoom = prev + delta;
        return Math.max(0.5, Math.min(newZoom, 3)); // Limita entre 0.5x e 3x
    });
  };

  const handleQuickActionFromImage = (action) => {
    // Fecha o modal de imagem e abre o de confirmação imediatamente
    setShowImageDialog(false);
    // Pequeno delay para a animação do modal não conflitar
    setTimeout(() => {
        openReviewDialog(selectedVerification, action);
    }, 100);
  };

  const DocumentThumbnail = ({ src, title, verification }) => (
    <div 
      className="group relative cursor-pointer" 
      onClick={() => handleOpenImage(src, title, verification)}
    >
      <p className="text-xs text-muted-foreground mb-2">{title}</p>
      <div className="relative overflow-hidden rounded-lg border bg-muted">
        <img 
          src={src} 
          alt={title} 
          className="w-full h-24 object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
            <MagnifyingGlassPlus size={24} className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md transform scale-75 group-hover:scale-100 transition-all" />
        </div>
      </div>
    </div>
  );
  // ---------------------------------

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

  const handleViewDispute = async (dispute) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`${API}/admin/disputes/${dispute.id}`, { headers });
      setSelectedDispute(res.data);
      setShowDisputeDialog(true);
    } catch (error) {
      toast.error('Erro ao carregar detalhes da disputa');
    }
  };

  const handleAddDisputeNote = async () => {
    if (!selectedDispute || !disputeNote.trim()) return;

    try {
      await axios.post(
        `${API}/admin/disputes/${selectedDispute.id}/add-note`,
        { content: disputeNote },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Nota adicionada');
      setDisputeNote('');
      handleViewDispute({ id: selectedDispute.id });
      fetchData();
    } catch (error) {
      toast.error('Erro ao adicionar nota');
    }
  };

  const handleResolveDispute = async () => {
    if (!selectedDispute || !resolutionType) {
      toast.error('Selecione o tipo de resolução');
      return;
    }

    try {
      await axios.post(
        `${API}/admin/disputes/${selectedDispute.id}/resolve`,
        {
          resolution_type: resolutionType,
          notes: disputeNote,
          refund_amount: refundAmount ? parseFloat(refundAmount) : 0
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Disputa resolvida');
      setShowDisputeDialog(false);
      setSelectedDispute(null);
      setResolutionType('');
      setRefundAmount('');
      setDisputeNote('');
      fetchData();
    } catch (error) {
      toast.error('Erro ao resolver disputa');
    }
  };

  const openReviewDialog = (verification, action) => {
    setSelectedVerification(verification);
    setReviewAction(action);
    setShowDialog(true);
  };

  const openRevokeDialog = (verification) => {
    setSelectedVerification(verification);
    setRevokeReason('');
    setShowRevokeDialog(true);
  };

  const handleRevokeVerification = async () => {
    if (!selectedVerification) return;

    try {
      await axios.post(
        `${API}/admin/users/${selectedVerification.user_id}/revoke-verification`,
        { reason: revokeReason },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('Verificação revogada!');
      setShowRevokeDialog(false);
      setSelectedVerification(null);
      setRevokeReason('');
      fetchData();
    } catch (error) {
      toast.error('Erro ao revogar verificação');
    }
  };

  const getTrustLevelName = (level) => {
    const levels = {
      level_1: 'Iniciante',
      level_2: 'Verificado',
      level_3: 'Confiável',
      level_4: 'Experiente',
      level_5: 'Elite'
    };
    return levels[level] || level;
  };

  const getTrustLevelColor = (level) => {
    const colors = {
      level_1: 'bg-gray-100 text-gray-700',
      level_2: 'bg-blue-100 text-blue-700',
      level_3: 'bg-green-100 text-green-700',
      level_4: 'bg-purple-100 text-purple-700',
      level_5: 'bg-yellow-100 text-yellow-700'
    };
    return colors[level] || 'bg-gray-100 text-gray-700';
  };

  const getVerificationStatusBadge = (status) => {
    const badges = {
      verified: { color: 'bg-green-100 text-green-700', label: 'Verificado' },
      pending: { color: 'bg-yellow-100 text-yellow-700', label: 'Pendente' },
      rejected: { color: 'bg-red-100 text-red-700', label: 'Rejeitado' },
      not_submitted: { color: 'bg-gray-100 text-gray-700', label: 'Não enviado' }
    };
    return badges[status] || badges.not_submitted;
  };

  const getRoleBadge = (role) => {
    const badges = {
      sender: { color: 'bg-blue-100 text-blue-700', label: 'Remetente' },
      carrier: { color: 'bg-purple-100 text-purple-700', label: 'Transportador' },
      both: { color: 'bg-indigo-100 text-indigo-700', label: 'Ambos' },
      admin: { color: 'bg-red-100 text-red-700', label: 'Admin' }
    };
    return badges[role] || { color: 'bg-gray-100 text-gray-700', label: role };
  };

  const openUserDetailDialog = async (userId) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`${API}/admin/users/${userId}`, { headers });
      setSelectedUser(res.data);
      setShowUserDetailDialog(true);
    } catch (error) {
      toast.error('Erro ao carregar detalhes do usuário');
    }
  };

  const openDeleteUserDialog = (user) => {
    setSelectedUser(user);
    setDeleteReason('');
    setShowDeleteUserDialog(true);
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    try {
      await axios.delete(
        `${API}/admin/users/${selectedUser.id}`,
        { 
          headers: { Authorization: `Bearer ${token}` },
          data: { reason: deleteReason }
        }
      );

      toast.success('Usuário excluído com sucesso!');
      setShowDeleteUserDialog(false);
      setSelectedUser(null);
      setDeleteReason('');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao excluir usuário');
    }
  };

  const filteredUsers = allUsers.filter(u => {
    if (userFilter.status && u.verification_status !== userFilter.status) return false;
    if (userFilter.role && u.role !== userFilter.role) return false;
    return true;
  });

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
            <CardTitle>Verificações de Usuários</CardTitle>
            <CardDescription>Gerencie verificações pendentes e aprovadas</CardDescription>
            
            {/* Tabs */}
            <div className="flex gap-2 mt-4 flex-wrap">
              <Button
                variant={activeTab === 'pending' ? 'default' : 'outline'}
                onClick={() => setActiveTab('pending')}
                className={activeTab === 'pending' ? 'bg-jungle hover:bg-jungle-800' : ''}
              >
                Pendentes ({pendingVerifications.length})
              </Button>
              <Button
                variant={activeTab === 'approved' ? 'default' : 'outline'}
                onClick={() => setActiveTab('approved')}
                className={activeTab === 'approved' ? 'bg-jungle hover:bg-jungle-800' : ''}
              >
                Aprovadas ({approvedVerifications.length})
              </Button>
              <Button
                variant={activeTab === 'all-users' ? 'default' : 'outline'}
                onClick={() => setActiveTab('all-users')}
                className={activeTab === 'all-users' ? 'bg-jungle hover:bg-jungle-800' : ''}
              >
                Todos os Usuários ({allUsers.length})
              </Button>
              <Button
                variant={activeTab === 'flagged-vehicles' ? 'default' : 'outline'}
                onClick={() => setActiveTab('flagged-vehicles')}
                className={activeTab === 'flagged-vehicles' ? 'bg-yellow-600 hover:bg-yellow-700' : 'border-yellow-400 text-yellow-700'}
              >
                <Flag size={16} className="mr-1" />
                Veículos Flaggeados ({flaggedVehicles.length})
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Pending Verifications Tab */}
            {activeTab === 'pending' && (
              <>
                {pendingVerifications.length === 0 ? (
                  <div className="text-center py-12">
                    <ShieldCheck size={48} className="mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Nenhuma verificação pendente</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingVerifications.map((verification) => (
                      <Card key={verification.id} className="border-2 hover:border-jungle/30 transition-colors" data-testid={`verification-${verification.id}`}>
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between gap-6 flex-wrap md:flex-nowrap">
                            <div className="flex-1 min-w-[300px]">
                              <div className="flex items-center gap-3 mb-4">
                                <div className="w-12 h-12 bg-jungle/10 rounded-full flex items-center justify-center">
                                  <Users size={24} className="text-jungle" />
                                </div>
                                <div>
                                  <p className="font-semibold text-lg">{verification.user_name}</p>
                                  <p className="text-sm text-muted-foreground">{verification.user_email}</p>
                                </div>
                                <Badge className="ml-2">{verification.user_role}</Badge>
                              </div>

                              <div className="grid md:grid-cols-2 gap-4 mb-4 bg-muted/20 p-4 rounded-lg">
                                <div>
                                  <p className="text-xs text-muted-foreground">CPF</p>
                                  <p className="font-medium font-mono">{verification.cpf}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Data de Nascimento</p>
                                  <p className="font-medium">{new Date(verification.birth_date).toLocaleDateString('pt-BR')}</p>
                                </div>
                                <div className="md:col-span-2">
                                  <p className="text-xs text-muted-foreground">Endereço</p>
                                  <p className="font-medium">
                                    {verification.address?.street}, {verification.address?.city} - {verification.address?.state}
                                  </p>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {verification.documents?.profile_photo && (
                                  <DocumentThumbnail 
                                    src={verification.documents.profile_photo} 
                                    title="Foto de Perfil" 
                                    verification={verification} 
                                  />
                                )}
                                {verification.documents?.id_front && (
                                  <DocumentThumbnail 
                                    src={verification.documents.id_front} 
                                    title="Doc. Frente" 
                                    verification={verification} 
                                  />
                                )}
                                {verification.documents?.id_back && (
                                  <DocumentThumbnail 
                                    src={verification.documents.id_back} 
                                    title="Doc. Verso" 
                                    verification={verification} 
                                  />
                                )}
                                {verification.documents?.selfie && (
                                  <DocumentThumbnail 
                                    src={verification.documents.selfie} 
                                    title="Selfie" 
                                    verification={verification} 
                                  />
                                )}
                                {verification.documents?.driver_license && (
                                  <DocumentThumbnail 
                                    src={verification.documents.driver_license} 
                                    title="CNH" 
                                    verification={verification} 
                                  />
                                )}
                              </div>
                            </div>

                            <div className="flex flex-row md:flex-col gap-2 w-full md:w-auto mt-4 md:mt-0">
                              <Button
                                onClick={() => openReviewDialog(verification, 'approve')}
                                className="bg-jungle hover:bg-jungle-800 flex-1 md:w-32"
                                data-testid={`approve-btn-${verification.id}`}
                              >
                                <Check size={20} className="mr-2" />
                                Aprovar
                              </Button>
                              <Button
                                onClick={() => openReviewDialog(verification, 'reject')}
                                variant="destructive"
                                className="flex-1 md:w-32"
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
              </>
            )}

            {/* Approved Verifications Tab */}
            {activeTab === 'approved' && (
              <>
                {approvedVerifications.length === 0 ? (
                  <div className="text-center py-12">
                    <ShieldCheck size={48} className="mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Nenhuma verificação aprovada</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {approvedVerifications.map((verification) => (
                      <Card key={verification.id} className="border hover:border-jungle/30 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div className="flex items-center gap-3 flex-1 min-w-[250px]">
                              {verification.documents?.profile_photo ? (
                                <img 
                                  src={verification.documents.profile_photo} 
                                  alt={verification.user_name}
                                  className="w-12 h-12 rounded-full object-cover border-2 border-jungle/20"
                                />
                              ) : (
                                <div className="w-12 h-12 bg-jungle/10 rounded-full flex items-center justify-center">
                                  <Users size={24} className="text-jungle" />
                                </div>
                              )}
                              <div>
                                <p className="font-semibold">{verification.user_name}</p>
                                <p className="text-sm text-muted-foreground">{verification.user_email}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Badge>{verification.user_role}</Badge>
                              <Badge className={getTrustLevelColor(verification.trust_level)}>
                                {getTrustLevelName(verification.trust_level)}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <div className="text-center">
                                <p className="font-semibold text-foreground">{verification.total_deliveries || 0}</p>
                                <p className="text-xs">Entregas</p>
                              </div>
                              <div className="text-center">
                                <p className="font-semibold text-foreground">⭐ {verification.rating?.toFixed(1) || '0.0'}</p>
                                <p className="text-xs">Avaliação</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-4 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground">CPF</p>
                                <p className="font-mono text-sm">{verification.cpf}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Aprovado em</p>
                                <p className="text-sm">
                                  {verification.reviewed_at 
                                    ? new Date(verification.reviewed_at).toLocaleDateString('pt-BR') 
                                    : 'N/A'}
                                </p>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenImage(verification.documents?.profile_photo, 'Documentos', verification)}
                              >
                                Ver Docs
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => openRevokeDialog(verification)}
                              >
                                Revogar
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* All Users Tab */}
            {activeTab === 'all-users' && (
              <>
                {/* Filters */}
                <div className="flex gap-4 mb-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">Status:</Label>
                    <Select value={userFilter.status || 'all'} onValueChange={(v) => setUserFilter(prev => ({ ...prev, status: v === 'all' ? '' : v }))}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="verified">Verificado</SelectItem>
                        <SelectItem value="pending">Pendente</SelectItem>
                        <SelectItem value="rejected">Rejeitado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">Tipo:</Label>
                    <Select value={userFilter.role || 'all'} onValueChange={(v) => setUserFilter(prev => ({ ...prev, role: v === 'all' ? '' : v }))}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="sender">Remetente</SelectItem>
                        <SelectItem value="carrier">Transportador</SelectItem>
                        <SelectItem value="both">Ambos</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-sm text-muted-foreground self-center">
                    Exibindo {filteredUsers.length} de {allUsers.length} usuários
                  </p>
                </div>

                {filteredUsers.length === 0 ? (
                  <div className="text-center py-12">
                    <Users size={48} className="mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Nenhum usuário encontrado</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredUsers.map((u) => {
                      const statusBadge = getVerificationStatusBadge(u.verification_status);
                      const roleBadge = getRoleBadge(u.role);
                      return (
                        <Card key={u.id} className="border hover:border-jungle/30 transition-colors">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between gap-4 flex-wrap">
                              <div className="flex items-center gap-3 min-w-[200px]">
                                <div className="w-10 h-10 bg-jungle/10 rounded-full flex items-center justify-center">
                                  <Users size={20} className="text-jungle" />
                                </div>
                                <div>
                                  <p className="font-semibold">{u.name}</p>
                                  <p className="text-sm text-muted-foreground">{u.email}</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <Badge className={roleBadge.color}>{roleBadge.label}</Badge>
                                <Badge className={statusBadge.color}>{statusBadge.label}</Badge>
                              </div>

                              <div className="flex items-center gap-4 text-sm">
                                <div className="text-center">
                                  <p className="font-semibold">{u.total_deliveries || 0}</p>
                                  <p className="text-xs text-muted-foreground">Entregas</p>
                                </div>
                                <div className="text-center">
                                  <p className="font-semibold">⭐ {u.rating?.toFixed(1) || '0.0'}</p>
                                  <p className="text-xs text-muted-foreground">Avaliação</p>
                                </div>
                              </div>

                              <div className="text-sm">
                                <p className="text-xs text-muted-foreground">Cadastrado em</p>
                                <p>{u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : 'N/A'}</p>
                              </div>

                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openUserDetailDialog(u.id)}
                                >
                                  Detalhes
                                </Button>
                                {u.role !== 'admin' && (
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => openDeleteUserDialog(u)}
                                  >
                                    Excluir
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* Flagged Vehicles Tab */}
            {activeTab === 'flagged-vehicles' && (
              <>
                {/* Vehicle Statistics Summary */}
                {vehicleStats && (
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-lg text-center">
                      <p className="text-2xl font-bold">{vehicleStats.total_vehicles}</p>
                      <p className="text-xs text-muted-foreground">Total de Veículos</p>
                    </div>
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg text-center">
                      <p className="text-2xl font-bold text-yellow-600">{vehicleStats.flagged_vehicles}</p>
                      <p className="text-xs text-muted-foreground">Flaggeados</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg text-center">
                      <p className="text-2xl font-bold text-green-600">{vehicleStats.verified_vehicles}</p>
                      <p className="text-xs text-muted-foreground">Verificados</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg text-center">
                      <p className="text-2xl font-bold text-blue-600">{vehicleStats.flagged_percentage}%</p>
                      <p className="text-xs text-muted-foreground">Taxa de Desvio</p>
                    </div>
                  </div>
                )}

                {flaggedVehicles.length === 0 ? (
                  <div className="text-center py-12">
                    <Car size={48} className="mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Nenhum veículo com desvio de capacidade</p>
                    <p className="text-xs text-muted-foreground mt-1">Ótimo! Todos os veículos estão dentro das expectativas.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {flaggedVehicles.map((vehicle) => (
                      <Card key={vehicle.id} className="border-yellow-200 bg-yellow-50/30 dark:bg-yellow-900/10">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="h-12 w-12 bg-yellow-100 rounded-full flex items-center justify-center">
                                <Car size={24} className="text-yellow-600" />
                              </div>
                              <div>
                                <p className="font-bold">{vehicle.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {vehicle.brand} {vehicle.model} {vehicle.year && `(${vehicle.year})`}
                                </p>
                                {vehicle.license_plate && (
                                  <Badge variant="outline" className="mt-1 font-mono text-xs">
                                    {vehicle.license_plate}
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <div className="text-center">
                              <p className="text-lg font-bold">{vehicle.capacity_weight_kg}kg / {vehicle.capacity_volume_liters}L</p>
                              <p className="text-xs text-muted-foreground">Capacidade informada</p>
                            </div>

                            {vehicle.deviation_details && (
                              <div className="text-center bg-yellow-100 dark:bg-yellow-900/30 px-4 py-2 rounded-lg">
                                <p className="text-sm font-bold text-yellow-700">
                                  Peso: +{vehicle.deviation_details.weight_deviation_percent?.toFixed(0)}%
                                </p>
                                <p className="text-sm font-bold text-yellow-700">
                                  Volume: +{vehicle.deviation_details.volume_deviation_percent?.toFixed(0)}%
                                </p>
                                <p className="text-xs text-muted-foreground">Desvio da mediana</p>
                              </div>
                            )}

                            <div className="text-sm">
                              <p className="text-xs text-muted-foreground">Proprietário</p>
                              <p className="font-medium">{vehicle.owner?.name || 'Desconhecido'}</p>
                              <p className="text-xs text-muted-foreground">{vehicle.owner?.email}</p>
                            </div>

                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-green-400 text-green-600 hover:bg-green-50"
                                onClick={() => handleClearVehicleFlag(vehicle.id)}
                              >
                                <Check size={16} className="mr-1" />
                                Aprovar
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-blue-400 text-blue-600 hover:bg-blue-50"
                                onClick={() => handleVerifyVehicle(vehicle.id)}
                              >
                                <ShieldCheck size={16} className="mr-1" />
                                Verificar
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Disputes Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gavel size={24} weight="duotone" className="text-jungle" />
              Disputas
            </CardTitle>
            <CardDescription>Gerencie conflitos entre usuários</CardDescription>
          </CardHeader>
          <CardContent>
            {disputes.length === 0 ? (
              <div className="text-center py-12">
                <Gavel size={48} className="mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhuma disputa aberta</p>
              </div>
            ) : (
              <div className="space-y-4">
                {disputes.map((dispute) => (
                  <Card key={dispute.id} className="border-2" data-testid={`dispute-${dispute.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Badge 
                              className={
                                dispute.status === 'open' ? 'bg-red-100 text-red-700' :
                                dispute.status === 'under_review' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-green-100 text-green-700'
                              }
                            >
                              {dispute.status === 'open' ? 'Aberta' :
                               dispute.status === 'under_review' ? 'Em Análise' :
                               'Resolvida'}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {dispute.created_at && new Date(dispute.created_at).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                          <p className="font-semibold">{dispute.reason}</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Aberta por: {dispute.opened_by_name} ({dispute.opened_by_role === 'sender' ? 'Remetente' : 'Transportador'})
                          </p>
                          <p className="text-sm mt-1">
                            <span className="text-muted-foreground">Partes:</span> {dispute.sender_name} ↔ {dispute.carrier_name}
                          </p>
                          <p className="text-sm">
                            <span className="text-muted-foreground">Valor:</span> R$ {dispute.match_value?.toFixed(2)}
                          </p>
                        </div>
                        <Button onClick={() => handleViewDispute(dispute)} className="bg-jungle hover:bg-jungle-800">
                          Ver Detalhes
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* --- NOVO MODAL DE LIGHTBOX (VISUALIZAÇÃO DE IMAGEM) --- */}
      <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
        <DialogContent className="max-w-screen-xl h-[95vh] flex flex-col p-0 gap-0 overflow-hidden bg-black/95 border-none text-white shadow-2xl">
          {/* Header do Modal */}
          <div className="flex items-center justify-between p-4 bg-black/60 backdrop-blur-sm z-20 absolute top-0 w-full">
            <h3 className="font-semibold text-lg">{previewImage.title}</h3>
            <div className="flex items-center gap-2">
               <Button size="icon" variant="ghost" className="text-white hover:bg-white/20 rounded-full" onClick={() => handleZoom(-0.5)}>
                  <MagnifyingGlassMinus size={24} />
               </Button>
               <span className="text-sm font-mono min-w-[3ch] text-center">{Math.round(zoomLevel * 100)}%</span>
               <Button size="icon" variant="ghost" className="text-white hover:bg-white/20 rounded-full" onClick={() => handleZoom(0.5)}>
                  <MagnifyingGlassPlus size={24} />
               </Button>
               <div className="h-6 w-px bg-white/20 mx-2"></div>
               <Button size="icon" variant="ghost" className="text-white hover:bg-white/20 rounded-full" onClick={() => setShowImageDialog(false)}>
                  <X size={24} />
               </Button>
            </div>
          </div>

          {/* Área da Imagem */}
          <div className="flex-1 flex items-center justify-center overflow-auto p-4 cursor-grab active:cursor-grabbing bg-neutral-900 w-full h-full">
            <img 
              src={previewImage.url} 
              alt={previewImage.title}
              style={{ transform: `scale(${zoomLevel})` }}
              className="max-h-full max-w-full object-contain transition-transform duration-200 ease-out"
              draggable="false"
            />
          </div>

          {/* Footer com Ações Rápidas */}
          {selectedVerification && (
            <div className="p-4 bg-white dark:bg-zinc-900 flex flex-wrap justify-between items-center border-t border-white/10 z-20">
               <div className="text-black dark:text-white mb-2 md:mb-0">
                  <p className="text-sm font-medium text-black">Verificando: <span className="font-bold">{selectedVerification.user_name}</span></p>
                  <p className="text-xs text-muted-foreground">{selectedVerification.cpf}</p>
               </div>
               <div className="flex gap-3 w-full md:w-auto">
                  <Button 
                      variant="destructive" 
                      onClick={() => handleQuickActionFromImage('reject')}
                      className="flex-1 md:flex-none"
                  >
                      <X size={18} className="mr-2" /> Rejeitar
                  </Button>
                  <Button 
                      className="bg-jungle hover:bg-jungle-800 text-white flex-1 md:flex-none" 
                      onClick={() => handleQuickActionFromImage('approve')}
                  >
                      <Check size={18} className="mr-2" /> Aprovar
                  </Button>
               </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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

      {/* Dispute Detail Dialog */}
      <Dialog open={showDisputeDialog} onOpenChange={setShowDisputeDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gavel size={24} />
              Detalhes da Disputa
            </DialogTitle>
            <DialogDescription>
              Analise as informações e resolva o conflito
            </DialogDescription>
          </DialogHeader>
          
          {selectedDispute && (
            <div className="space-y-6">
              {/* Status and Basic Info */}
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Remetente</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="font-semibold">{selectedDispute.sender?.name}</p>
                    <p className="text-sm text-muted-foreground">{selectedDispute.sender?.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">⭐ {selectedDispute.sender?.rating?.toFixed(1) || 'N/A'}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {selectedDispute.sender?.total_deliveries || 0} entregas
                      </span>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Transportador</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="font-semibold">{selectedDispute.carrier?.name}</p>
                    <p className="text-sm text-muted-foreground">{selectedDispute.carrier?.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">⭐ {selectedDispute.carrier?.rating?.toFixed(1) || 'N/A'}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {selectedDispute.carrier?.total_deliveries || 0} entregas
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Dispute Details */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Motivo da Disputa</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-semibold">{selectedDispute.reason}</p>
                  <p className="text-sm mt-2">{selectedDispute.description}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Aberta por: {selectedDispute.opened_by_name} ({selectedDispute.opened_by_role === 'sender' ? 'Remetente' : 'Transportador'})
                  </p>
                </CardContent>
              </Card>

              {/* Chat History */}
              {selectedDispute.chat_messages?.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <ChatCircle size={16} />
                      Histórico de Mensagens
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-48 overflow-y-auto space-y-2 bg-muted p-3 rounded-lg">
                      {selectedDispute.chat_messages.map((msg, idx) => (
                        <div key={idx} className="text-sm">
                          <span className="font-medium">{msg.sender_name}:</span>{' '}
                          <span>{msg.content}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {msg.timestamp && new Date(msg.timestamp).toLocaleString('pt-BR')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Admin Notes */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Notas do Admin</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedDispute.admin_notes?.length > 0 ? (
                    <div className="space-y-2 mb-4">
                      {selectedDispute.admin_notes.map((note, idx) => (
                        <div key={idx} className="bg-muted p-2 rounded text-sm">
                          <span className="font-medium">{note.admin_name}:</span> {note.content}
                          <span className="text-xs text-muted-foreground ml-2">
                            {note.timestamp && new Date(note.timestamp).toLocaleString('pt-BR')}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mb-4">Nenhuma nota adicionada</p>
                  )}
                  
                  <div className="flex gap-2">
                    <Input
                      value={disputeNote}
                      onChange={(e) => setDisputeNote(e.target.value)}
                      placeholder="Adicionar nota..."
                      className="flex-1"
                    />
                    <Button onClick={handleAddDisputeNote} variant="outline">
                      Adicionar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Resolution */}
              {selectedDispute.status === 'open' || selectedDispute.status === 'under_review' ? (
                <Card className="border-jungle">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Resolver Disputa</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Tipo de Resolução</Label>
                      <Select value={resolutionType} onValueChange={setResolutionType}>
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sender">A favor do Remetente</SelectItem>
                          <SelectItem value="carrier">A favor do Transportador</SelectItem>
                          <SelectItem value="split">Divisão (50/50)</SelectItem>
                          <SelectItem value="dismissed">Disputa Improcedente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label>Valor do Reembolso (se aplicável)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        placeholder="0.00"
                        className="mt-2"
                      />
                    </div>
                    
                    <div>
                      <Label>Justificativa da Resolução</Label>
                      <Textarea
                        value={disputeNote}
                        onChange={(e) => setDisputeNote(e.target.value)}
                        placeholder="Explique a decisão..."
                        rows={3}
                        className="mt-2"
                      />
                    </div>
                    
                    <Button onClick={handleResolveDispute} className="w-full bg-jungle hover:bg-jungle-800">
                      Confirmar Resolução
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="p-4">
                    <p className="font-semibold text-green-800">Disputa Resolvida</p>
                    <p className="text-sm text-green-700 mt-1">
                      Tipo: {selectedDispute.resolution?.type === 'sender' ? 'A favor do Remetente' :
                             selectedDispute.resolution?.type === 'carrier' ? 'A favor do Transportador' :
                             selectedDispute.resolution?.type === 'split' ? 'Divisão' : 'Improcedente'}
                    </p>
                    {selectedDispute.resolution?.notes && (
                      <p className="text-sm text-green-700 mt-1">{selectedDispute.resolution.notes}</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke Verification Dialog */}
      <Dialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Revogar Verificação</DialogTitle>
            <DialogDescription>
              Esta ação irá revogar a verificação do usuário. Ele não poderá mais usar as funcionalidades da plataforma até ser verificado novamente.
            </DialogDescription>
          </DialogHeader>
          {selectedVerification && (
            <div className="space-y-4">
              <div className="bg-muted/20 p-4 rounded-lg">
                <p className="font-semibold">{selectedVerification.user_name}</p>
                <p className="text-sm text-muted-foreground">{selectedVerification.user_email}</p>
                <p className="text-sm font-mono mt-1">CPF: {selectedVerification.cpf}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Motivo da Revogação *</label>
                <Textarea
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="Descreva o motivo da revogação..."
                  rows={3}
                  className="mt-2"
                />
              </div>
              <div className="flex gap-4">
                <Button variant="outline" className="flex-1" onClick={() => setShowRevokeDialog(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleRevokeVerification} 
                  variant="destructive"
                  className="flex-1"
                  disabled={!revokeReason.trim()}
                >
                  Confirmar Revogação
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* User Detail Dialog */}
      <Dialog open={showUserDetailDialog} onOpenChange={setShowUserDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Usuário</DialogTitle>
            <DialogDescription>Informações completas do usuário</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              {/* Basic Info */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Informações Básicas</CardTitle>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Nome</p>
                    <p className="font-medium">{selectedUser.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="font-medium">{selectedUser.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Telefone</p>
                    <p className="font-medium">{selectedUser.phone || 'Não informado'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tipo de Conta</p>
                    <Badge className={getRoleBadge(selectedUser.role).color}>
                      {getRoleBadge(selectedUser.role).label}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status de Verificação</p>
                    <Badge className={getVerificationStatusBadge(selectedUser.verification_status).color}>
                      {getVerificationStatusBadge(selectedUser.verification_status).label}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Nível de Confiança</p>
                    <Badge className={getTrustLevelColor(selectedUser.trust_level)}>
                      {getTrustLevelName(selectedUser.trust_level)}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Data de Cadastro</p>
                    <p className="font-medium">
                      {selectedUser.created_at 
                        ? new Date(selectedUser.created_at).toLocaleDateString('pt-BR', { 
                            day: '2-digit', month: '2-digit', year: 'numeric', 
                            hour: '2-digit', minute: '2-digit' 
                          })
                        : 'N/A'}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Stats */}
              {selectedUser.stats && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Estatísticas</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-jungle">{selectedUser.total_deliveries || 0}</p>
                      <p className="text-xs text-muted-foreground">Entregas</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">⭐ {selectedUser.rating?.toFixed(1) || '0.0'}</p>
                      <p className="text-xs text-muted-foreground">Avaliação</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{selectedUser.stats.trips_created || 0}</p>
                      <p className="text-xs text-muted-foreground">Viagens</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{selectedUser.stats.shipments_created || 0}</p>
                      <p className="text-xs text-muted-foreground">Envios</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Verification Info */}
              {selectedUser.verification && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Dados de Verificação</CardTitle>
                  </CardHeader>
                  <CardContent className="grid md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">CPF</p>
                      <p className="font-mono font-medium">{selectedUser.verification.cpf || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Data de Nascimento</p>
                      <p className="font-medium">
                        {selectedUser.verification.birth_date 
                          ? new Date(selectedUser.verification.birth_date).toLocaleDateString('pt-BR')
                          : 'N/A'}
                      </p>
                    </div>
                    {selectedUser.verification.address && (
                      <div className="md:col-span-2">
                        <p className="text-xs text-muted-foreground">Endereço</p>
                        <p className="font-medium">
                          {selectedUser.verification.address.street}, {selectedUser.verification.address.city} - {selectedUser.verification.address.state}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Enviado em</p>
                      <p className="font-medium">
                        {selectedUser.verification.submitted_at 
                          ? new Date(selectedUser.verification.submitted_at).toLocaleDateString('pt-BR')
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Revisado em</p>
                      <p className="font-medium">
                        {selectedUser.verification.reviewed_at 
                          ? new Date(selectedUser.verification.reviewed_at).toLocaleDateString('pt-BR')
                          : 'N/A'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-4 pt-4">
                <Button variant="outline" className="flex-1" onClick={() => setShowUserDetailDialog(false)}>
                  Fechar
                </Button>
                {selectedUser.role !== 'admin' && (
                  <Button 
                    variant="destructive"
                    className="flex-1"
                    onClick={() => {
                      setShowUserDetailDialog(false);
                      openDeleteUserDialog(selectedUser);
                    }}
                  >
                    Excluir Usuário
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={showDeleteUserDialog} onOpenChange={setShowDeleteUserDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Excluir Usuário</DialogTitle>
            <DialogDescription>
              Esta ação é irreversível. Todos os dados do usuário serão permanentemente excluídos.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                <p className="font-semibold text-red-800">{selectedUser.name}</p>
                <p className="text-sm text-red-700">{selectedUser.email}</p>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>Atenção:</strong> Serão excluídos:
                </p>
                <ul className="text-sm text-yellow-700 list-disc list-inside mt-2">
                  <li>Dados de verificação</li>
                  <li>Viagens criadas</li>
                  <li>Envios criados</li>
                  <li>Mensagens enviadas</li>
                </ul>
              </div>
              <div>
                <label className="text-sm font-medium">Motivo da Exclusão (opcional)</label>
                <Textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Descreva o motivo da exclusão..."
                  rows={2}
                  className="mt-2"
                />
              </div>
              <div className="flex gap-4">
                <Button variant="outline" className="flex-1" onClick={() => setShowDeleteUserDialog(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleDeleteUser} 
                  variant="destructive"
                  className="flex-1"
                >
                  Confirmar Exclusão
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;
