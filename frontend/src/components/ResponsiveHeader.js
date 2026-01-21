import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Package, List, X, House, User, SignOut, Bell, Gear } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import NotificationBell from './NotificationBell';

/**
 * Responsive Header Component - Mobile First Design
 * - Mobile: Hamburger menu with slide-out drawer
 * - Desktop: Full navigation bar
 */
const ResponsiveHeader = ({ 
  showBackButton = false, 
  backPath = '/dashboard',
  title = null,
  transparent = false,
  showNotifications = true
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getTrustBadgeColor = (level) => {
    const colors = {
      level_1: 'bg-slate-100 text-slate-700',
      level_2: 'bg-blue-100 text-blue-700',
      level_3: 'bg-lime-100 text-lime-700',
      level_4: 'bg-jungle-100 text-jungle-700',
      level_5: 'bg-yellow-100 text-yellow-700'
    };
    return colors[level] || colors.level_1;
  };

  const navLinks = [
    { path: '/dashboard', label: 'Início', icon: House },
    { path: '/viagens', label: 'Viagens', icon: Package },
    { path: '/envios', label: 'Envios', icon: Package },
    { path: '/sugestoes', label: 'Sugestões', icon: Bell },
    { path: '/perfil', label: 'Perfil', icon: User },
  ];

  if (user?.role === 'admin') {
    navLinks.push({ path: '/admin', label: 'Admin', icon: Gear });
  }

  return (
    <>
      {/* Header */}
      <header className={`sticky top-0 z-50 ${transparent ? 'bg-transparent' : 'glass border-b'}`}>
        <div className="container mx-auto px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between">
            {/* Left: Logo or Back Button */}
            <div className="flex items-center gap-3">
              {/* Mobile Menu Button - Always visible on mobile */}
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setMobileMenuOpen(true)}
                className="md:hidden -ml-2"
                data-testid="mobile-menu-btn"
              >
                <List size={24} />
              </Button>
              
              <div 
                className="flex items-center gap-2 cursor-pointer" 
                onClick={() => navigate(user ? '/dashboard' : '/')}
              >
                <Package size={28} weight="duotone" className="text-jungle" />
                <span className="text-xl md:text-2xl font-heading font-bold text-jungle">
                  {title || 'Levva'}
                </span>
              </div>
            </div>

            {/* Center: Desktop Navigation */}
            {user && (
              <nav className="hidden md:flex items-center gap-1">
                {navLinks.slice(0, 4).map((link) => (
                  <Button
                    key={link.path}
                    variant={location.pathname === link.path ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => navigate(link.path)}
                    className="text-sm"
                  >
                    {link.label}
                  </Button>
                ))}
              </nav>
            )}

            {/* Right: Actions */}
            <div className="flex items-center gap-2 md:gap-4">
              {user ? (
                <>
                  {showNotifications && (
                    <NotificationBell 
                      onNotificationClick={(notification) => {
                        if (notification.match_id) {
                          navigate(`/match/${notification.match_id}`);
                        }
                      }}
                    />
                  )}
                  
                  {/* Desktop Profile */}
                  <div className="hidden md:flex items-center gap-3">
                    <div 
                      className="text-right cursor-pointer" 
                      onClick={() => navigate('/perfil')}
                    >
                      <p className="font-semibold text-sm">{user?.name}</p>
                      <Badge className={getTrustBadgeColor(user?.trust_level)}>
                        {user?.trust_level?.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="icon" onClick={handleLogout}>
                      <SignOut size={20} />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => navigate('/login')}
                    className="hidden md:flex"
                  >
                    Entrar
                  </Button>
                  <Button 
                    className="bg-jungle hover:bg-jungle-800 text-sm"
                    size="sm"
                    onClick={() => navigate('/register')}
                  >
                    Cadastrar
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Side Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Side Menu */}
      <div className={`
        fixed top-0 left-0 h-full w-72 bg-white z-50 transform transition-transform duration-300 ease-in-out md:hidden
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package size={28} weight="duotone" className="text-jungle" />
              <span className="text-xl font-heading font-bold text-jungle">Levva</span>
            </div>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setMobileMenuOpen(false)}
            >
              <X size={24} />
            </Button>
          </div>
        </div>

        {user && (
          <>
            {/* User Profile Section */}
            <div className="p-4 border-b bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-jungle/10 rounded-full flex items-center justify-center">
                  <User size={24} className="text-jungle" />
                </div>
                <div>
                  <p className="font-semibold">{user?.name}</p>
                  <Badge className={getTrustBadgeColor(user?.trust_level)}>
                    {user?.trust_level?.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Navigation Links */}
            <nav className="p-4 space-y-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = location.pathname === link.path;
                return (
                  <button
                    key={link.path}
                    onClick={() => {
                      navigate(link.path);
                      setMobileMenuOpen(false);
                    }}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors
                      ${isActive 
                        ? 'bg-jungle/10 text-jungle font-semibold' 
                        : 'text-foreground hover:bg-muted'
                      }
                    `}
                  >
                    <Icon size={20} weight={isActive ? 'fill' : 'regular'} />
                    {link.label}
                  </button>
                );
              })}
            </nav>

            {/* Logout */}
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t">
              <Button 
                variant="outline" 
                className="w-full justify-start gap-3"
                onClick={handleLogout}
              >
                <SignOut size={20} />
                Sair
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default ResponsiveHeader;
