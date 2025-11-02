const StepIndicator = ({ status }: { status: string }) => {
  if (status === 'completed') {
    return (
      <div style={{
            backgroundColor: '#000000',  // Black background
            borderRadius: '50%',
            width: '20px',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}
      >
        <svg viewBox="0 0 24 24" style={{ width: '14px', height: '14px', fill: '#ffffff' }}>
          <path d="M9 19.4L2.6 13c-.8-.8-.8-2 0-2.8.8-.8 2-.8 2.8 0L9 13.8l9.6-9.6c.8-.8 2-.8 2.8 0 .8.8.8 2 0 2.8L9 19.4z" />
        </svg>
      </div>
    );
  }

  return (
    <div 
      style={{
        width: '20px',
        height: '20px',
        border: '2px dashed #c1c1c1',
        borderRadius: '50%',
        display: 'inline-block'
      }} 
    />
  );
};

export default StepIndicator;