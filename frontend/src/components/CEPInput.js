import React, { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner, CheckCircle, Warning } from '@phosphor-icons/react';
import axios from 'axios';
import { toast } from 'sonner';

/**
 * CEPInput - Campo de CEP com auto-preenchimento de endereço
 * Usa a API ViaCEP (gratuita) para buscar dados do endereço
 */
const CEPInput = ({
  value,
  onChange,
  onAddressFound,
  label = 'CEP',
  required = false,
  disabled = false,
  className = '',
  'data-testid': testId
}) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // 'success', 'error', null
  const [lastSearchedCep, setLastSearchedCep] = useState('');

  // Format CEP as user types (00000-000)
  const formatCEP = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 5) {
      return numbers;
    }
    return `${numbers.slice(0, 5)}-${numbers.slice(5, 8)}`;
  };

  // Search address when CEP is complete
  const searchAddress = useCallback(async (cep) => {
    const cleanCep = cep.replace(/\D/g, '');
    
    // Only search if CEP has 8 digits and is different from last search
    if (cleanCep.length !== 8 || cleanCep === lastSearchedCep) {
      return;
    }

    setLoading(true);
    setStatus(null);
    setLastSearchedCep(cleanCep);

    try {
      const response = await axios.get(`https://viacep.com.br/ws/${cleanCep}/json/`, {
        timeout: 5000
      });

      if (response.data.erro) {
        setStatus('error');
        toast.error('CEP não encontrado');
        return;
      }

      const address = {
        street: response.data.logradouro || '',
        neighborhood: response.data.bairro || '',
        city: response.data.localidade || '',
        state: response.data.uf || '',
        complement: response.data.complemento || ''
      };

      setStatus('success');
      
      if (onAddressFound) {
        onAddressFound(address);
      }

      // Show success message with city/state
      if (address.city) {
        toast.success(`Endereço encontrado: ${address.city}/${address.state}`);
      }
    } catch (error) {
      console.error('CEP search error:', error);
      setStatus('error');
      
      if (error.code === 'ECONNABORTED') {
        toast.error('Tempo esgotado. Tente novamente.');
      } else {
        toast.error('Erro ao buscar CEP. Verifique e tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }, [lastSearchedCep, onAddressFound]);

  const handleChange = (e) => {
    const formatted = formatCEP(e.target.value);
    onChange(formatted);
    
    // Reset status when user modifies
    if (status) {
      setStatus(null);
    }

    // Auto-search when complete
    const cleanCep = formatted.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      searchAddress(formatted);
    }
  };

  const handleBlur = () => {
    const cleanCep = value?.replace(/\D/g, '') || '';
    if (cleanCep.length === 8 && cleanCep !== lastSearchedCep) {
      searchAddress(value);
    }
  };

  return (
    <div className={className}>
      <Label className="text-xs md:text-sm mb-1.5 block">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      
      <div className="relative">
        <Input
          type="text"
          inputMode="numeric"
          placeholder="00000-000"
          value={value || ''}
          onChange={handleChange}
          onBlur={handleBlur}
          maxLength={9}
          disabled={disabled || loading}
          className={`
            h-11 md:h-12 text-base pr-10
            ${status === 'success' ? 'border-green-500 focus-visible:ring-green-500' : ''}
            ${status === 'error' ? 'border-red-500 focus-visible:ring-red-500' : ''}
          `}
          data-testid={testId}
        />
        
        {/* Status indicator */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {loading && (
            <Spinner size={20} className="animate-spin text-jungle" />
          )}
          {!loading && status === 'success' && (
            <CheckCircle size={20} weight="fill" className="text-green-500" />
          )}
          {!loading && status === 'error' && (
            <Warning size={20} weight="fill" className="text-red-500" />
          )}
        </div>
      </div>
      
      {status === 'success' && (
        <p className="text-[10px] text-green-600 mt-1">
          ✓ Endereço preenchido automaticamente
        </p>
      )}
      {status === 'error' && (
        <p className="text-[10px] text-red-500 mt-1">
          CEP não encontrado. Verifique e tente novamente.
        </p>
      )}
    </div>
  );
};

export default CEPInput;
