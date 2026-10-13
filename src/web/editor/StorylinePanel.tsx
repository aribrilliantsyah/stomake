import { FileUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { toast } from '../state/uiStore';

export function StorylinePanel({ slug }: { slug: string }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const pending = useRef<string | null>(null);
  useEffect(() => {
    const flush = () => {
      if (pending.current === null) return;
      const body = JSON.stringify({ text: pending.current });
      pending.current = null;
      navigator.sendBeacon?.(`/api/projects/${slug}/storyline`, new Blob([body], { type: 'application/json' })) ||
        api.saveStoryline(slug, JSON.parse(body).text);
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      if (timer.current) clearTimeout(timer.current);
      if (pending.current !== null) api.saveStoryline(slug, pending.current);
    };
  }, [slug]);

  useEffect(() => {
    api.getStoryline(slug).then(({ text }) => {
      setText(text);
      setLoaded(true);
    });
  }, [slug]);

  function change(v: string) {
    setText(v);
    setStatus('saving');
    pending.current = v;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pending.current = null;
      api.saveStoryline(slug, v).then(
        () => setStatus('saved'),
        () => {
          setStatus('error');
          toast('err', 'Storyline gagal disimpan');
        },
      );
    }, 1000);
  }

  async function importDocx(f: File) {
    if (text.trim() && !confirm('Ganti storyline sekarang dengan isi file ini?')) return;
    try {
      const r = await api.importDocx(slug, f);
      setText(r.text);
      toast('ok', `Storyline diimpor dari ${f.name}`);
    } catch (e) {
      toast('err', `Import gagal: ${(e as Error).message}`);
    }
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="storyline">
      <div className="row">
        <button onClick={() => file.current?.click()}><FileUp size={14} aria-hidden /> Import .docx</button>
        <input
          ref={file}
          type="file"
          accept=".docx"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importDocx(f);
            e.target.value = '';
          }}
        />
        <div className="grow" />
        <span className="muted mono">{words} kata</span>
        <span className="muted">{status === 'saving' ? '…' : status === 'saved' ? '✓' : status === 'error' ? 'gagal' : ''}</span>
      </div>
      <textarea
        className="storyline-text"
        value={text}
        disabled={!loaded}
        placeholder="Tempel storyline di sini, atau Import .docx. Blok teks lalu copy ke subtitle / catatan scene."
        onChange={(e) => change(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}
