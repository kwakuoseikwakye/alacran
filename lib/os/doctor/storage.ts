import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface LayerInspection {
  layer: 'definitions' | 'records' | 'notes' | 'docs';
  label: string;
  relativePath: string;
  description: string;
  exists: boolean;
  fileCount: number;
  byteSize: number;
  lastModified?: string;
  status: 'healthy' | 'warning' | 'empty';
  summary: string;
  details: Array<{ label: string; value: string | number }>;
}

export interface StorageLayersReport {
  layers: LayerInspection[];
  totalFiles: number;
  totalBytes: number;
  totalBytesFormatted: string;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i === 0) return `${bytes} B`;
  const safeIdx = Math.min(i, sizes.length - 1);
  return `${(bytes / Math.pow(k, safeIdx)).toFixed(1)} ${sizes[safeIdx]}`;
}

async function scanDirectory(dirPath: string): Promise<{ count: number; bytes: number; latestMtime: number }> {
  let count = 0;
  let bytes = 0;
  let latestMtime = 0;

  async function walk(current: string) {
    try {
      const entries = await fs.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          try {
            const stat = await fs.stat(fullPath);
            count++;
            bytes += stat.size;
            if (stat.mtimeMs > latestMtime) {
              latestMtime = stat.mtimeMs;
            }
          } catch {
            // ignore unreadable/inaccessible files gracefully
          }
        }
      }
    } catch {
      // directory unreadable or missing
    }
  }

  await walk(dirPath);
  return { count, bytes, latestMtime };
}

export async function inspectStorageLayers(companyRoot: string): Promise<StorageLayersReport> {
  const configs: Array<{
    layer: 'definitions' | 'records' | 'notes' | 'docs';
    label: string;
    relativePath: string;
    description: string;
  }> = [
    {
      layer: 'definitions',
      label: 'Definitions',
      relativePath: 'definitions',
      description: 'Declarative facts & ontology',
    },
    {
      layer: 'records',
      label: 'Operational Records',
      relativePath: 'records',
      description: 'Machine-maintained department ledgers',
    },
    {
      layer: 'notes',
      label: 'Working Notes',
      relativePath: 'notes',
      description: 'Human notes & communication dumps',
    },
    {
      layer: 'docs',
      label: 'Decisions & Retros',
      relativePath: 'docs',
      description: 'Architectural decisions & retrospectives',
    },
  ];

  const layers: LayerInspection[] = [];
  let totalFiles = 0;
  let totalBytes = 0;

  for (const cfg of configs) {
    const fullPath = path.join(companyRoot, cfg.relativePath);
    let exists = false;
    try {
      const stat = await fs.stat(fullPath);
      exists = stat.isDirectory();
    } catch {
      exists = false;
    }

    if (!exists) {
      layers.push({
        layer: cfg.layer,
        label: cfg.label,
        relativePath: cfg.relativePath,
        description: cfg.description,
        exists: false,
        fileCount: 0,
        byteSize: 0,
        status: 'empty',
        summary: 'Directory not initialized',
        details: [{ label: 'Status', value: 'Missing' }],
      });
      continue;
    }

    const { count, bytes, latestMtime } = await scanDirectory(fullPath);
    totalFiles += count;
    totalBytes += bytes;

    const status: 'healthy' | 'warning' | 'empty' = count > 0 ? 'healthy' : 'empty';
    const summary = count > 0 ? `${count} files · ${formatBytes(bytes)}` : 'Empty directory';

    layers.push({
      layer: cfg.layer,
      label: cfg.label,
      relativePath: cfg.relativePath,
      description: cfg.description,
      exists: true,
      fileCount: count,
      byteSize: bytes,
      lastModified: latestMtime > 0 ? new Date(latestMtime).toISOString() : undefined,
      status,
      summary,
      details: [
        { label: 'Files', value: count },
        { label: 'Footprint', value: formatBytes(bytes) },
      ],
    });
  }

  return {
    layers,
    totalFiles,
    totalBytes,
    totalBytesFormatted: formatBytes(totalBytes),
  };
}
