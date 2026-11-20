import { lazy, Suspense, useState } from 'react';
import { BookOpen, ChevronLeft, Code2 } from 'lucide-react';
import './exam.css';

const Week9 = lazy(() => import('./components/exam/Week9'));
const Week10 = lazy(() => import('./components/exam/Week10'));
const Week11 = lazy(() => import('./components/exam/Week11'));
const LegacyWorkspace = lazy(() => import('./LegacyWorkspace'));
const modules = [
  { id: '9', title: 'Jerarquía de Chomsky y recursividad', short: 'Gramáticas', description: 'Clasifica las reglas y transforma la recursividad izquierda.' },
  { id: '10', title: 'Analizadores sintácticos', short: 'Análisis y árboles', description: 'Construye árboles y sigue el reconocimiento de una cadena.' },
  { id: '11', title: 'Gramáticas dirigidas por sintaxis', short: 'GDS y DDS', description: 'Decora el árbol y sigue las dependencias entre sus atributos.' },
] as const;
type Week = typeof modules[number]['id'];
export default function App() {
  const [active, setActive] = useState<Week>('10');
  const [visited, setVisited] = useState<Week[]>(['10']);
  const [legacy, setLegacy] = useState(() => location.hash === '#otros');
  const current = modules.find(module => module.id === active)!;
  function choose(id: Week) {
    setActive(id);
    setVisited(previous => previous.includes(id) ? previous : [...previous, id]);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function toggleLegacy(value: boolean) {
    setLegacy(value);
    history.replaceState(null, '', value ? '#otros' : location.pathname + location.search);
  }
  return <div className="exam-app">
    <a className="skip-link" href="#exam-workspace">Saltar al contenido</a>
    <header className="exam-header">
      <a href="#" className="exam-brand" onClick={event => { event.preventDefault(); toggleLegacy(false); choose('10'); }}>
        <span><Code2 size={21} /></span><strong>SyntaxLab</strong><small>Examen final</small>
      </a>
      <button className="exam-secondary" onClick={() => toggleLegacy(!legacy)}>
        {legacy ? <><ChevronLeft size={15} />Volver al examen final</> : 'Otros laboratorios'}
      </button>
    </header>
    {legacy ? <div id="exam-workspace"><Suspense fallback={<p role="status">Cargando laboratorio…</p>}><LegacyWorkspace /></Suspense></div> : <main className="exam-main" id="exam-workspace">
      <nav className="exam-weeks" aria-label="Módulos del examen final">
        {modules.map(module => <button key={module.id} aria-current={active === module.id ? 'page' : undefined}
          onClick={() => choose(module.id)}><span>SEMANA {module.id}</span><strong>{module.short}</strong></button>)}
      </nav>
      <div className="exam-heading"><span><BookOpen size={15} /> SEMANA {active}</span><h1>{current.title}</h1><p>{current.description}</p></div>
      <Suspense fallback={<p role="status">Preparando módulo…</p>}>
        {visited.includes('9') && <div hidden={active !== '9'}><Week9 /></div>}
        {visited.includes('10') && <div hidden={active !== '10'}><Week10 /></div>}
        {visited.includes('11') && <div hidden={active !== '11'}><Week11 /></div>}
      </Suspense>
    </main>}
  </div>;
}
