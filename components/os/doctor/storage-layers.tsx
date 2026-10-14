import React from 'react';
import { formatBytes, type LayerInspection, type StorageLayersReport } from '@/lib/os/doctor/storage';

export function formatLayerStateDot(status: LayerInspection['status']): string {
  if (status === 'healthy') return 'text-os-ok bg-os-ok/20';
  if (status === 'warning') return 'text-os-warn bg-os-warn/20';
  return 'text-os-dim bg-os-border';
}

export function StorageLayersGrid({ report }: { report: StorageLayersReport }) {
  return (
    <div className="flex flex-col justify-between rounded-lg border border-os-border bg-os-surface p-5">
      <div className="flex items-center justify-between border-b border-os-border pb-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-os-dim">
          Storage Layers Inspector
        </span>
        <span className="font-mono text-[10px] text-os-muted">
          {report.totalFiles} files · {report.totalBytesFormatted}
        </span>
      </div>

      <div className="my-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {report.layers.map((layer) => (
          <div
            key={layer.layer}
            className="flex flex-col justify-between rounded-md border border-os-border bg-os-surface2 p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-mono text-[11px] font-bold text-os-text">
                  {layer.relativePath}/
                </div>
                <div className="truncate text-[10.5px] text-os-dim">{layer.description}</div>
              </div>
              <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${formatLayerStateDot(layer.status)}`} />
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-os-border/50 pt-2 font-mono text-[10px]">
              <span className="text-os-dim">{layer.fileCount} files</span>
              <span className="font-medium text-os-muted">{formatBytes(layer.byteSize)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-os-border pt-3 font-mono text-[10px] text-os-dim">
        Local-first file durability guaranteed under Plain-Files Architecture.
      </div>
    </div>
  );
}
