import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, User, Star, ShieldCheck, MapPin, Phone, Calendar, Medal } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
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

  useEffect(() => {
    fetchProfileData();
  }, []);

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass border-b sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={32} weight="duotone" className="text-jungle" />
            <span className="text-2xl font-heading font-bold text-jungle">Levva</span>
          </div>
          <Button variant="ghost" onClick={() => navigate('/dashboard')} data-testid="back-to-dashboard-btn">
            Voltar ao Dashboard
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 max-w-6xl">
        {/* Profile Header */}
        <Card className="mb-8">
          <CardContent className="p-8">
            <div className="flex flex-col md:flex-row items-start gap-8">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-4">
                <Avatar className="w-32 h-32">
                  <AvatarImage src={profile?.profile_photo_url} />
                  <AvatarFallback className="bg-jungle/10 text-jungle text-3xl">
                    {profile?.name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/verificacao')}
                  data-testid="edit-profile-btn"
                >
                  Editar Perfil
                </Button>
              </div>

              {/* Info */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <h1 className="text-3xl font-heading font-bold">{profile?.name}</h1>
                  {profile?.verification_status === 'verified' && (
                    <ShieldCheck size={28} weight="fill" className="text-jungle" />
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 mb-6">
                  <Badge className={getTrustBadgeColor(profile?.trust_level)}>
                    <Medal size={16} className="mr-2" />
                    {getTrustLevelName(profile?.trust_level)}
                  </Badge>
                  <Badge variant="outline">{getRoleLabel(profile?.role)}</Badge>
                  {profile?.rating > 0 && (
                    <div className="flex items-center gap-1 bg-yellow-50 px-3 py-1 rounded-full border border-yellow-200">
                      <Star size={16} weight="fill" className="text-yellow-500" />
                      <span className="font-semibold text-yellow-700">{profile?.rating.toFixed(1)}</span>
                    </div>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-4 mb-6">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone size={18} />
                    <span>{profile?.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar size={18} />
                    <span>Membro desde {new Date(profile?.created_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold text-foreground">{stats?.trips || 0}</p>
                    <p className="text-sm text-muted-foreground">Viagens</p>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold text-foreground">{stats?.shipments || 0}</p>
                    <p className="text-sm text-muted-foreground">Envios</p>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold text-foreground">{stats?.deliveries || 0}</p>
                    <p className="text-sm text-muted-foreground">Entregas</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ratings Section */}
        <Card>
          <CardHeader>
            <CardTitle>Avaliações Recebidas</CardTitle>
            <CardDescription>
              {ratings.length > 0 ? `${ratings.length} avaliações` : 'Nenhuma avaliação ainda'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ratings.length === 0 ? (
              <div className="text-center py-12">
                <Star size={48} className="mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Você ainda não tem avaliações</p>
                <p className="text-sm text-muted-foreground">Complete sua primeira entrega para receber avaliações</p>
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
    </div>
  );
};

export default ProfilePage;