/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Orbitron"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          900: '#050810',
          800: '#0a1024',
          700: '#0f1832',
          600: '#15203f',
        },
        accent: {
          gold: '#f5c542',
          crimson: '#e63946',
          azure: '#3aa0ff',
          jade: '#3ddc97',
        },
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        pulseRing: {
          '0%': { transform: 'scale(0.7)', opacity: '0.7' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
      },
      animation: {
        scan: 'scan 6s linear infinite',
        pulseRing: 'pulseRing 1.6s ease-out infinite',
      },
    },
  },
  plugins: [],
};
