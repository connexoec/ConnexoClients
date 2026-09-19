import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    // 5173 es uno de los orígenes que el backend acepta por CORS
    // (backend/.env → CORS_ORIGINS). El 3000 de antes es ahora el del API.
    port: 5173,
    host: '0.0.0.0',
  },
  plugins: [react()],
  // La clave de Gemini ya no viaja al navegador: la IA se pide al backend
  // (/api/clients/ai/*), que es quien guarda la credencial.
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
