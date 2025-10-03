import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MarkovChainVisualizationProps {
  highCPRAThreshold: number;
}

const MarkovChainVisualization: React.FC<MarkovChainVisualizationProps> = ({ highCPRAThreshold }) => {
  // Node positions for the graph layout
  const nodes = [
    // Low CPRA group (left side)
    { id: 'C_Low', x: 120, y: 80, label: 'C Low', fullLabel: `Waitlist\n(0-${highCPRAThreshold}%)`, color: '#3b82f6' },
    { id: 'H_Low', x: 120, y: 180, label: 'H Low', fullLabel: 'Human\nTransplant', color: '#10b981' },
    { id: 'D_Low', x: 120, y: 280, label: 'D Low', fullLabel: 'Dead', color: '#6b7280' },
    
    // High CPRA group (right side)
    { id: 'C_High', x: 380, y: 80, label: 'C High', fullLabel: `Waitlist\n(${highCPRAThreshold}%-100%)`, color: '#f97316' },
    { id: 'H_High', x: 320, y: 180, label: 'H High', fullLabel: 'Human\nTransplant', color: '#10b981' },
    { id: 'X_High', x: 440, y: 180, label: 'X High', fullLabel: 'Xeno\nTransplant', color: '#8b5cf6' },
    { id: 'D_High', x: 380, y: 280, label: 'D High', fullLabel: 'Dead', color: '#6b7280' },
    
    // External arrivals
    { id: 'Outside_Low', x: 50, y: 50, label: 'New', fullLabel: 'New\nArrivals', color: '#64748b' },
    { id: 'Outside_High', x: 450, y: 50, label: 'New', fullLabel: 'New\nArrivals', color: '#64748b' }
  ];

  // Edge definitions with curved paths
  const edges = [
    // New arrivals
    { from: 'Outside_Low', to: 'C_Low', color: '#3b82f6', strokeWidth: 2 },
    { from: 'Outside_High', to: 'C_High', color: '#f97316', strokeWidth: 2 },
    
    // Low CPRA transitions
    { from: 'C_Low', to: 'H_Low', color: '#10b981', strokeWidth: 3 },
    { from: 'C_Low', to: 'D_Low', color: '#ef4444', strokeWidth: 2 },
    { from: 'H_Low', to: 'C_Low', color: '#f59e0b', strokeWidth: 2, curved: true },
    { from: 'H_Low', to: 'D_Low', color: '#ef4444', strokeWidth: 2 },
    
    // High CPRA transitions
    { from: 'C_High', to: 'H_High', color: '#10b981', strokeWidth: 3 },
    { from: 'C_High', to: 'X_High', color: '#8b5cf6', strokeWidth: 3 },
    { from: 'C_High', to: 'D_High', color: '#ef4444', strokeWidth: 2 },
    { from: 'H_High', to: 'C_High', color: '#f59e0b', strokeWidth: 2, curved: true },
    { from: 'H_High', to: 'D_High', color: '#ef4444', strokeWidth: 2 },
    { from: 'X_High', to: 'C_High', color: '#f59e0b', strokeWidth: 2, curved: true },
    { from: 'X_High', to: 'D_High', color: '#ef4444', strokeWidth: 2 }
  ];

  const getNodeById = (id: string) => nodes.find(n => n.id === id);

  const createPath = (edge: typeof edges[0]) => {
    const fromNode = getNodeById(edge.from);
    const toNode = getNodeById(edge.to);
    if (!fromNode || !toNode) return '';

    if (edge.curved) {
      // Create curved path for feedback loops
      const midX = (fromNode.x + toNode.x) / 2 + 30;
      const midY = (fromNode.y + toNode.y) / 2;
      return `M ${fromNode.x} ${fromNode.y} Q ${midX} ${midY} ${toNode.x} ${toNode.y}`;
    } else {
      // Straight line
      return `M ${fromNode.x} ${fromNode.y} L ${toNode.x} ${toNode.y}`;
    }
  };

  return (
    <Card className="bg-card shadow-[var(--shadow-medium)] border-medical-border">
      <CardHeader className="border-b border-medical-border bg-medical-surface">
        <CardTitle className="text-lg font-semibold text-primary">
          Markov Chain Model: Patient Flow Graph
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-2">
          Interactive graph showing patient states and transition pathways
        </p>
      </CardHeader>
      <CardContent className="p-6">
        <div className="flex flex-col items-center">
          {/* Main Graph */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
            <svg width="500" height="350" viewBox="0 0 500 350">
              {/* Draw edges first (so they appear behind nodes) */}
              {edges.map((edge, index) => (
                <g key={index}>
                  <path
                    d={createPath(edge)}
                    stroke={edge.color}
                    strokeWidth={edge.strokeWidth}
                    fill="none"
                    markerEnd="url(#arrowhead)"
                    opacity={0.8}
                  />
                </g>
              ))}
              
              {/* Arrow marker definition */}
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon
                    points="0 0, 10 3.5, 0 7"
                    fill="#374151"
                  />
                </marker>
              </defs>
              
              {/* Draw nodes */}
              {nodes.map(node => (
                <g key={node.id}>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r="25"
                    fill={node.color}
                    stroke="white"
                    strokeWidth="3"
                    opacity={0.9}
                  />
                  <text
                    x={node.x}
                    y={node.y - 5}
                    textAnchor="middle"
                    className="text-xs font-semibold fill-white"
                  >
                    {node.label}
                  </text>
                  <text
                    x={node.x}
                    y={node.y + 40}
                    textAnchor="middle"
                    className="text-xs fill-gray-700"
                    style={{ fontSize: '10px' }}
                  >
                    {node.fullLabel.split('\n').map((line, i) => (
                      <tspan key={i} x={node.x} dy={i === 0 ? 0 : 12}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              ))}
              
              {/* Group labels */}
              <text x="120" y="25" textAnchor="middle" className="text-sm font-bold fill-blue-600">
                Low-CPRA (0-{highCPRAThreshold}%)
              </text>
              <text x="380" y="25" textAnchor="middle" className="text-sm font-bold fill-orange-600">
                High-CPRA ({highCPRAThreshold}%-100%)
              </text>
            </svg>
          </div>

          {/* Legend */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
            <div className="space-y-3">
              <h4 className="font-semibold text-primary">States</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-blue-500"></div>
                  <span>C Low/High: Waitlist candidates</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-green-500"></div>
                  <span>H Low/High: Human transplant recipients</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-purple-500"></div>
                  <span>X High: Xeno transplant recipients</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-gray-500"></div>
                  <span>D Low/High: Deceased (absorbing)</span>
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-semibold text-primary">Transitions</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-1 bg-green-500"></div>
                  <span>Transplantation (human/xeno)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-1 bg-red-500"></div>
                  <span>Death (waitlist/post-transplant)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-1 bg-yellow-500"></div>
                  <span>Relisting (graft failure)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-1 bg-blue-500"></div>
                  <span>New patient arrivals</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MarkovChainVisualization;
