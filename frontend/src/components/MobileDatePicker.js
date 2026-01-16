import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

/**
 * MobileDatePicker - Otimizado para dispositivos móveis
 * Usa 3 selects separados (dia, mês, ano) ao invés de calendário
 * Muito mais rápido para selecionar datas de nascimento ou datas distantes
 */
const MobileDatePicker = ({
  label,
  value,
  onChange,
  minYear = 1920,
  maxYear = new Date().getFullYear(),
  placeholder = 'Selecione a data',
  required = false,
  disabled = false,
  className = '',
  showFutureYears = false, // Para datas futuras (ex: data de viagem)
  futureYearsCount = 2,
  'data-testid': testId
}) => {
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');

  // Parse initial value if provided
  useEffect(() => {
    if (value) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        setDay(date.getDate().toString());
        setMonth((date.getMonth() + 1).toString());
        setYear(date.getFullYear().toString());
      }
    }
  }, []);

  // Generate years array
  const getYears = () => {
    const years = [];
    const finalMaxYear = showFutureYears 
      ? new Date().getFullYear() + futureYearsCount 
      : maxYear;
    
    // For birth dates, show recent years first
    for (let y = finalMaxYear; y >= minYear; y--) {
      years.push(y);
    }
    return years;
  };

  // Month names in Portuguese
  const months = [
    { value: '1', label: 'Janeiro' },
    { value: '2', label: 'Fevereiro' },
    { value: '3', label: 'Março' },
    { value: '4', label: 'Abril' },
    { value: '5', label: 'Maio' },
    { value: '6', label: 'Junho' },
    { value: '7', label: 'Julho' },
    { value: '8', label: 'Agosto' },
    { value: '9', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' }
  ];

  // Get days based on selected month and year
  const getDays = () => {
    const days = [];
    let maxDays = 31;
    
    if (month && year) {
      // Get actual days in the selected month
      maxDays = new Date(parseInt(year), parseInt(month), 0).getDate();
    } else if (month) {
      // Estimate based on month only
      const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      maxDays = daysInMonth[parseInt(month) - 1];
    }
    
    for (let d = 1; d <= maxDays; d++) {
      days.push(d);
    }
    return days;
  };

  // Update parent when all fields are filled
  const handleChange = (field, newValue) => {
    let newDay = day;
    let newMonth = month;
    let newYear = year;

    if (field === 'day') newDay = newValue;
    if (field === 'month') newMonth = newValue;
    if (field === 'year') newYear = newValue;

    // Update local state
    if (field === 'day') setDay(newValue);
    if (field === 'month') setMonth(newValue);
    if (field === 'year') setYear(newValue);

    // Validate day if month changed
    if (field === 'month' && newDay) {
      const maxDays = new Date(parseInt(newYear) || 2000, parseInt(newMonth), 0).getDate();
      if (parseInt(newDay) > maxDays) {
        newDay = maxDays.toString();
        setDay(newDay);
      }
    }

    // Call onChange with formatted date when all fields are filled
    if (newDay && newMonth && newYear) {
      const formattedDate = `${newYear}-${newMonth.padStart(2, '0')}-${newDay.padStart(2, '0')}`;
      onChange?.(formattedDate);
    }
  };

  return (
    <div className={className}>
      {label && (
        <Label className="text-xs md:text-sm mb-2 block">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </Label>
      )}
      
      <div className="grid grid-cols-3 gap-2" data-testid={testId}>
        {/* Day Select */}
        <Select 
          value={day} 
          onValueChange={(v) => handleChange('day', v)}
          disabled={disabled}
        >
          <SelectTrigger className="h-11 md:h-12 text-base" data-testid={`${testId}-day`}>
            <SelectValue placeholder="Dia" />
          </SelectTrigger>
          <SelectContent className="max-h-[200px]">
            {getDays().map((d) => (
              <SelectItem key={d} value={d.toString()}>
                {d.toString().padStart(2, '0')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Month Select */}
        <Select 
          value={month} 
          onValueChange={(v) => handleChange('month', v)}
          disabled={disabled}
        >
          <SelectTrigger className="h-11 md:h-12 text-base" data-testid={`${testId}-month`}>
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent className="max-h-[200px]">
            {months.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                <span className="md:hidden">{m.value.padStart(2, '0')}</span>
                <span className="hidden md:inline">{m.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Year Select */}
        <Select 
          value={year} 
          onValueChange={(v) => handleChange('year', v)}
          disabled={disabled}
        >
          <SelectTrigger className="h-11 md:h-12 text-base" data-testid={`${testId}-year`}>
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent className="max-h-[200px]">
            {getYears().map((y) => (
              <SelectItem key={y} value={y.toString()}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

/**
 * MobileDateTimePicker - Para data + hora
 */
export const MobileDateTimePicker = ({
  label,
  dateValue,
  timeValue,
  onDateChange,
  onTimeChange,
  minYear,
  maxYear,
  showFutureYears = true,
  futureYearsCount = 2,
  required = false,
  disabled = false,
  className = '',
  'data-testid': testId
}) => {
  // Generate hours
  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutes = ['00', '15', '30', '45'];

  const [hour, setHour] = useState('');
  const [minute, setMinute] = useState('');

  useEffect(() => {
    if (timeValue) {
      const [h, m] = timeValue.split(':');
      setHour(h);
      setMinute(m);
    }
  }, []);

  const handleTimeChange = (field, value) => {
    let newHour = hour;
    let newMinute = minute;

    if (field === 'hour') {
      newHour = value;
      setHour(value);
    }
    if (field === 'minute') {
      newMinute = value;
      setMinute(value);
    }

    if (newHour && newMinute) {
      onTimeChange?.(`${newHour}:${newMinute}`);
    }
  };

  return (
    <div className={className}>
      {label && (
        <Label className="text-xs md:text-sm mb-2 block">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </Label>
      )}
      
      <div className="space-y-3">
        {/* Date */}
        <MobileDatePicker
          value={dateValue}
          onChange={onDateChange}
          minYear={minYear}
          maxYear={maxYear}
          showFutureYears={showFutureYears}
          futureYearsCount={futureYearsCount}
          disabled={disabled}
          data-testid={`${testId}-date`}
        />
        
        {/* Time */}
        <div className="grid grid-cols-2 gap-2">
          <Select 
            value={hour} 
            onValueChange={(v) => handleTimeChange('hour', v)}
            disabled={disabled}
          >
            <SelectTrigger className="h-11 md:h-12 text-base" data-testid={`${testId}-hour`}>
              <SelectValue placeholder="Hora" />
            </SelectTrigger>
            <SelectContent className="max-h-[200px]">
              {hours.map((h) => (
                <SelectItem key={h} value={h}>{h}h</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select 
            value={minute} 
            onValueChange={(v) => handleTimeChange('minute', v)}
            disabled={disabled}
          >
            <SelectTrigger className="h-11 md:h-12 text-base" data-testid={`${testId}-minute`}>
              <SelectValue placeholder="Min" />
            </SelectTrigger>
            <SelectContent>
              {minutes.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default MobileDatePicker;
