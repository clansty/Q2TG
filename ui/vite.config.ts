import { defineConfig } from 'vite';
import vueJsx from '@vitejs/plugin-vue-jsx';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/ui/',
  plugins: [vueJsx()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
