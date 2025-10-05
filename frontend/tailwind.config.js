/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        }
      },
      boxShadow: {
        'soft': '0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06)',
      },
      animation: {
        'slideUp': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { 
            opacity: '0',
            transform: 'translateY(20px) scale(0.95)'
          },
          '100%': { 
            opacity: '1',
            transform: 'translateY(0) scale(1)'
          },
        },
      },
    },
  },
  plugins: [],
}