import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          100: '#fff2ef',
          200: '#ffe0d9',
          300: '#ffc4b8',
          400: '#ff9783',
          500: '#ff563c',
          600: '#dd2b0f',
          700: '#ae1800',
          800: '#7c1405',
          900: '#4d170e',
          DEFAULT: '#ec3013',
        },
        surface: '#eae9e9',
      },
      borderRadius: {
        sm: '0px',
        DEFAULT: '0px',
        md: '0px',
        lg: '0px',
      },
    },
  },
  plugins: [],
};

export default config;
