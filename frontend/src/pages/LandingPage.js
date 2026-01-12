import React from 'react';
import { Link } from 'react-router-dom';
import { Package, TruckIcon, Shield, MapPin, Clock, Star } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Glass Header */}
      <header className="sticky top-0 z-50 glass border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={32} weight="duotone" className="text-jungle" />
            <span className="text-2xl font-heading font-bold text-jungle">Levva</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login">
              <Button variant="ghost" data-testid="header-login-btn">Entrar</Button>
            </Link>
            <Link to="/register">
              <Button className="bg-jungle hover:bg-jungle-800" data-testid="header-register-btn">
                Cadastrar
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl lg:text-6xl font-heading font-bold text-foreground mb-6">
              Entregue e transporte com <span className="text-jungle">confiança</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              Conectamos pessoas que já estão viajando com quem precisa enviar pequenos volumes. 
              Economize dinheiro, otimize rotas e construa uma rede de confiança.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/register">
                <Button size="lg" className="bg-jungle hover:bg-jungle-800" data-testid="hero-cta-btn">
                  Começar agora
                </Button>
              </Link>
              <Button size="lg" variant="outline" data-testid="hero-learn-more-btn">
                Saiba mais
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            <img
              src="https://images.unsplash.com/photo-1646920912229-bc0d5d94e68b?crop=entropy&cs=srgb&fm=jpg&q=85"
              alt="Entregador sorrindo"
              className="rounded-2xl shadow-2xl w-full h-[500px] object-cover"
            />
            <div className="absolute -bottom-6 -left-6 bg-white rounded-xl shadow-lg p-6 max-w-xs">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-lime/20 rounded-full flex items-center justify-center">
                  <Shield size={24} weight="duotone" className="text-lime" />
                </div>
                <div>
                  <p className="font-semibold text-sm">100% Seguro</p>
                  <p className="text-xs text-muted-foreground">Sistema de escrow</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-muted py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-heading font-bold mb-4">Como funciona</h2>
            <p className="text-muted-foreground text-lg">Simples, seguro e transparente</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <MapPin size={32} weight="duotone" className="text-jungle" />,
                title: 'Publique sua rota',
                description: 'Transportadores informam origem, destino e espaço disponível'
              },
              {
                icon: <Package size={32} weight="duotone" className="text-jungle" />,
                title: 'Crie seu envio',
                description: 'Remetentes cadastram pacotes com fotos e declaração'
              },
              {
                icon: <TruckIcon size={32} weight="duotone" className="text-jungle" />,
                title: 'Combine e entregue',
                description: 'Nossa IA conecta rotas compatíveis automaticamente'
              }
            ].map((feature, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="bg-white rounded-xl p-8 shadow-sm card-hover"
                data-testid={`feature-card-${idx}`}
              >
                <div className="mb-4">{feature.icon}</div>
                <h3 className="text-xl font-heading font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="container mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <img
            src="https://images.unsplash.com/photo-1659353739926-4c7df1a645a6?crop=entropy&cs=srgb&fm=jpg&q=85"
            alt="Pessoa segurando pacote com segurança"
            className="rounded-2xl shadow-xl w-full h-[400px] object-cover"
          />
          <div>
            <h2 className="text-4xl font-heading font-bold mb-6">
              Segurança em primeiro lugar
            </h2>
            <div className="space-y-4">
              {[
                { icon: Shield, text: 'Verificação de identidade com documento e selfie' },
                { icon: Star, text: 'Sistema de avaliações mútuas' },
                { icon: Clock, text: 'Pagamento em escrow - liberado após entrega' },
                { icon: Package, text: 'Fotos obrigatórias em coleta e entrega' }
              ].map((item, idx) => (
                <div key={idx} className="flex items-start gap-4" data-testid={`trust-item-${idx}`}>
                  <div className="w-10 h-10 bg-jungle/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <item.icon size={20} weight="duotone" className="text-jungle" />
                  </div>
                  <p className="text-foreground pt-2">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-jungle text-white py-20">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-4xl font-heading font-bold mb-6">
            Pronto para começar?
          </h2>
          <p className="text-lg mb-8 text-white/90">
            Junte-se a milhares de brasileiros que já confiam na Levva
          </p>
          <Link to="/register">
            <Button 
              size="lg" 
              className="bg-white text-jungle hover:bg-white/90"
              data-testid="cta-register-btn"
            >
              Criar conta grátis
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-muted py-8">
        <div className="container mx-auto px-6 text-center text-muted-foreground">
          <p>© 2025 Levva. Todos os direitos reservados.</p>
          <p className="text-sm mt-2">Plataforma de intermediação tecnológica.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;