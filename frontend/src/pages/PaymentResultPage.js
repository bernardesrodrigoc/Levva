import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Package, CheckCircle, XCircle, Clock } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const PaymentResultPage = ({ type }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [countdown, setCountdown] = useState(5);
  
  const externalReference = searchParams.get('external_reference');
  const paymentId = searchParams.get('payment_id');
  const status = searchParams.get('status');

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate(externalReference ? `/match/${externalReference}` : '/dashboard');
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate, externalReference]);

  const configs = {
    success: {
      icon: CheckCircle,
      iconColor: 'text-green-500',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      title: 'Pagamento Aprovado!',
      description: 'Seu pagamento foi processado com sucesso. O valor ficará em escrow até a entrega ser confirmada.',
      buttonText: 'Ver Detalhes da Entrega'
    },
    failure: {
      icon: XCircle,
      iconColor: 'text-red-500',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      title: 'Pagamento Não Aprovado',
      description: 'Houve um problema com seu pagamento. Por favor, tente novamente ou use outro método de pagamento.',
      buttonText: 'Tentar Novamente'
    },
    pending: {
      icon: Clock,
      iconColor: 'text-yellow-500',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      title: 'Pagamento Pendente',
      description: 'Seu pagamento está sendo processado. Você receberá uma notificação quando for aprovado.',
      buttonText: 'Ver Status'
    }
  };

  const config = configs[type] || configs.pending;
  const Icon = config.icon;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass border-b sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={32} weight="duotone" className="text-jungle" />
            <span className="text-2xl font-heading font-bold text-jungle">Levva</span>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-16 max-w-lg">
        <Card className={`${config.bgColor} ${config.borderColor} border-2`}>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Icon size={80} weight="duotone" className={config.iconColor} />
            </div>
            <CardTitle className="text-2xl">{config.title}</CardTitle>
            <CardDescription className="text-base mt-2">
              {config.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {paymentId && (
              <div className="text-center text-sm text-muted-foreground">
                ID do Pagamento: {paymentId}
              </div>
            )}
            
            <div className="text-center text-sm text-muted-foreground">
              Redirecionando em {countdown} segundos...
            </div>
            
            <Button
              onClick={() => navigate(externalReference ? `/match/${externalReference}` : '/dashboard')}
              className="w-full h-12 bg-jungle hover:bg-jungle-800"
              data-testid="payment-result-btn"
            >
              {config.buttonText}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export const PaymentSuccessPage = () => <PaymentResultPage type="success" />;
export const PaymentFailurePage = () => <PaymentResultPage type="failure" />;
export const PaymentPendingPage = () => <PaymentResultPage type="pending" />;

export default PaymentResultPage;
