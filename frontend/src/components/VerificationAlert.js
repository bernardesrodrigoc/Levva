import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Warning, ShieldCheck, Clock } from '@phosphor-icons/react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export const VerificationAlert = ({ verificationStatus }) => {
  const navigate = useNavigate();

  if (verificationStatus === 'verified') {
    return (
      <Alert className="border-jungle bg-jungle/5" data-testid="verified-alert">
        <ShieldCheck size={20} className="text-jungle" />
        <AlertTitle className="text-jungle">Identidade Verificada</AlertTitle>
        <AlertDescription className="text-jungle/80">
          Sua identidade foi verificada. Você pode usar todas as funcionalidades da plataforma.
        </AlertDescription>
      </Alert>
    );
  }

  if (verificationStatus === 'pending') {
    return (
      <Alert className="border-blue-500 bg-blue-50" data-testid="pending-alert">
        <Clock size={20} className="text-blue-600" />
        <AlertTitle className="text-blue-800">Verificação em Análise</AlertTitle>
        <AlertDescription className="text-blue-700">
          Seus documentos estão sendo analisados. Isso pode levar até 24 horas.
        </AlertDescription>
      </Alert>
    );
  }

  // Not verified yet
  return (
    <Alert className="border-red-500 bg-red-50" data-testid="not-verified-alert">
      <Warning size={20} className="text-red-600" />
      <div className="flex items-start justify-between flex-1">
        <div>
          <AlertTitle className="text-red-800">Verificação Pendente</AlertTitle>
          <AlertDescription className="text-red-700">
            Para sua segurança e dos outros usuários, você precisa verificar sua identidade antes de criar viagens ou envios.
          </AlertDescription>
        </div>
        <Button
          onClick={() => navigate('/verificacao')}
          className="bg-red-600 hover:bg-red-700 ml-4"
          data-testid="verify-now-btn"
        >
          Verificar Agora
        </Button>
      </div>
    </Alert>
  );
};