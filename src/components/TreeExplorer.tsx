import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Focus,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import type {
  DerivationStep,
  SourceRange,
  TreeNode,
} from "../engine/sql/types";
import "./tree.css";

interface TreeExplorerProps {
  root: TreeNode;
  onSelectRange: (range: SourceRange, focusEditor?: boolean) => void;
  derivations?: { left: DerivationStep[]; right: DerivationStep[] };
}

interface Branch {
  node: TreeNode;
  key: string;
  parentKey?: string;
  children: Branch[];
}
interface PlacedNode {
  branch: Branch;
  x: number;
  y: number;
  width: number;
}
interface Diagram {
  nodes: PlacedNode[];
  links: { from: PlacedNode; to: PlacedNode }[];
  width: number;
  height: number;
}

const NODE_HEIGHT = 58;
const LEVEL_GAP = 108;
const SIBLING_GAP = 24;
const PADDING = 32;
const kindNames = {
  terminal: "Terminal",
  nonterminal: "No terminal",
  abstract: "Nodo abstracto",
};
const categoryNames = {
  keyword: "Palabra reservada",
  identifier: "Identificador",
  function: "Función",
  operator: "Operador",
  number: "Número",
  string: "Texto",
  delimiter: "Delimitador",
  comment: "Comentario",
  whitespace: "Espacio",
  invalid: "No reconocido",
};
const palettes = {
  terminal: {
    background: "#152D2B",
    border: "#357E70",
    text: "#B4E2D2",
    secondary: "#8ABBAE",
  },
  nonterminal: {
    background: "#1A2945",
    border: "#3F639A",
    text: "#D5E3FF",
    secondary: "#94AED7",
  },
  abstract: {
    background: "#2B2341",
    border: "#746098",
    text: "#E0D1F8",
    secondary: "#B4A0D0",
  },
};

const terminalPalettes: Partial<
  Record<NonNullable<TreeNode["category"]>, typeof palettes.terminal>
> = {
  keyword: {
    background: "#192e4a",
    border: "#527db9",
    text: "#bbd6ff",
    secondary: "#83abe2",
  },
  identifier: {
    background: "#25313c",
    border: "#647c91",
    text: "#d3e2ef",
    secondary: "#9db7cb",
  },
  function: {
    background: "#302744",
    border: "#896caf",
    text: "#e3cffc",
    secondary: "#b59bd9",
  },
  number: {
    background: "#362c20",
    border: "#a7834e",
    text: "#f2d09c",
    secondary: "#c4a26b",
  },
  string: {
    background: "#17352b",
    border: "#4d967a",
    text: "#b0e5cc",
    secondary: "#82ba9f",
  },
  operator: {
    background: "#2c293d",
    border: "#7c789e",
    text: "#dedaf4",
    secondary: "#aca6cc",
  },
  delimiter: {
    background: "#25303e",
    border: "#536d90",
    text: "#b8d0ee",
    secondary: "#8aa5c8",
  },
};

function indexTree(root: TreeNode) {
  const branches: Branch[] = [];
  const byKey = new Map<string, Branch>();
  const ancestors = new Set<TreeNode>();
  function visit(
    node: TreeNode,
    key: string,
    parentKey?: string,
    depth = 0,
  ): Branch {
    if (
      !node ||
      typeof node.label !== "string" ||
      !Array.isArray(node.children) ||
      !(node.kind in palettes)
    )
      throw new Error("El árbol recibido no tiene una estructura válida.");
    if (ancestors.has(node))
      throw new Error(
        "El árbol contiene una referencia circular y no se puede representar.",
      );
    if (depth > 512 || branches.length >= 10_000)
      throw new Error(
        "El árbol supera el tamaño que puede explorar esta vista. Reduce la entrada y vuelve a analizarla.",
      );
    const branch: Branch = { node, key, parentKey, children: [] };
    branches.push(branch);
    byKey.set(key, branch);
    ancestors.add(node);
    branch.children = node.children.map((child, index) =>
      visit(child, `${key}-${index}`, key, depth + 1),
    );
    ancestors.delete(node);
    return branch;
  }
  try {
    return { root: visit(root, "node-0"), branches, byKey, error: "" };
  } catch (error) {
    return {
      root: null,
      branches: [],
      byKey: new Map<string, Branch>(),
      error:
        error instanceof Error
          ? error.message
          : "No se ha podido preparar el árbol.",
    };
  }
}

function nodeWidth(label: string) {
  return Math.max(128, Math.min(252, Array.from(label).length * 7.5 + 38));
}

function shortLabel(label: string) {
  const characters = Array.from(label.replace(/\s+/g, " "));
  return characters.length > 28
    ? `${characters.slice(0, 27).join("")}…`
    : characters.join("");
}

// Subtrees receive disjoint horizontal spans; each parent is centered over its children.
function layoutTree(root: Branch | null, visible: Set<string>): Diagram {
  if (!root || !visible.has(root.key))
    return { nodes: [], links: [], width: 0, height: 0 };
  const widths = new Map<string, number>();
  function measure(branch: Branch): number {
    const children = branch.children.filter((child) => visible.has(child.key));
    const descendantsWidth =
      children.reduce((sum, child) => sum + measure(child), 0) +
      Math.max(0, children.length - 1) * SIBLING_GAP;
    const width = Math.max(nodeWidth(branch.node.label), descendantsWidth);
    widths.set(branch.key, width);
    return width;
  }
  const treeWidth = measure(root);
  const nodes: PlacedNode[] = [];
  const links: Diagram["links"] = [];
  let maxDepth = 0;
  function place(
    branch: Branch,
    left: number,
    depth: number,
    parent?: PlacedNode,
  ) {
    const width = widths.get(branch.key)!;
    const placed = {
      branch,
      x: PADDING + left + width / 2,
      y: PADDING + depth * LEVEL_GAP,
      width: nodeWidth(branch.node.label),
    };
    nodes.push(placed);
    if (parent) links.push({ from: parent, to: placed });
    maxDepth = Math.max(maxDepth, depth);
    const children = branch.children.filter((child) => visible.has(child.key));
    const childrenWidth =
      children.reduce((sum, child) => sum + widths.get(child.key)!, 0) +
      Math.max(0, children.length - 1) * SIBLING_GAP;
    let childLeft = left + (width - childrenWidth) / 2;
    children.forEach((child) => {
      place(child, childLeft, depth + 1, placed);
      childLeft += widths.get(child.key)! + SIBLING_GAP;
    });
  }
  place(root, 0, 0);
  return {
    nodes,
    links,
    width: treeWidth + PADDING * 2,
    height: maxDepth * LEVEL_GAP + NODE_HEIGHT + PADDING * 2,
  };
}

export default function TreeExplorer({
  root,
  onSelectRange,
  derivations,
}: TreeExplorerProps) {
  const instanceId = `tree-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const containerRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    viewX: number;
    viewY: number;
  } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [selectedKey, setSelectedKey] = useState("node-0");
  const [visibleLimit, setVisibleLimit] = useState<number | null>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 440 });
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [panning, setPanning] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [notice, setNotice] = useState("");
  const [derivationSide, setDerivationSide] = useState<"left" | "right">(
    "left",
  );
  const [derivationIndex, setDerivationIndex] = useState(0);
  const model = useMemo(() => indexTree(root), [root]);

  const expandedTraversal = useMemo(() => {
    const traversal: Branch[] = [];
    function visit(branch: Branch) {
      traversal.push(branch);
      if (!collapsed.has(branch.key)) branch.children.forEach(visit);
    }
    if (model.root) visit(model.root);
    return traversal;
  }, [model, collapsed]);
  const revealedCount = Math.min(
    visibleLimit ?? expandedTraversal.length,
    expandedTraversal.length,
  );
  const visibleKeys = useMemo(
    () =>
      new Set(
        expandedTraversal.slice(0, revealedCount).map((branch) => branch.key),
      ),
    [expandedTraversal, revealedCount],
  );
  const diagram = useMemo(
    () => layoutTree(model.root, visibleKeys),
    [model, visibleKeys],
  );
  const selected = model.byKey.get(selectedKey) ?? model.root;
  const derivationSteps = derivations?.[derivationSide] ?? [];
  const currentDerivation =
    derivationSteps[
      Math.min(derivationIndex, Math.max(0, derivationSteps.length - 1))
    ];
  const fitView = useCallback(() => {
    if (!diagram.width || !diagram.height) return;
    const scale = Math.max(
      0.0001,
      Math.min(
        1,
        (viewport.width - 36) / diagram.width,
        (viewport.height - 36) / diagram.height,
      ),
    );
    setView({
      x: (viewport.width - diagram.width * scale) / 2,
      y: (viewport.height - diagram.height * scale) / 2,
      scale,
    });
  }, [diagram.width, diagram.height, viewport]);

  useEffect(() => {
    setCollapsed(new Set());
    setSelectedKey("node-0");
    setVisibleLimit(null);
    setDerivationIndex(0);
    setNotice("");
  }, [root]);

  useEffect(() => {
    fitView();
  }, [fitView, root]);

  useEffect(() => {
    const viewportElement = viewportRef.current;
    if (!viewportElement) return;
    const measure = () => {
      const bounds = viewportElement.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0)
        setViewport({ width: bounds.width, height: bounds.height });
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(viewportElement);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [model.error]);

  useEffect(() => {
    setCanFullscreen(
      Boolean(
        containerRef.current?.requestFullscreen && document.fullscreenEnabled,
      ),
    );
    const update = () =>
      setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  function selectBranch(branch: Branch, focus = false, focusEditor = false) {
    setSelectedKey(branch.key);
    const { start, end, line, column } = branch.node;
    onSelectRange({ start, end, line, column }, focusEditor);
    if (focus) document.getElementById(`${instanceId}-${branch.key}`)?.focus();
  }

  function toggleBranch(branch: Branch) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(branch.key)) next.delete(branch.key);
      else next.add(branch.key);
      return next;
    });
    setVisibleLimit(null);
    selectBranch(branch);
  }

  function handleNodeKey(event: KeyboardEvent<SVGGElement>, branch: Branch) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectBranch(branch);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (branch.children.length && !collapsed.has(branch.key))
        toggleBranch(branch);
      else if (branch.parentKey)
        selectBranch(model.byKey.get(branch.parentKey)!, true);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      if (collapsed.has(branch.key)) toggleBranch(branch);
      else if (branch.children[0] && visibleKeys.has(branch.children[0].key))
        selectBranch(branch.children[0], true);
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const index = expandedTraversal.findIndex(
        (item) => item.key === branch.key,
      );
      const next =
        expandedTraversal[index + (event.key === "ArrowDown" ? 1 : -1)];
      if (next && visibleKeys.has(next.key)) selectBranch(next, true);
    }
  }

  function zoom(factor: number) {
    setView((current) => {
      const minScale = Math.min(
        0.05,
        (viewport.width - 36) / Math.max(diagram.width, 1),
        (viewport.height - 36) / Math.max(diagram.height, 1),
      );
      const scale = Math.max(minScale, Math.min(3, current.scale * factor));
      const ratio = scale / current.scale;
      return {
        scale,
        x: viewport.width / 2 - (viewport.width / 2 - current.x) * ratio,
        y: viewport.height / 2 - (viewport.height / 2 - current.y) * ratio,
      };
    });
  }

  function startPan(event: PointerEvent<SVGSVGElement>) {
    if (
      event.button !== 0 ||
      (event.target as Element).closest("[data-tree-control]")
    )
      return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      viewX: view.x,
      viewY: view.y,
    };
    setPanning(true);
  }

  function movePan(event: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setView((current) => ({
      ...current,
      x:
        drag.viewX + ((event.clientX - drag.x) * viewport.width) / bounds.width,
      y:
        drag.viewY +
        ((event.clientY - drag.y) * viewport.height) / bounds.height,
    }));
  }

  function stopPan() {
    dragRef.current = null;
    setPanning(false);
  }

  function resetTree() {
    setCollapsed(new Set());
    setVisibleLimit(null);
    setSelectedKey("node-0");
    setDerivationIndex(0);
    setNotice("Vista restablecida.");
    fitView();
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === containerRef.current)
        await document.exitFullscreen();
      else await containerRef.current?.requestFullscreen();
    } catch {
      setNotice(
        "El navegador no permitió abrir esta vista en pantalla completa.",
      );
    }
  }

  function exportSvg() {
    if (!svgRef.current || !diagram.nodes.length) return;
    try {
      const exported = svgRef.current.cloneNode(true) as SVGSVGElement;
      const x = view.x;
      const y = view.y;
      const width = Math.max(1, diagram.width * view.scale);
      const height = Math.max(1, diagram.height * view.scale);
      exported.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      exported.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
      exported.setAttribute("width", String(Math.ceil(width)));
      exported.setAttribute("height", String(Math.ceil(height)));
      exported.removeAttribute("class");
      const background = exported.querySelector("[data-tree-background]");
      background?.setAttribute("x", String(x));
      background?.setAttribute("y", String(y));
      background?.setAttribute("width", String(width));
      background?.setAttribute("height", String(height));
      exported.querySelector("[data-tree-grid]")?.remove();
      exported
        .querySelectorAll("[tabindex]")
        .forEach((element) => element.removeAttribute("tabindex"));
      const url = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(exported)], {
          type: "image/svg+xml;charset=utf-8",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "syntaxlab-arbol.svg";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setNotice(`SVG exportado con ${diagram.nodes.length} nodos visibles.`);
    } catch {
      setNotice("No se pudo exportar el SVG. Inténtalo de nuevo.");
    }
  }

  function chooseDerivation(index: number) {
    setDerivationIndex(index);
    const step = derivationSteps[index];
    const branch =
      step && model.branches.find((item) => item.node.id === step.nodeId);
    if (!branch) return;
    setCollapsed((current) => {
      const next = new Set(current);
      let parentKey = branch.parentKey;
      while (parentKey) {
        next.delete(parentKey);
        parentKey = model.byKey.get(parentKey)?.parentKey;
      }
      return next;
    });
    setVisibleLimit(null);
    selectBranch(branch);
  }

  return (
    <section
      className="tree-explorer"
      ref={containerRef}
      aria-label="Explorador del árbol"
    >
      <div className="tree-toolbar">
        <div className="tree-toolbar-title">
          <span className="small-blue-dot" />
          <strong>Explorador del árbol</strong>
          <span>{model.branches.length} nodos</span>
        </div>
        <div
          className="tree-toolbar-actions"
          role="group"
          aria-label="Controles del árbol"
        >
          <button
            type="button"
            onClick={() => zoom(1 / 1.25)}
            aria-label="Alejar árbol"
            title="Alejar"
            disabled={!diagram.nodes.length}
          >
            <Minus size={16} />
          </button>
          <output className="tree-zoom" aria-label="Nivel de zoom">
            {Math.round(view.scale * 100)}%
          </output>
          <button
            type="button"
            onClick={() => zoom(1.25)}
            aria-label="Acercar árbol"
            title="Acercar"
            disabled={!diagram.nodes.length}
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={fitView}
            aria-label="Ajustar árbol a la vista"
            title="Ajustar a la vista"
            disabled={!diagram.nodes.length}
          >
            <Focus size={16} />
          </button>
          <button
            type="button"
            onClick={resetTree}
            aria-label="Restablecer árbol"
            title="Restablecer vista"
            disabled={!diagram.nodes.length}
          >
            <RotateCcw size={15} />
          </button>
          <button
            type="button"
            onClick={exportSvg}
            aria-label="Exportar árbol visible como SVG"
            title="Exportar SVG"
            disabled={!diagram.nodes.length}
          >
            <Download size={16} />
          </button>
          {canFullscreen && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={
                fullscreen
                  ? "Salir de pantalla completa"
                  : "Ver árbol en pantalla completa"
              }
              aria-pressed={fullscreen}
              title="Pantalla completa"
            >
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          )}
        </div>
      </div>

      {model.error ? (
        <div className="tree-fallback" role="status">
          <strong>No se puede mostrar el árbol</strong>
          <p>{model.error}</p>
        </div>
      ) : (
        <>
          <div
            className={`tree-viewport ${panning ? "is-panning" : ""}`}
            ref={viewportRef}
          >
            <svg
              ref={svgRef}
              className="tree-canvas"
              viewBox={`0 0 ${viewport.width} ${viewport.height}`}
              role="group"
              aria-labelledby={`${instanceId}-title ${instanceId}-description`}
              onPointerDown={startPan}
              onPointerMove={movePan}
              onPointerUp={stopPan}
              onPointerCancel={stopPan}
              onLostPointerCapture={stopPan}
            >
              <title id={`${instanceId}-title`}>Árbol de {root.label}</title>
              <desc id={`${instanceId}-description`}>
                Selecciona un nodo para ver su regla y rango en el SQL. Usa las
                flechas para recorrerlo; derecha e izquierda expanden y contraen
                ramas. Arrastra el fondo para desplazar la vista.
              </desc>
              <defs>
                <pattern
                  id={`${instanceId}-grid`}
                  width="22"
                  height="22"
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="1" cy="1" r="0.8" fill="#2A3447" />
                </pattern>
              </defs>
              <rect
                data-tree-background
                width={viewport.width}
                height={viewport.height}
                fill="#10151F"
              />
              <rect
                data-tree-grid
                width={viewport.width}
                height={viewport.height}
                fill={`url(#${instanceId}-grid)`}
              />
              <g
                data-tree-diagram
                transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}
              >
                {diagram.links.map(({ from, to }) => (
                  <path
                    key={to.branch.key}
                    d={`M ${from.x} ${from.y + NODE_HEIGHT} C ${from.x} ${from.y + NODE_HEIGHT + 24}, ${to.x} ${to.y - 24}, ${to.x} ${to.y}`}
                    fill="none"
                    stroke="#485B79"
                    strokeWidth="1.5"
                  />
                ))}
                {diagram.nodes.map(({ branch, x, y, width }) => {
                  const { node, key } = branch;
                  const palette =
                    node.kind === "terminal" && node.category
                      ? (terminalPalettes[node.category] ?? palettes.terminal)
                      : palettes[node.kind];
                  const isSelected = selected?.key === key;
                  const isCollapsed = collapsed.has(key);
                  return (
                    <g key={key} transform={`translate(${x - width / 2} ${y})`}>
                      <g
                        id={`${instanceId}-${key}`}
                        data-tree-control
                        data-node-id={node.id}
                        className="tree-node"
                        role="button"
                        tabIndex={
                          isSelected ||
                          (!visibleKeys.has(selectedKey) && key === "node-0")
                            ? 0
                            : -1
                        }
                        aria-label={`${node.label}. ${kindNames[node.kind]}${node.category ? `. ${categoryNames[node.category]}` : ""}. Línea ${node.line}, columna ${node.column}`}
                        aria-pressed={isSelected}
                        onClick={() => selectBranch(branch)}
                        onKeyDown={(event) => handleNodeKey(event, branch)}
                      >
                        <title>{node.label}</title>
                        <rect
                          width={width}
                          height={NODE_HEIGHT}
                          rx="9"
                          fill={palette.background}
                          stroke={isSelected ? "#E2ECFF" : palette.border}
                          strokeWidth={isSelected ? 2.5 : 1.2}
                        />
                        <text
                          x={width / 2}
                          y="24"
                          textAnchor="middle"
                          fill={palette.text}
                          fontFamily="Consolas, monospace"
                          fontSize="12"
                        >
                          {shortLabel(node.label) || "ε"}
                        </text>
                        <text
                          x={width / 2}
                          y="43"
                          textAnchor="middle"
                          fill={palette.secondary}
                          fontFamily="system-ui, sans-serif"
                          fontSize="9"
                        >
                          {node.category
                            ? categoryNames[node.category]
                            : kindNames[node.kind]}
                        </text>
                      </g>
                      {branch.children.length > 0 && (
                        <g
                          data-tree-control
                          className="tree-branch-toggle"
                          role="button"
                          tabIndex={0}
                          aria-label={`${isCollapsed ? "Expandir" : "Contraer"} rama ${node.label}`}
                          aria-expanded={!isCollapsed}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleBranch(branch);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              toggleBranch(branch);
                            }
                          }}
                          transform={`translate(${width - 1} ${NODE_HEIGHT - 1})`}
                        >
                          <circle r="10" fill="#182436" stroke="#637B9E" />
                          <path
                            d={
                              isCollapsed
                                ? "M -4 0 H 4 M 0 -4 V 4"
                                : "M -4 0 H 4"
                            }
                            stroke="#D2DFF2"
                            strokeWidth="1.5"
                          />
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
            <div className="tree-pan-hint" aria-hidden="true">
              Arrastra el fondo para mover · selecciona un nodo para
              inspeccionar
            </div>
          </div>
          <div className="tree-progress">
            <label htmlFor={`${instanceId}-progress`}>
              Recorrido en preorden{" "}
              <strong>
                {revealedCount} / {expandedTraversal.length}
              </strong>
            </label>
            <div className="tree-progress-controls">
              <button
                type="button"
                aria-label="Mostrar un nodo menos"
                disabled={revealedCount <= 1}
                onClick={() => setVisibleLimit(Math.max(1, revealedCount - 1))}
              >
                <ChevronLeft size={17} />
              </button>
              <input
                id={`${instanceId}-progress`}
                type="range"
                min={1}
                max={Math.max(1, expandedTraversal.length)}
                value={Math.max(1, revealedCount)}
                onChange={(event) =>
                  setVisibleLimit(Number(event.target.value))
                }
                aria-valuetext={`${revealedCount} de ${expandedTraversal.length} nodos expandidos visibles`}
              />
              <button
                type="button"
                aria-label="Mostrar el siguiente nodo"
                disabled={revealedCount >= expandedTraversal.length}
                onClick={() => setVisibleLimit(revealedCount + 1)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
            <div className="tree-legend">
              <span>
                <i className="terminal" />
                Terminal
              </span>
              <span>
                <i className="nonterminal" />
                No terminal
              </span>
              <span>
                <i className="abstract" />
                Abstracto
              </span>
            </div>
          </div>
          {selected && (
            <div
              className="tree-node-details"
              aria-label="Detalle del nodo seleccionado"
            >
              <div className="tree-details-heading">
                <span>
                  {kindNames[selected.node.kind]}
                  {selected.node.category
                    ? ` · ${categoryNames[selected.node.category]}`
                    : ""}
                </span>
                <button
                  type="button"
                  onClick={() => selectBranch(selected, false, true)}
                >
                  Ver en el editor <ChevronRight size={14} />
                </button>
              </div>
              <code className="tree-selected-label">
                {selected.node.label || "ε"}
              </code>
              <dl>
                <div>
                  <dt>Regla</dt>
                  <dd>
                    {selected.node.rule ||
                      (selected.node.kind === "terminal"
                        ? "Token de la entrada."
                        : "Este nodo no declara una regla de producción.")}
                  </dd>
                </div>
                <div>
                  <dt>Rango UTF-16</dt>
                  <dd>
                    [{selected.node.start}, {selected.node.end}) · Línea{" "}
                    {selected.node.line}, columna {selected.node.column}
                  </dd>
                </div>
              </dl>
            </div>
          )}
          {derivations &&
            (derivations.left.length > 0 || derivations.right.length > 0) && (
              <details className="tree-derivations">
                <summary>
                  Derivaciones del árbol <ChevronDown size={15} />
                </summary>
                <div className="tree-derivation-body">
                  <div
                    className="tree-derivation-choice"
                    role="group"
                    aria-label="Orden de derivación"
                  >
                    <button
                      type="button"
                      aria-pressed={derivationSide === "left"}
                      onClick={() => {
                        setDerivationSide("left");
                        setDerivationIndex(0);
                      }}
                    >
                      Por la izquierda
                    </button>
                    <button
                      type="button"
                      aria-pressed={derivationSide === "right"}
                      onClick={() => {
                        setDerivationSide("right");
                        setDerivationIndex(0);
                      }}
                    >
                      Por la derecha
                    </button>
                  </div>
                  {currentDerivation ? (
                    <>
                      <label htmlFor={`${instanceId}-derivation`}>
                        Producción{" "}
                        {Math.min(derivationIndex + 1, derivationSteps.length)}{" "}
                        de {derivationSteps.length}
                      </label>
                      <input
                        id={`${instanceId}-derivation`}
                        type="range"
                        min={0}
                        max={derivationSteps.length - 1}
                        value={Math.min(
                          derivationIndex,
                          derivationSteps.length - 1,
                        )}
                        onChange={(event) =>
                          chooseDerivation(Number(event.target.value))
                        }
                      />
                      <code>{currentDerivation.rule}</code>
                      <p className="tree-sentential-form">
                        <span>Antes</span>
                        {currentDerivation.before.join(" ") || "ε"}
                      </p>
                      <p className="tree-sentential-form">
                        <span>Después</span>
                        {currentDerivation.after.join(" ") || "ε"}
                      </p>
                      <button
                        type="button"
                        className="tree-derivation-node"
                        onClick={() => chooseDerivation(derivationIndex)}
                      >
                        Localizar nodo de esta producción{" "}
                        <ChevronRight size={14} />
                      </button>
                    </>
                  ) : (
                    <p>No hay pasos de derivación para este orden.</p>
                  )}
                </div>
              </details>
            )}
        </>
      )}
      <p className="tree-announcement" role="status" aria-live="polite">
        {notice}
      </p>
    </section>
  );
}
