'use client';

import React, { useEffect, useState } from 'react';
import { X, Download, Edit3, Eye, Check, AlertCircle } from 'lucide-react';
import type { CatalogSkill } from '@/lib/os/skills/types';
import { getSkillIcon } from './skill-card';

export type ModalMode = 'view' | 'edit' | 'preview';

function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-os-text">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="rounded bg-os-surface2 px-1 py-0.5 font-mono text-[11px] text-os-accent border border-os-border/40">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function PureMarkdown({ src }: { src: string }) {
  const elements: React.ReactNode[] = [];
  let codeFence: string[] | null = null;
  let key = 0;

  const normalized = src.replace(/\r\n/g, '\n');

  for (const line of normalized.split('\n')) {
    if (line.trim().startsWith('```')) {
      if (codeFence) {
        elements.push(
          <pre key={key++} className="my-2.5 overflow-x-auto rounded border border-os-border bg-os-bg p-3 font-mono text-[11px] leading-relaxed text-os-muted">
            {codeFence.join('\n')}
          </pre>
        );
        codeFence = null;
      } else {
        codeFence = [];
      }
      continue;
    }
    if (codeFence) {
      codeFence.push(line);
      continue;
    }
    if (/^#\s/.test(line)) {
      elements.push(<h1 key={key++} className="mb-1.5 mt-4 text-base font-bold text-os-text">{inline(line.slice(2))}</h1>);
    } else if (/^##\s/.test(line)) {
      elements.push(<h2 key={key++} className="mb-1.5 mt-3.5 font-mono text-xs font-bold uppercase tracking-wider text-os-dim">{inline(line.slice(3))}</h2>);
    } else if (/^###\s/.test(line)) {
      elements.push(<h3 key={key++} className="mt-2 text-xs font-semibold text-os-text">{inline(line.slice(4))}</h3>);
    } else if (/^---\s*$/.test(line)) {
      elements.push(<hr key={key++} className="my-3 border-os-border" />);
    } else if (/^\s*[-*]\s/.test(line)) {
      elements.push(
        <div key={key++} className="flex gap-2 text-xs leading-relaxed text-os-muted my-0.5">
          <span className="text-os-accent">·</span>
          <span>{inline(line.replace(/^\s*[-*]\s/, ''))}</span>
        </div>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={key++} className="h-2" />);
    } else {
      elements.push(<p key={key++} className="text-xs leading-relaxed text-os-muted">{inline(line)}</p>);
    }
  }

  if (codeFence) {
    elements.push(
      <pre key={key++} className="my-2.5 overflow-x-auto rounded border border-os-border bg-os-bg p-3 font-mono text-[11px] leading-relaxed text-os-muted">
        {codeFence.join('\n')}
      </pre>
    );
  }

  return <div className="space-y-1">{elements}</div>;
}

function useSafeState<T>(initial: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>] {
  try {
    return useState<T>(initial);
  } catch {
    const val = typeof initial === 'function' ? (initial as () => T)() : initial;
    return [val, () => {}];
  }
}

function useSafeEffect(effect: React.EffectCallback, deps?: React.DependencyList) {
  try {
    useEffect(effect, deps);
  } catch {
    // Direct invocation outside React render tree (e.g. node unit tests)
  }
}

export function SkillModal({
  skill,
  companyId,
  onClose,
  onSaveSuccess,
  initialMode = 'view',
}: {
  skill: CatalogSkill;
  companyId: string;
  onClose: () => void;
  onSaveSuccess?: () => void;
  initialMode?: ModalMode;
}): React.ReactElement {
  const [markdown, setMarkdown] = useSafeState<string | null>(skill.markdown ?? null);
  const [mode, setMode] = useSafeState<ModalMode>(initialMode);
  const [editedText, setEditedText] = useSafeState(skill.markdown ?? '');
  const [saving, setSaving] = useSafeState(false);
  const [saveStatus, setSaveStatus] = useSafeState<'idle' | 'saved' | 'error'>('idle');

  useSafeEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useSafeEffect(() => {
    if (skill.markdown != null) {
      setMarkdown(skill.markdown);
      setEditedText(skill.markdown);
      return;
    }
    let cancelled = false;
    fetch(`/api/skills/${encodeURIComponent(skill.id)}?companyId=${encodeURIComponent(companyId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setMarkdown(data.markdown ?? 'Could not read skill documentation.');
        setEditedText(data.markdown ?? '');
      })
      .catch(() => {
        if (cancelled) return;
        setMarkdown('Failed to fetch skill documentation.');
      });
    return () => {
      cancelled = true;
    };
  }, [skill.id, skill.markdown, companyId]);

  // Auto-dismiss saved notification after 3 seconds
  useSafeEffect(() => {
    if (saveStatus !== 'saved') return;
    const timer = setTimeout(() => {
      setSaveStatus('idle');
    }, 3000);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  const handleDownload = () => {
    window.location.href = `/api/skills/${encodeURIComponent(skill.id)}?companyId=${encodeURIComponent(companyId)}&download=1`;
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skill.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, markdown: editedText }),
      });
      if (!res.ok) throw new Error('Save failed');
      setMarkdown(editedText);
      setMode('view');
      setSaveStatus('saved');
      onSaveSuccess?.();
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedText(markdown ?? '');
    setMode('view');
    setSaveStatus('idle');
  };

  const Icon = getSkillIcon(skill.category, skill.id);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${skill.name} documentation`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-os-border-strong bg-os-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-os-border px-5 py-3">
          <div className="flex min-w-0 items-center gap-2 font-mono text-xs text-os-dim">
            <Icon className="h-4 w-4 shrink-0 text-os-accent" />
            <span className="truncate">{skill.filePath}</span>
            <span className="rounded bg-os-surface2 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-os-muted">
              {skill.provenanceLabel}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Save feedback persistently in header */}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1 font-mono text-xs text-os-ok animate-fade-in">
                <Check className="h-3.5 w-3.5" /> Saved successfully
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1 font-mono text-xs text-os-err animate-fade-in">
                <AlertCircle className="h-3.5 w-3.5" /> Failed to save
              </span>
            )}

            {skill.isEditable && (
              <button
                type="button"
                onClick={() => {
                  if (mode === 'view') {
                    setEditedText(markdown ?? '');
                    setMode('edit');
                  } else if (mode === 'edit') {
                    setMode('preview');
                  } else {
                    setMode('edit');
                  }
                }}
                className="flex items-center gap-1.5 rounded border border-os-border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-wider text-os-dim hover:border-os-accent hover:text-os-text transition-colors"
              >
                {mode === 'edit' ? <Eye className="h-3 w-3" /> : <Edit3 className="h-3 w-3" />}
                <span>{mode === 'edit' ? 'Preview' : 'Edit'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownload}
              title="Download raw SKILL.md"
              className="flex items-center gap-1.5 rounded border border-os-border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-wider text-os-dim hover:border-os-accent hover:text-os-text transition-colors"
            >
              <Download className="h-3 w-3" />
              <span>skill.md</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="ml-1 p-1 text-os-dim hover:text-os-text transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {markdown === null ? (
            <div className="flex items-center justify-center py-16 text-center font-mono text-xs text-os-dim animate-pulse">
              loading skill documentation…
            </div>
          ) : mode === 'edit' ? (
            <div className="space-y-4">
              <textarea
                value={editedText}
                onChange={(e) => {
                  setEditedText(e.target.value);
                  if (saveStatus !== 'idle') setSaveStatus('idle');
                }}
                className="h-[50vh] w-full resize-none rounded-lg border border-os-border bg-os-bg p-4 font-mono text-xs leading-relaxed text-os-text outline-none focus:border-os-accent focus:ring-1 focus:ring-os-accent"
                placeholder="Enter markdown content..."
              />
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-os-dim">Editing mode</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMode('preview')}
                    className="flex items-center gap-1 rounded border border-os-border px-3 py-1 font-mono text-xs text-os-dim hover:text-os-text"
                  >
                    <Eye className="h-3 w-3" /> Preview
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="rounded border border-os-border px-3 py-1 font-mono text-xs text-os-dim hover:text-os-text"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded bg-os-accent px-4 py-1 font-mono text-xs font-semibold text-os-bg hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          ) : mode === 'preview' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-os-border/50 pb-2">
                <span className="rounded bg-os-warn/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-os-warn uppercase tracking-wider">
                  Previewing unsaved edits
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMode('edit')}
                    className="flex items-center gap-1 rounded border border-os-border px-3 py-1 font-mono text-xs text-os-dim hover:text-os-text"
                  >
                    <Edit3 className="h-3 w-3" /> Back to Edit
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="rounded border border-os-border px-3 py-1 font-mono text-xs text-os-dim hover:text-os-text"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded bg-os-accent px-4 py-1 font-mono text-xs font-semibold text-os-bg hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
              <PureMarkdown src={editedText} />
            </div>
          ) : (
            <PureMarkdown src={markdown} />
          )}
        </div>
      </div>
    </div>
  );
}
