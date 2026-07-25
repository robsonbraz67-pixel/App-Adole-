import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

// Identidade do build. No Netlify vem do commit; fora dele, do relógio — o que
// importa é mudar a cada publicação, para o cliente saber que ficou pra trás.
const BUILD_ID = process.env.COMMIT_REF?.slice(0, 12) || `dev-${Date.now()}`;

// Publica dist/version.json com esse mesmo id. O app compara o valor embutido
// no bundle com o do arquivo: se diferirem, existe versão nova no ar.
const versionFile = (): Plugin => ({
  name: 'sabatina-version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ buildId: BUILD_ID, publicadoEm: new Date().toISOString() }),
    });
  },
});

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), versionFile()],
    define: {
      __BUILD_ID__: JSON.stringify(BUILD_ID),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
