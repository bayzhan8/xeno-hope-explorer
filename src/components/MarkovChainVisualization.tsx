import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MarkovChainVisualizationProps {
  highCPRAThreshold: number;
}

const MarkovChainVisualization: React.FC<MarkovChainVisualizationProps> = ({ highCPRAThreshold }) => {
  return (
    <Card className="bg-card shadow-[var(--shadow-medium)] border-medical-border">
      <CardHeader className="border-b border-medical-border bg-medical-surface">
        <CardTitle className="text-lg font-semibold text-primary">
          Patient Flow Graph
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-2">
          Visual representation of patient states and transition pathways
        </p>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex flex-col items-center">
          <div className="w-full max-w-4xl">
            <img 
              src="/xeno_chain.jpg" 
              alt="Markov Chain Model: Patient Flow Graph showing patient states and transition pathways"
              className="w-full h-auto rounded-lg border border-gray-200 shadow-sm"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MarkovChainVisualization;
