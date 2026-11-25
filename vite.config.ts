import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig, type Plugin} from 'vite';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BUILD_MANIFEST_FILENAME = 'build-manifest.json';
const USED_AISTUDIO_ASSETS = new Set<string>([
  '/assets/aistudio/moji_survivor_emblem_1793749794956-C7_7CmkR_406e3441.jpg',
]);

function shouldIncludeNsiteAssetPath(rawPath: string): boolean {
  let clean = rawPath.trim().replace(/\\/g, '/');
  clean = clean.split('?')[0].split('#')[0].replace(/^(\.\/)+/, '');
  const norm = (clean.startsWith('/') ? clean : `/${clean}`).replace(/\/{2,}/g, '/');
  const lower = norm.toLowerCase();
  if (lower.endsWith('.map') || lower.endsWith('.zip')) return false;
  if (norm.split('/').some((seg) => seg.startsWith('.'))) return false;
  if (lower.startsWith('/assets/aistudio/') && !USED_AISTUDIO_ASSETS.has(norm)) {
    return false;
  }
  return true;
}

function guessMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html; charset=utf-8';
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'application/javascript; charset=utf-8';
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8';
  if (lower.endsWith('.json') || lower.endsWith('.webmanifest')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.woff')) return 'font/woff';
  if (lower.endsWith('.wasm')) return 'application/wasm';
  if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

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

export default defineConfig(({command}) => {
  return {
    base: command === 'build' ? './' : '/',
    plugins: [react(), tailwindcss(), emitBuildManifestPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(ROOT_DIR, '.'),
      },
    },
    server: {
      allowedHosts: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
