import { useState } from 'react';

interface OnboardingStepGroupProps {
  children: (expandedIndex: number, setExpandedIndex: (index: number) => void) => React.ReactNode;
}

export function OnboardingStepGroup({ children }: OnboardingStepGroupProps) {
  const [expandedStep, setExpandedStep] = useState(0);
  
  return <>{children(expandedStep, setExpandedStep)}</>;
}