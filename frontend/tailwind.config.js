/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ['Outfit', 'sans-serif'],
        body: ['Plus Jakarta Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      borderRadius: {
        lg: '0.75rem',
        md: 'calc(0.75rem - 2px)',
        sm: 'calc(0.75rem - 4px)'
      },
      colors: {
        background: '#F8FAFC',
        foreground: '#0F172A',
        jungle: {
          DEFAULT: '#047857',
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b'
        },
        lime: {
          DEFAULT: '#84CC16',
          50: '#f7fee7',
          100: '#ecfccb',
          200: '#d9f99d',
          300: '#bef264',
          400: '#a3e635',
          500: '#84CC16',
          600: '#65a30d',
          700: '#4d7c0f',
          800: '#3f6212',
          900: '#365314'
        },
        card: {
          DEFAULT: '#FFFFFF',
          foreground: '#0F172A'
        },
        popover: {
          DEFAULT: '#FFFFFF',
          foreground: '#0F172A'
        },
        primary: {
          DEFAULT: '#047857',
          foreground: '#FFFFFF'
        },
        secondary: {
          DEFAULT: '#84CC16',
          foreground: '#FFFFFF'
        },
        muted: {
          DEFAULT: '#F1F5F9',
          foreground: '#64748B'
        },
        accent: {
          DEFAULT: '#F1F5F9',
          foreground: '#0F172A'
        },
        destructive: {
          DEFAULT: '#EF4444',
          foreground: '#FFFFFF'
        },
        border: '#E2E8F0',
        input: '#E2E8F0',
        ring: '#047857'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        },
        'slide-up': {
          from: { transform: 'translateY(20px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'slide-up': 'slide-up 0.3s ease-out'
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};