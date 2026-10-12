import { useEffect, useState } from 'react';
import { Editor } from './editor/Editor';
import { PrintRoute } from './print/PrintRoute';
import { ProjectList } from './projects/ProjectList';

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return path;
}

export function App() {
  const path = usePath();
  const edit = path.match(/^\/p\/([a-z0-9-]+)\/?$/);
  if (edit) return <Editor slug={edit[1]} />;
  const print = path.match(/^\/print\/([a-z0-9-]+)\/?$/);
  if (print) {
    const page = new URLSearchParams(location.search).get('page');
    return <PrintRoute slug={print[1]} page={page === null ? null : Number(page)} />;
  }
  return <ProjectList />;
}
