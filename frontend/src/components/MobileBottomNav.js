import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { House, MagnifyingGlass, PlusCircle, Package, User } from '@phosphor-icons/react';

const MobileBottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Função para verificar se o link está ativo
  const isActive = (path) => location.pathname === path;

  // Estilo base do botão
  const navItemClass = (path) => `
    flex flex-col items-center justify-center w-full h-full space-y-1
    ${isActive(path) ? 'text-jungle' : 'text-gray-500 hover:text-gray-700'}
  `;

  return (
    <div className="fixed bottom-0 left-0 z-50 w-full h-16 bg-white border-t border-gray-200 shadow-lg md:hidden">
      <div className="grid h-full max-w-lg grid-cols-5 mx-auto font-medium">
        
        {/* Home / Dashboard */}
        <button onClick={() => navigate('/dashboard')} className={navItemClass('/dashboard')}>
          <House size={24} weight={isActive('/dashboard') ? 'fill' : 'regular'} />
          <span className="text-[10px]">Início</span>
        </button>

        {/* Buscar (Leva para viagens por padrão) */}
        <button onClick={() => navigate('/viagens')} className={navItemClass('/viagens')}>
          <MagnifyingGlass size={24} weight={isActive('/viagens') ? 'fill' : 'bold'} />
          <span className="text-[10px]">Buscar</span>
        </button>

        {/* Criar (Menu central de ação) */}
        <button onClick={() => navigate('/criar-viagem')} className={navItemClass('/criar-viagem')}>
          <div className="bg-jungle rounded-full p-2 mb-1 shadow-md transform -translate-y-3 border-4 border-white">
             <PlusCircle size={28} weight="fill" className="text-white" />
          </div>
        </button>

        {/* Meus Itens */}
        <button onClick={() => navigate('/meus-envios')} className={navItemClass('/meus-envios')}>
          <Package size={24} weight={isActive('/meus-envios') ? 'fill' : 'regular'} />
          <span className="text-[10px]">Envios</span>
        </button>

        {/* Perfil */}
        <button onClick={() => navigate('/perfil')} className={navItemClass('/perfil')}>
          <User size={24} weight={isActive('/perfil') ? 'fill' : 'regular'} />
          <span className="text-[10px]">Perfil</span>
        </button>

      </div>
    </div>
  );
};

export default MobileBottomNav;
