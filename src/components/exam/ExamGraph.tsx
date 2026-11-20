import { useMemo, useRef, useState } from 'react';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Node, type NodeProps, type Edge } from '@xyflow/react';
import { Maximize2 } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import { layoutExamGraph, type ExamGraphNode, type ExamGraphEdge } from '../../engine/exam/graph';

interface GraphProps {
  nodes: ExamGraphNode[];
  edges: ExamGraphEdge[];
  dependencyEdges?: ExamGraphEdge[];
  activeAttributeId?: string;
  completedAttributeIds?: string[];
}
interface FlowData extends Record<string, unknown> {
  item: ExamGraphNode;
  activeAttributeId?: string;
  completedAttributeIds: string[];
}
const roleLabels = { root: 'Nodo Raíz', internal: 'Sub-nodo (Nodo Interno/Padre)', token: 'Nodo Hoja (Token)' };
const kindLabels = { synthesized: 'Sintetizado', inherited: 'Heredado', lexical: 'Sintetizado · léxico', action: 'Acción semántica' };
function RecordNode({ data }: NodeProps<Node<FlowData>>) {
  const { item } = data;
  return <div className={`exam-record exam-record-${item.role}`}>
    <Handle type="target" position={Position.Top} id="tree-in" />
    <span className="exam-node-role">{roleLabels[item.role]}</span>
    <strong className="exam-node-label">{item.label}</strong>
    {item.attributes?.map(attribute => <div key={attribute.id}
      className={`exam-attribute ${attribute.kind} ${data.activeAttributeId === attribute.id ? 'active' : ''} ${data.completedAttributeIds.includes(attribute.id) ? 'complete' : ''}`}>
      <Handle type="target" position={Position.Left} id={attribute.id} />
      <span className="exam-attribute-kind">{kindLabels[attribute.kind]}</span>
      <code>{attribute.label} = <b>{attribute.value ?? '?'}</b></code>
      <Handle type="source" position={Position.Right} id={attribute.id} />
    </div>)}
    <Handle type="source" position={Position.Bottom} id="tree-out" />
  </div>;
}
const nodeTypes = { record: RecordNode };
const EMPTY_IDS: string[] = [];
const EMPTY_EDGES: ExamGraphEdge[] = [];

export default function ExamGraph({ nodes, edges, dependencyEdges = EMPTY_EDGES, activeAttributeId, completedAttributeIds = EMPTY_IDS }: GraphProps) {
  const container = useRef<HTMLDivElement>(null);
  const [showDependencies, setShowDependencies] = useState(true);
  const [fullscreenError, setFullscreenError] = useState('');
  const positions = useMemo(() => layoutExamGraph(nodes, edges), [nodes, edges]);
  const flowNodes: Node<FlowData>[] = useMemo(() => nodes.map(item => ({
    id: item.id, type: 'record', position: positions.get(item.id) ?? { x: 0, y: 0 },
    data: { item, activeAttributeId, completedAttributeIds },
    ariaLabel: `${item.label}, ${roleLabels[item.role]}`,
  })), [nodes, positions, activeAttributeId, completedAttributeIds]);
  const flowEdges: Edge[] = useMemo(() => [
    ...edges.map((edge, index) => ({ ...edge, id: edge.id ?? `tree-${index}`, sourceHandle: 'tree-out', targetHandle: 'tree-in', type: 'smoothstep', style: { stroke: '#647a99', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#647a99' } })),
    ...(showDependencies ? dependencyEdges.map((edge, index) => ({ ...edge, id: `dependency-${edge.id ?? index}`, type: 'bezier', zIndex: 5,
      animated: edge.targetHandle === activeAttributeId,
      style: { stroke: edge.targetHandle === activeAttributeId ? '#facc70' : '#c49bfa', strokeWidth: 2.2, strokeDasharray: '5 3' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#c49bfa' },
      labelStyle: { fill: '#e4d2ff', fontSize: 11 }, labelBgStyle: { fill: '#182235' },
    })) : []),
  ], [edges, dependencyEdges, showDependencies, activeAttributeId]);
  const shapeKey = nodes.map(node => node.id).join('|') + edges.map(edge => `${edge.source}:${edge.target}`).join('|');
  return <div className="exam-graph" ref={container}>
    <div className="exam-graph-toolbar">
      <span>{nodes.length} nodos · arrastra el lienzo para moverte</span>
      <div>
        {dependencyEdges.length > 0 && <label><input type="checkbox" checked={showDependencies} onChange={event => setShowDependencies(event.target.checked)} /> Grafo de dependencias</label>}
        <button className="exam-secondary" onClick={async () => {
          try {
            if (document.fullscreenElement === container.current) await document.exitFullscreen();
            else await container.current?.requestFullscreen();
            setFullscreenError('');
          } catch { setFullscreenError('El navegador no permite pantalla completa. Puedes usar los controles de zoom.'); }
        }} aria-label="Pantalla completa del árbol"><Maximize2 size={16} /></button>
      </div>
    </div>
    {fullscreenError && <p role="status">{fullscreenError}</p>}
    <div className="exam-graph-canvas" role="region" aria-label="Lienzo del árbol">
      <ReactFlow key={shapeKey} nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} nodesDraggable={false} nodesConnectable={false}
        fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }} minZoom={0.06} maxZoom={2} colorMode="dark" proOptions={{ hideAttribution: true }}
        ariaLabelConfig={{ 'controls.ariaLabel': 'Controles del árbol', 'controls.zoomIn.ariaLabel': 'Acercar árbol', 'controls.zoomOut.ariaLabel': 'Alejar árbol', 'controls.fitView.ariaLabel': 'Ajustar árbol' }}>
        <Background color="#26354c" gap={22} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
    {dependencyEdges.length > 0 && <div className="exam-graph-legend"><span>Sintetizado ↑</span><span>Heredado ↓ / hermanos</span><span>Línea discontinua: dependencia entre atributos</span></div>}
  </div>;
}
