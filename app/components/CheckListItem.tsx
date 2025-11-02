import StepIndicator from './StepIndicator';

interface CheckListItemProps {
  children: React.ReactNode;
  checked?: boolean;
  margin?: string;
  isCompleted?: boolean; 
}

export function CheckListItem({ 
  children, 
  checked = true, 
  margin = '0px 0px 0px 15px',
  isCompleted = true
}: CheckListItemProps) {
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'start',
      gap: '8px',
      margin: margin,
      justifyContent: 'flex-start'
    }}> 
      <div style={{ display: 'flex', margin: '0' }}> 
        <StepIndicator status={isCompleted ? 'completed' : 'pending'} />
      </div>
      {children}
    </div>
  );
}