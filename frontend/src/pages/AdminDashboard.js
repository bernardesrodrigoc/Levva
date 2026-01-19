import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Package, Users, TruckIcon, ShieldCheck, Warning, Check, X, Gavel, 
  ChatCircle, MagnifyingGlassPlus, MagnifyingGlassMinus, ArrowsOut 
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
  const [disputes, setDisputes] = useState([]);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' or 'approved'
  
  // Estados de Seleção e Modais
  const [selectedVerification, setSelectedVerification] = useState(null);
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [showDialog, setShowDialog] = useState(false); // Modal de Confirmação de Verificação
  const [showDisputeDialog, setShowDisputeDialog] = useState(false); // Modal de Detalhes da Disputa
  const [showRevokeDialog, setShowRevokeDialog] = useState(false); // Modal de Revogar
  
  // --- ESTADOS DO LIGHTBOX (NOVO) ---
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [previewImage, setPreviewImage] = useState({ url: '', title: '' });
  const [zoomLevel, setZoomLevel] = useState(1);

  // Estados de Formulário
  const [reviewAction, setReviewAction] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [revokeReason, setRevokeReason] = useState('');
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
      
      const [statsRes, verificationsRes, approvedRes, disputesRes] = await Promise.all([
        axios.get(`${API}/admin/stats`, { headers }),
        axios.get(`${API}/admin/verifications/pending`, { headers }),
        axios.get(`${API}/admin/verifications/approved`, { headers }),
        axios.get(`${API}/admin/disputes`, { headers }).catch(() => ({ data: [] }))
      ]);
      
      setStats(statsRes.data);
      setPendingVerifications(verificationsRes.data);
      setApprovedVerifications(approvedRes.data);
      setDisputes(disputesRes.data);
      
    } catch (error) {
      console.error('Error fetching admin data:', error);
      toast.error('Erro ao carregar dados: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
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
            <div className="flex gap-2 mt-4">
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
    </div>
  );
};

export default AdminDashboard;
