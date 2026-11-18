import fs from 'fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';
import {
  BUILD_MANIFEST_FILENAME,
  guessMimeType,
  shouldIncludeNsiteAssetPath,
} from './src/lib/nsitePublisher';

function emitBuildManifestPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'mojisurvivor-build-manifest',
    configResolved(config) {
      outDir = config.build.outDir || 'dist';
    },
    writeBundle(options) {
      const targetDir = path.resolve(options.dir || outDir);
      if (!fs.existsSync(targetDir)) return;

      const files: Array<{path: string; size: number; contentType: string}> = [];
      const walk = (dir: string, prefix: string) => {
        const entries = fs.readdirSync(dir, {withFileTypes: true});
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const full = path.join(dir, entry.name);
          const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            walk(full, rel);
          } else if (
            entry.isFile() &&
            entry.name !== BUILD_MANIFEST_FILENAME &&
            shouldIncludeNsiteAssetPath(rel)
          ) {
            const stat = fs.statSync(full);
            const normPath = `/${rel.replace(/\\/g, '/')}`;
            files.push({
              path: normPath,
              size: stat.size,
              contentType: guessMimeType(normPath),
            });
          }
        }
      };

      walk(targetDir, '');
      files.sort((a, b) => a.path.localeCompare(b.path));

      const manifest = {
        version: 1,
        generatedAt: new Date().toISOString(),
        files,
      };
      fs.writeFileSync(
        path.join(targetDir, BUILD_MANIFEST_FILENAME),
        JSON.stringify(manifest, null, 2),
        'utf-8'
      );
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), emitBuildManifestPlugin()],
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
