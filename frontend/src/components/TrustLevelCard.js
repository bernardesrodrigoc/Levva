import React, { useState, useEffect } from 'react';
import { Shield, Star, TrendUp, Trophy, CheckCircle } from '@phosphor-icons/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LEVEL_COLORS = {
  gray: 'bg-gray-100 text-gray-700 border-gray-300',
  blue: 'bg-blue-100 text-blue-700 border-blue-300',
  green: 'bg-green-100 text-green-700 border-green-300',
  purple: 'bg-purple-100 text-purple-700 border-purple-300',
  gold: 'bg-yellow-100 text-yellow-700 border-yellow-300'
};

const LEVEL_ICONS = {
  level_1: Shield,
  level_2: CheckCircle,
  level_3: Star,
  level_4: TrendUp,
  level_5: Trophy
};

const TrustLevelCard = ({ compact = false }) => {
  const { token } = useAuth();
  const [trustData, setTrustData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrustLevel();
  }, []);

  const fetchTrustLevel = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${API}/users/trust-level`, { headers });
      setTrustData(response.data);
    } catch (error) {
      console.error('Error fetching trust level:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className={compact ? 'p-4' : ''}>
        <CardContent className="flex items-center justify-center py-6">
          <div className="animate-pulse text-muted-foreground">Carregando...</div>
        </CardContent>
      </Card>
    );
  }

  if (!trustData) return null;

  const LevelIcon = LEVEL_ICONS[trustData.current_level] || Shield;
  const colorClass = LEVEL_COLORS[trustData.badge_color] || LEVEL_COLORS.gray;
  
  // Calculate progress to next level
  let progressPercent = 100;
  if (!trustData.next_level.at_max_level && trustData.next_level.deliveries_needed > 0) {
    const currentDeliveries = trustData.stats.total_deliveries;
    const nextLevelDeliveries = currentDeliveries + trustData.next_level.deliveries_needed;
    progressPercent = Math.min(100, (currentDeliveries / nextLevelDeliveries) * 100);
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-3 p-3 rounded-lg border ${colorClass}`}>
        <LevelIcon size={24} weight="duotone" />
        <div>
          <p className="font-semibold text-sm">{trustData.level_name}</p>
          <p className="text-xs opacity-80">{trustData.level_description}</p>
        </div>
      </div>
    );
  }

  return (
    <Card data-testid="trust-level-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Shield size={24} weight="duotone" className="text-jungle" />
            Nível de Confiança
          </CardTitle>
          <Badge className={colorClass}>
            <LevelIcon size={16} className="mr-1" />
            {trustData.level_name}
          </Badge>
        </div>
        <CardDescription>{trustData.level_description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-muted rounded-lg p-3">
            <p className="text-2xl font-bold">{trustData.stats.total_deliveries}</p>
            <p className="text-xs text-muted-foreground">Entregas realizadas</p>
          </div>
          <div className="bg-muted rounded-lg p-3">
            <div className="flex items-center gap-1">
              <Star size={20} weight="fill" className="text-yellow-500" />
              <span className="text-2xl font-bold">
                {trustData.stats.rating > 0 ? trustData.stats.rating.toFixed(1) : '-'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Avaliação média</p>
          </div>
        </div>

        {/* Limits */}
        <div className="border rounded-lg p-3">
          <p className="text-sm font-semibold mb-2">Seus Limites Atuais</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Valor máx. envio:</span>{' '}
              <span className="font-medium">
                {trustData.limits.max_shipment_value 
                  ? `R$ ${trustData.limits.max_shipment_value.toFixed(0)}` 
                  : 'Ilimitado'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Peso máx.:</span>{' '}
              <span className="font-medium">
                {trustData.limits.max_weight_kg 
                  ? `${trustData.limits.max_weight_kg} kg` 
                  : 'Ilimitado'}
              </span>
            </div>
          </div>
        </div>

        {/* Next Level Progress */}
        {!trustData.next_level.at_max_level && (
          <div className="border rounded-lg p-3 bg-gradient-to-r from-jungle/5 to-lime/5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">Próximo nível: {trustData.next_level.next_level_name}</p>
              <span className="text-xs text-muted-foreground">
                {Math.round(progressPercent)}%
              </span>
            </div>
            <Progress value={progressPercent} className="h-2 mb-2" />
            {trustData.next_level.requirements.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Falta: </span>
                {trustData.next_level.requirements.join(' • ')}
              </div>
            )}
            {trustData.next_level.benefits && (
              <div className="mt-2 text-xs">
                <span className="font-medium text-jungle">Benefícios: </span>
                Envios até R$ {trustData.next_level.benefits.max_shipment_value === Infinity 
                  ? 'ilimitado' 
                  : trustData.next_level.benefits.max_shipment_value.toFixed(0)
                }
              </div>
            )}
          </div>
        )}

        {trustData.next_level.at_max_level && (
          <div className="border rounded-lg p-3 bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200">
            <div className="flex items-center gap-2">
              <Trophy size={20} weight="fill" className="text-yellow-600" />
              <p className="text-sm font-semibold text-yellow-800">
                Parabéns! Você está no nível máximo!
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TrustLevelCard;
