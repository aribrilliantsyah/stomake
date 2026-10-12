import { useEffect, useState } from 'react';
import type { ProjectSummary } from '../../shared/types';
import { api } from '../api';
import { navigate } from '../router';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

export function ProjectList() {
  const [items, setItems] = useState<ProjectSummary[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listProjects().then(setItems, (e) => setError(e.message));
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const { slug } = await api.createProject(name.trim());
      navigate(`/p/${slug}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="home">
      <header className="home-head">
        <h1>Storyboard Maker</h1>
      </header>
      <form className="new-project" onSubmit={create}>
        <input
          autoFocus
          placeholder="Nama project baru, mis. Selimut Darurat"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="primary" disabled={!name.trim()}>
          New Project
        </button>
      </form>
      {error && <div className="error">{error}</div>}
      <table className="list">
        <thead>
          <tr>
            <th>Project</th>
            <th>Folder</th>
            <th className="num">Diubah</th>
          </tr>
        </thead>
        <tbody>
          {items?.map((p) => (
            <tr key={p.slug} onClick={() => navigate(`/p/${p.slug}`)}>
              <td>{p.name}</td>
              <td className="mono">{p.slug}</td>
              <td className="num mono">{fmt(p.updatedAt)}</td>
            </tr>
          ))}
          {items && items.length === 0 && (
            <tr className="empty">
              <td colSpan={3}>Belum ada project.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
