import {
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Code2,
  FileCode2,
  GitBranch,
  GraduationCap,
  Info,
  Keyboard,
  Layers3,
  Menu,
  Minus,
  PanelLeftClose,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Terminal,
  X,
} from "lucide-react";
import SqlResults from "./components/SqlResults";
import CatalogPanel from "./components/CatalogPanel";
import { analyzeSql } from "./engine/sql/analyze";
import { parseCatalog, validateSemantic } from "./engine/sql/semantic";
import type { Catalog, SqlAnalysis, SourceRange } from "./engine/sql/types";
import { StudyPages } from "./components/StudyPages";
import { EXAMPLES, ORIGINAL_SQL } from "./content/lab";
import { createWorkspace, readWorkspace, saveWorkspace } from "./lib/workspace";

type Page =
  | "tree"
  | "sql"
  | "concepts"
  | "derivations"
  | "formal"
  | "practice"
  | "evaluate";
const pageNames: Record<Page, string> = {
  tree: "Árbol sintáctico",
  sql: "Laboratorio SQL",
  concepts: "Repaso",
  derivations: "Derivaciones",
  formal: "Autómatas y LL(1)",
  practice: "Prácticas",
  evaluate: "Evaluarme",
};
const SyntaxTreeLab = lazy(() => import("./components/SyntaxTreeLab"));
const DerivationLab = lazy(() => import("./components/DerivationLab"));
const FormalLab = lazy(() => import("./components/FormalLab"));
const PracticeLab = lazy(() => import("./components/PracticeLab"));
const SqlEditor = lazy(() => import("./components/SqlEditor"));

export default function LegacyWorkspace() {
  const [workspace, setWorkspace] = useState(() => {
    const fallback = createWorkspace(ORIGINAL_SQL, "original");
    try {
      return readWorkspace(window.localStorage, fallback);
    } catch {
      return fallback;
    }
  });
  const [page, setPage] = useState<Page>("practice");
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [page]);
  const [practiceTopic, setPracticeTopic] = useState<string | undefined>(
    undefined,
  );
  const [saved, setSaved] = useState(true);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [analysis, setAnalysis] = useState<SqlAnalysis | null>(null);
  const [selectedRange, setSelectedRange] = useState<
    (SourceRange & { focusEditor?: boolean }) | null
  >(null);
  const [catalog, setCatalog] = useState<Catalog | null>(() => {
    try {
      const text = localStorage.getItem("syntaxlab.catalog.v1");
      return text ? parseCatalog(text) : null;
    } catch {
      return null;
    }
  });
  const semantic = useMemo(
    () => (analysis?.ast ? validateSemantic(analysis.ast, catalog) : undefined),
    [analysis, catalog],
  );
  useEffect(() => {
    try {
      if (catalog)
        localStorage.setItem("syntaxlab.catalog.v1", JSON.stringify(catalog));
      else localStorage.removeItem("syntaxlab.catalog.v1");
    } catch {
      /* Editing remains available when persistence is blocked. */
    }
  }, [catalog]);
  const [notice, setNotice] = useState("");
  const [previousSql, setPreviousSql] = useState<{
    sql: string;
    exampleId: string;
  } | null>(null);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const mobileMenuButton = useRef<HTMLButtonElement>(null);
  const resizeStart = useRef<{
    x: number;
    width: number;
    parentWidth: number;
  } | null>(null);
  const selected =
    EXAMPLES.find((example) => example.id === workspace.exampleId) ??
    EXAMPLES[0];
  const isOriginal = workspace.sql === ORIGINAL_SQL;
  const stale = analysis !== null && analysis.source !== workspace.sql;

  useEffect(() => {
    try {
      setSaved(saveWorkspace(window.localStorage, workspace));
    } catch {
      setSaved(false);
    }
  }, [workspace]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 6500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!mobileSidebar) return;
    const focusable = () =>
      Array.from(
        navigation.current?.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])",
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (helpDialog.current?.open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileSidebar(false);
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      mobileMenuButton.current?.focus();
    };
  }, [mobileSidebar]);

  const reviewInput = useCallback(() => {
    setAnalysis(analyzeSql(workspace.sql));
    setSelectedRange(null);
    setWorkspace((current) => ({ ...current, inspectorOpen: true }));
  }, [workspace.sql]);

  function loadExample(id: string, destination: Page = "sql") {
    const example = EXAMPLES.find((item) => item.id === id);
    if (!example) return;
    setPreviousSql({ sql: workspace.sql, exampleId: workspace.exampleId });
    setWorkspace((current) => ({
      ...current,
      sql: example.sql,
      exampleId: id,
    }));
    setAnalysis(null);
    setSelectedRange(null);
    setPage(destination);
    setMobileSidebar(false);
    setNotice("Ejemplo cargado. Puedes recuperar tu texto anterior.");
  }

  function downloadSql() {
    const url = URL.createObjectURL(
      new Blob([workspace.sql], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "syntaxlab-consulta.sql";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Archivo SQL descargado.");
  }

  function changePage(next: Page) {
    setPage(next);
    setMobileSidebar(false);
  }
  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    const width =
      event.currentTarget.parentElement!.getBoundingClientRect().width;
    resizeStart.current = {
      x: event.clientX,
      width: workspace.panelWidth,
      parentWidth: width,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveResize(event: ReactPointerEvent<HTMLDivElement>) {
    const start = resizeStart.current;
    if (!start) return;
    const next = Math.max(
      28,
      Math.min(
        48,
        start.width + ((start.x - event.clientX) / start.parentWidth) * 100,
      ),
    );
    setWorkspace((current) => ({ ...current, panelWidth: next }));
  }

  return (
    <div
      className={`app-shell ${workspace.sidebarOpen ? "" : "sidebar-collapsed"} ${mobileSidebar ? "mobile-menu-open" : ""}`}
    >
      <a className="skip-link" href="#workspace">
        Saltar al espacio de trabajo
      </a>
      {mobileSidebar && (
        <button
          className="sidebar-backdrop"
          aria-label="Cerrar menú"
          onClick={() => setMobileSidebar(false)}
        />
      )}
      <aside
        ref={navigation}
        className="sidebar"
        aria-label="Navegación del laboratorio"
      >
        <button
          className="icon-button mobile-nav-close"
          aria-label="Cerrar navegación"
          onClick={() => setMobileSidebar(false)}
        >
          <X size={17} />
        </button>
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            changePage("practice");
          }}
          aria-label="SyntaxLab, inicio"
        >
          <span className="brand-mark">
            <Code2 size={22} strokeWidth={2.6} />
          </span>
          <span>
            Syntax<span className="brand-light">Lab</span>
            <small>PREPARA TU FINAL</small>
          </span>
        </a>
        <div className="sidebar-section-label">ESTUDIAR</div>
        <nav className="main-nav" aria-label="Estudio">
          {([
            ["tree", "Árbol sintáctico", GitBranch],
            ["practice", "Prácticas", GraduationCap],
            ["evaluate", "Evaluarme", Check],
            ["concepts", "Repaso", BookOpen],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} className={page === id ? "active" : ""}
              aria-current={page === id ? "page" : undefined}
              onClick={() => { setPracticeTopic(undefined); changePage(id); }}>
              <Icon size={18} />{label}
            </button>
          ))}
        </nav>
        <div className="sidebar-section-label">HERRAMIENTAS</div>
        <nav className="main-nav" aria-label="Herramientas">
          {([
            ["sql", "Laboratorio SQL", Terminal],
            ["derivations", "Derivaciones", GitBranch],
            ["formal", "Autómatas y LL(1)", Layers3],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} className={page === id ? "active" : ""}
              aria-current={page === id ? "page" : undefined}
              onClick={() => changePage(id)}>
              <Icon size={18} />{label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="help-link" onClick={() => helpDialog.current?.showModal()}>
            <CircleHelp size={17} />Ayuda y atajos
          </button>
        </div>
      </aside>

      <div className="app-body" inert={mobileSidebar || undefined}>
        <header className="topbar">
          <button
            className="icon-button desktop-menu"
            aria-label={
              workspace.sidebarOpen
                ? "Ocultar navegación"
                : "Mostrar navegación"
            }
            onClick={() =>
              setWorkspace((current) => ({
                ...current,
                sidebarOpen: !current.sidebarOpen,
              }))
            }
          >
            {workspace.sidebarOpen ? (
              <PanelLeftClose size={18} />
            ) : (
              <Menu size={18} />
            )}
          </button>
          <button
            ref={mobileMenuButton}
            className="icon-button mobile-menu"
            aria-label="Abrir navegación"
            onClick={() => setMobileSidebar(true)}
          >
            <Menu size={19} />
          </button>
          <div className="breadcrumb">
            <span>{pageNames[page]}</span>
          </div>
          <div className="topbar-right">
            <span
              className={`save-state ${saved ? "" : "save-error"}`}
              role="status"
            >
              {saved ? <CheckCheck size={15} /> : <Info size={15} />}
              {saved ? "Guardado local" : "Sin guardado local"}
            </span>
          </div>
        </header>

        <main id="workspace" tabIndex={-1}>
          {page === "sql" ? (
            <>
              <div className="page-intro">
                <div>
                  <h1>Laboratorio SQL</h1>
                  <p>Escribe o elige un ejemplo y pulsa Analizar.</p>
                </div>
                <button className="text-button inspector-toggle"
                  onClick={() => setWorkspace(current => ({ ...current, inspectorOpen: !current.inspectorOpen }))}>
                  {workspace.inspectorOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
                  {workspace.inspectorOpen ? "Ocultar resultados" : "Mostrar resultados"}
                </button>
              </div>
              <div
                className={`lab-panels ${workspace.inspectorOpen ? "" : "inspector-hidden"}`}
                style={
                  {
                    "--inspector-width": `${workspace.panelWidth}%`,
                  } as CSSProperties
                }
              >
                <section className="workbench" aria-label="Espacio de edición">
                  <div className="editor-card">
                    <div className="editor-tabs">
                      <span className="file-tab">
                        <FileCode2 size={16} />
                        {isOriginal ? "pizarra.sql" : "consulta.sql"}
                        <span className="file-dot" />
                      </span>
                      <span className="language-label">SQL educativo</span>
                    </div>
                    <div className="editor-toolbar">
                      <div className="example-select">
                        <label htmlFor="example">Ejemplo</label>
                        <select
                          id="example"
                          value={workspace.exampleId}
                          onChange={(event) => loadExample(event.target.value)}
                        >
                          {EXAMPLES.map((example) => (
                            <option key={example.id} value={example.id}>
                              {example.title}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={13} />
                      </div>
                      <div className="editor-actions">
                        <button
                          className="icon-button"
                          aria-label="Reducir tamaño de texto"
                          disabled={workspace.fontSize <= 12}
                          onClick={() =>
                            setWorkspace((current) => ({
                              ...current,
                              fontSize: current.fontSize - 1,
                            }))
                          }
                        >
                          <Minus size={14} />
                        </button>
                        <span className="font-size">{workspace.fontSize}</span>
                        <button
                          className="icon-button"
                          aria-label="Aumentar tamaño de texto"
                          disabled={workspace.fontSize >= 20}
                          onClick={() =>
                            setWorkspace((current) => ({
                              ...current,
                              fontSize: current.fontSize + 1,
                            }))
                          }
                        >
                          <Plus size={14} />
                        </button>
                        <span className="tool-divider" />
                        <button
                          className="icon-button"
                          aria-label="Restaurar ejemplo seleccionado"
                          title="Restaurar ejemplo"
                          onClick={() => loadExample(selected.id)}
                        >
                          <RotateCcw size={15} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Descargar archivo SQL"
                          title="Descargar SQL"
                          onClick={downloadSql}
                        >
                          <ArrowDownToLine size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="editor-container">
                      <Suspense
                        fallback={
                          <div className="editor-loading" role="status">
                            Preparando tu editor…
                          </div>
                        }
                      >
                        <SqlEditor
                          value={workspace.sql}
                          onChange={(sql) =>
                            setWorkspace((current) => ({ ...current, sql }))
                          }
                          fontSize={workspace.fontSize}
                          onCursorChange={setCursor}
                          onReview={reviewInput}
                          selectedRange={stale ? null : selectedRange}
                          diagnostics={
                            stale
                              ? []
                              : [
                                  ...(analysis?.diagnostics ?? []),
                                  ...(semantic?.diagnostics ?? []),
                                ]
                          }
                        />
                      </Suspense>
                    </div>
                    <div className="editor-status">
                      <span>
                        <span className="status-dot blue" />
                        {isOriginal
                          ? "Entrada original conservada"
                          : "Borrador editable"}
                      </span>
                      <span>
                        Ln {cursor.line}, Col {cursor.column}
                        <span className="status-separator">|</span>UTF-8
                      </span>
                    </div>
                    <div className="run-bar">
                      <span>
                        <Keyboard size={14} />
                        <kbd>Ctrl</kbd> + <kbd>Enter</kbd>
                      </span>
                      <button className="primary-button" onClick={reviewInput}>
                        <Check size={16} />
                        Analizar
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                  <CatalogPanel catalog={catalog} onChange={setCatalog} />
                </section>

                {workspace.inspectorOpen && (
                  <>
                    <div
                      className="panel-resizer"
                      role="separator"
                      aria-label="Ajustar ancho de los resultados"
                      aria-orientation="vertical"
                      aria-valuemin={28}
                      aria-valuemax={48}
                      aria-valuenow={Math.round(workspace.panelWidth)}
                      tabIndex={0}
                      onPointerDown={startResize}
                      onPointerMove={moveResize}
                      onPointerUp={() => {
                        resizeStart.current = null;
                      }}
                      onPointerCancel={() => {
                        resizeStart.current = null;
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.key === "ArrowLeft" ||
                          event.key === "ArrowRight"
                        ) {
                          event.preventDefault();
                          const delta = event.key === "ArrowLeft" ? 2 : -2;
                          setWorkspace((current) => ({
                            ...current,
                            panelWidth: Math.max(
                              28,
                              Math.min(48, current.panelWidth + delta),
                            ),
                          }));
                        }
                      }}
                    >
                      <span />
                    </div>
                    <SqlResults
                      result={analysis}
                      stale={stale}
                      semantic={semantic}
                      onSelectRange={(range, focusEditor = true) =>
                        setSelectedRange({ ...range, focusEditor })
                      }
                      onAnalyze={reviewInput}
                    />
                  </>
                )}
              </div>
            </>
          ) : page === "tree" ? (
            <Suspense fallback={<p role="status">Preparando árbol…</p>}>
              <SyntaxTreeLab sql={workspace.sql} exampleId={workspace.exampleId} fontSize={workspace.fontSize}
                result={analysis} selectedRange={selectedRange}
                onChange={sql => setWorkspace(current => ({ ...current, sql }))}
                onExample={id => loadExample(id, "tree")} onAnalyze={reviewInput}
                onSelectRange={(range, focusEditor = true) => setSelectedRange({ ...range, focusEditor })} />
            </Suspense>
          ) : page === "concepts" ? (
            <StudyPages onPractice={topic => { setPracticeTopic(topic); changePage("practice"); }} />
          ) : (
            <Suspense fallback={<p role="status">Preparando laboratorio…</p>}>
              {page === "derivations" ? (
                <DerivationLab />
              ) : page === "formal" ? (
                <FormalLab />
              ) : (
                <PracticeLab
                  key={
                    page + "-" + (practiceTopic ?? "all")
                  }
                  mode={page === "evaluate" ? "evaluate" : "practice"}
                  initialTopic={practiceTopic}
                />
              )}
            </Suspense>
          )}
        </main>

      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{notice}</span>
          {previousSql && notice.startsWith("Ejemplo") && (
            <button
              onClick={() => {
                setWorkspace((current) => ({ ...current, ...previousSql }));
                setPreviousSql(null);
                setNotice("Texto anterior recuperado.");
              }}
            >
              Deshacer
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Cerrar notificación"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <dialog
        ref={helpDialog}
        className="help-dialog"
        aria-labelledby="help-title"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const buttons =
            event.currentTarget.querySelectorAll<HTMLButtonElement>("button");
          const first = buttons[0];
          const last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) helpDialog.current?.close();
        }}
      >
        <div className="dialog-heading">
          <span className="brand-mark">
            <Code2 size={21} />
          </span>
          <button
            className="icon-button"
            aria-label="Cerrar ayuda"
            onClick={() => helpDialog.current?.close()}
            autoFocus
          >
            <X size={19} />
          </button>
        </div>
        <h2 id="help-title">Cómo estudiar</h2>
        <p>Practica por tema, comprueba tu respuesta y avanza. Usa Evaluarme para responder sin pistas y Repaso para consultar ejemplos.</p>
        <div className="shortcut-row">
          <span>Analizar SQL</span>
          <kbd>Ctrl / ⌘ + Enter</kbd>
        </div>
        <div className="shortcut-row">
          <span>Ajustar resultados con teclado</span>
          <kbd>← / → en el separador</kbd>
        </div>
        <div className="shortcut-row">
          <span>Salir del editor con teclado</span>
          <kbd>Ctrl / ⌘ + M, luego Tab</kbd>
        </div>
        <p className="help-storage">
          El borrador se guarda solo en este navegador. Si borras sus datos, se
          perderá. Puedes descargar tu SQL para conservar una copia.
        </p>
        <button
          className="primary-button full-width"
          onClick={() => helpDialog.current?.close()}
        >
          Continuar <ArrowRight size={15} />
        </button>
      </dialog>
    </div>
  );
}
