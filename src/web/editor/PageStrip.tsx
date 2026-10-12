import type { Project } from '../../shared/types';

export function PageStrip({ project, currentSceneId, onSelect }: { project: Project; currentSceneId: string; onSelect: (id: string) => void }) {
  let n = 0;
  return (
    <div className="page-strip">
      {project.pages.map((page, pi) => (
        <div key={page.id} className="strip-page">
          <span className="strip-label mono">P{pi + 1}</span>
          {page.scenes.map((sc) => {
            n++;
            return (
              <button
                key={sc.id}
                className={`strip-scene mono ${sc.id === currentSceneId ? 'on' : ''}`}
                onClick={() => onSelect(sc.id)}
                title={sc.subtitle || `Scene ${n}`}
              >
                {n}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
