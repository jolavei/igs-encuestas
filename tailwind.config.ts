import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Verdana", "Geneva", "Tahoma", "sans-serif"],
      },
      colors: {
        // Marca: azul marino anclado en #003152 (logo Aeródromos IGS).
        brand: {
          50: "#eaf1f6",
          100: "#cfe0eb",
          200: "#a6c4d6",
          300: "#6f9cb6",
          400: "#3d7593",
          500: "#1a5374",
          600: "#003152", // primario
          700: "#002740",
          800: "#001d31",
          900: "#001322",
        },
        // Acento turquesa tomado de los trazos claros del logo.
        accent: {
          light: "#e4eff2",
          DEFAULT: "#2f7d92",
          dark: "#25647a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
