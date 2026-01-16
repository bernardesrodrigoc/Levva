import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { House, MagnifyingGlass, PlusCircle, Package, User } from '@phosphor-icons/react';

const MobileBottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Check if link is active (including sub-routes)
  const isActive = (path) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  };

  // Navigation items configuration
  const navItems = [
    { path: '/dashboard', label: 'Início', icon: House },
    { path: '/viagens', label: 'Buscar', icon: MagnifyingGlass },
    { path: '/criar-viagem', label: 'Criar', icon: PlusCircle, isCenter: true },
    { path: '/meus-envios', label: 'Envios', icon: Package },
    { path: '/perfil', label: 'Perfil', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 z-50 w-full bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] md:hidden safe-bottom">
      <div className="grid h-16 max-w-lg grid-cols-5 mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          
          if (item.isCenter) {
            // Center button with elevated style
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center justify-center"
                aria-label={item.label}
              >
                <div className="bg-jungle rounded-full p-2.5 shadow-lg transform -translate-y-3 border-4 border-white active:scale-95 transition-transform">
                  <Icon size={26} weight="fill" className="text-white" />
                </div>
              </button>
            );
          }

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`
                flex flex-col items-center justify-center gap-0.5 transition-colors
                ${active ? 'text-jungle' : 'text-gray-500 active:text-gray-700'}
              `}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
            >
              <Icon 
                size={22} 
                weight={active ? 'fill' : 'regular'} 
                className={active ? 'text-jungle' : ''}
              />
              <span className={`text-[10px] font-medium ${active ? 'text-jungle' : ''}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
