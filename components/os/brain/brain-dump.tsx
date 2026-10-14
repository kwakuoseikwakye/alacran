'use client';

/**
 * Voice/text capture straight into the brain-store. The mic uses the
 * browser's built-in speech recognition (Chrome/Safari — no API key);
 * Save writes a real markdown memory file AND embeds it into G-Brain immediately
 * (via `gbrain capture`) so agents can retrieve it — degrades to local-only if the
 * knowledgebase is unreachable.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, BrainCircuit, Upload } from 'lucide-react';

const CAPTURE_TAGS = [
  { id: 'fact', label: 'Fact', color: '#38bdf8', brainTag: 'definitions' },
  { id: 'note', label: 'Note', color: '#3df08c', brainTag: 'notes' },
  { id: 'decision', label: 'Decision', color: '#f59e0b', brainTag: 'decision' },
  { id: 'todo', label: 'Todo', color: '#a78bfa', brainTag: 'todo' },
];

function useSafeState<T>(initial: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>] {
  try {
    return useState<T>(initial);
  } catch {
    const val = typeof initial === 'function' ? (initial as () => T)() : initial;
    return [val, () => {}];
  }
}

const FOLDERS = ['inbox', 'ideas', 'people', 'companies', 'meetings', 'projects', 'writing'];

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};

function getRecognizer(): SpeechRecognitionLike | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

// documents we can honestly ingest: anything that reads as text
const TEXTY = /\.(md|markdown|txt|csv|json|ya?ml|html?|log)$/i;
const MAX_DOC_BYTES = 1_000_000; // embedding a monster helps nobody

export function BrainDump({
  compact = false,
  companyId,
}: {
  compact?: boolean;
  companyId?: string;
}) {
  const [text, setText] = useSafeState('');
  const [title, setTitle] = useSafeState('');
  const [folder, setFolder] = useSafeState('inbox');
  const [tags, setTags] = useSafeState<string[]>([]);
  const [listening, setListening] = useSafeState(false);
  const [supported, setSupported] = useSafeState(true);
  const [dragOver, setDragOver] = useSafeState(false);
  const [status, setStatus] = useSafeState<{
    kind: 'idle' | 'saving' | 'saved' | 'error';
    detail?: string;
    embedded?: boolean;
    slug?: string;
  }>({ kind: 'idle' });
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSupported(getRecognizer() !== null);
  }, []);

  const stopListening = () => {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  };

  const startListening = () => {
    const rec = getRecognizer();
    if (!rec) return;
    baseTextRef.current = text ? `${text.trim()} ` : '';
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      setText(baseTextRef.current + transcript.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = (e) => {
      setListening(false);
      setStatus({ kind: 'error', detail: `mic: ${e.error}` });
    };
    recRef.current = rec;
    setStatus({ kind: 'idle' });
    setListening(true);
    rec.start();
  };

  const save = async () => {
    if (!text.trim()) return;
    stopListening();
    setStatus({ kind: 'saving' });
    try {
      const res = await fetch('/api/brain/dump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          title: title || undefined,
          folder,
          tags,
          companyId,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.toString() ?? 'save failed');
      setStatus({ kind: 'saved', detail: body.relPath, embedded: body.embedded, slug: body.slug });
      setText('');
      setTitle('');
    } catch (err) {
      setStatus({ kind: 'error', detail: err instanceof Error ? err.message : 'save failed' });
    }
  };

  // dropped documents flow through the same dump pipeline, one note per file,
  // filename (sans extension) as the title so retrieval reads human
  const ingestFiles = async (files: File[]) => {
    const texty = files.filter((f) => TEXTY.test(f.name) || f.type.startsWith('text/'));
    const skipped = files.length - texty.length;
    if (texty.length === 0) {
      setStatus({ kind: 'error', detail: 'only text documents for now (.md .txt .csv .json …)' });
      return;
    }
    setStatus({ kind: 'saving' });
    let saved = 0;
    let embedded = 0;
    try {
      for (const f of texty) {
        if (f.size > MAX_DOC_BYTES) throw new Error(`${f.name} is over 1MB`);
        const content = await f.text();
        if (!content.trim()) continue;
        const res = await fetch('/api/brain/dump', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: content,
            title: f.name.replace(/\.[^.]+$/, ''),
            folder,
            tags,
            companyId,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error?.toString() ?? `saving ${f.name} failed`);
        saved += 1;
        if (body.embedded) embedded += 1;
      }
      setStatus({
        kind: 'saved',
        detail: `${saved} doc${saved === 1 ? '' : 's'}${skipped ? ` · ${skipped} skipped (not text)` : ''}`,
        embedded: embedded === saved,
      });
    } catch (err) {
      setStatus({ kind: 'error', detail: err instanceof Error ? err.message : 'ingest failed' });
    }
  };

  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      void ingestFiles([...e.dataTransfer.files]);
    },
  };

  if (compact) {
    // ONE untitled part (Alex): a wide, short capture bar tucked across the
    // top-right whitespace beside the title — type, talk, drop, or upload
    // documents into the brain. Horizontal, not tall: the graph owns the space
    // directly under the title.
    return (
      <div
        {...dropProps}
        className={`w-full rounded-lg-t border bg-os-surface p-2 transition-colors ${
          dragOver ? 'border-os-accent' : 'border-os-border'
        }`}
      >
        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save();
            }}
            rows={2}
            placeholder={dragOver ? 'drop it — one note per document' : 'Add a note, or drop documents here'}
            className="w-full resize-none border-0 bg-transparent px-1.5 py-1 pr-9 text-xs leading-relaxed text-os-text placeholder:text-os-dim focus:outline-none"
          />
          {supported && (
            <button
              onClick={listening ? stopListening : startListening}
              title={listening ? 'Stop dictation' : 'Start dictation'}
              className={`absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-sm-t border transition-colors ${
                listening
                  ? 'animate-pulse border-os-err bg-os-err text-black'
                  : 'border-os-border bg-os-surface text-os-muted hover:text-os-text'
              }`}
            >
              {listening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
            </button>
          )}
        </div>

        {/* native file picker — a real Upload button alongside drag-and-drop */}
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".md,.markdown,.txt,.csv,.json,.yaml,.yml,.html,.htm,.log,text/*"
          onChange={(e) => {
            void ingestFiles([...(e.target.files ?? [])]);
            e.currentTarget.value = '';
          }}
          className="hidden"
        />

        <div className="mt-1.5 flex items-center gap-1.5 px-1.5 pt-1.5">
          <span className="min-w-0 flex-1 truncate text-xs text-os-dim">
            {status.kind === 'saving'
              ? 'saving…'
              : status.kind === 'saved'
                ? `✓ ${status.detail ?? 'saved'}`
                : status.kind === 'error'
                  ? `✗ ${status.detail}`
                  : 'Type, speak, or drop files'}
          </span>
          <button
            onClick={() => fileRef.current?.click()}
            title="Choose documents to upload"
            className="flex shrink-0 items-center gap-1 rounded-sm-t border border-os-border bg-os-surface px-2 py-0.5 text-xs text-os-muted transition-colors hover:border-os-border-strong hover:text-os-text"
          >
            <Upload className="h-3 w-3" />
            Upload
          </button>
          <button
            onClick={save}
            disabled={!text.trim() || status.kind === 'saving'}
            className="shrink-0 rounded-sm-t bg-os-text px-2.5 py-0.5 text-xs font-bold text-os-bg transition-opacity disabled:opacity-30"
          >
            {status.kind === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      {...dropProps}
      className={`rounded-xl border bg-os-surface p-4 transition-colors ${dragOver ? 'border-os-accent' : 'border-os-border'}`}
    >
      <div className="flex items-center gap-2">
        <BrainCircuit className="h-4 w-4 text-os-muted" />
        <h3 className="text-sm font-bold">Inbox Capture</h3>
        <span className="text-xs text-os-dim">
          speak, type, or drop documents → appended to notes/inbox.md
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional — derived from first words)"
            className="flex-1 rounded-lg border border-os-border bg-os-bg px-3 py-2 text-xs text-os-text placeholder:text-os-dim focus:border-os-border-bright focus:outline-none"
          />
          <select
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            className="rounded-lg border border-os-border bg-os-surface px-2 py-2 text-xs text-os-text focus:border-os-border-strong focus:outline-none"
          >
            {FOLDERS.map((f) => (
              <option key={f} value={f} className="bg-os-surface text-os-text">{f}/</option>
            ))}
          </select>
        </div>

        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={supported ? 'Capture thought here, or hit the mic and just talk…' : 'Type your capture (voice needs Chrome/Safari)…'}
            className="w-full resize-y rounded-lg border border-os-border bg-os-bg px-3 py-2 pr-12 text-sm leading-relaxed text-os-text placeholder:text-os-dim focus:border-os-border-bright focus:outline-none"
          />
          {supported && (
            <button
              onClick={listening ? stopListening : startListening}
              title={listening ? 'Stop dictation' : 'Start dictation'}
              className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                listening
                  ? 'animate-pulse border-[#ef4444] bg-[#ef4444] text-black'
                  : 'border-os-border bg-os-surface text-os-muted hover:text-os-text'
              }`}
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-os-dim">tag</span>
          {CAPTURE_TAGS.map((v) => {
            const on = tags.includes(v.brainTag);
            return (
              <button
                key={v.id}
                onClick={() => setTags((prev) => (on ? prev.filter((t) => t !== v.brainTag) : [...prev, v.brainTag]))}
                className={`flex items-center gap-1 rounded border px-2 py-0.5 text-xs transition-colors ${
                  on ? 'text-black font-semibold' : 'border-os-border text-os-muted hover:text-os-text'
                }`}
                style={on ? { background: v.color, borderColor: v.color } : undefined}
              >
                #{v.brainTag}
              </button>
            );
          })}

          <button
            onClick={save}
            disabled={!text.trim() || status.kind === 'saving'}
            className="ml-auto rounded-lg bg-os-text px-4 py-1.5 text-xs font-bold text-os-bg transition-opacity disabled:opacity-30"
          >
            {status.kind === 'saving' ? 'Appending…' : 'Append to Inbox'}
          </button>
        </div>

        {status.kind === 'saved' && (
          <p className="text-xs text-os-muted">
            ✓ appended to {status.detail ?? 'notes/inbox.md'}
          </p>
        )}
        {status.kind === 'error' && <p className="text-xs text-os-muted">✗ {status.detail}</p>}
      </div>
    </div>
  );
}
