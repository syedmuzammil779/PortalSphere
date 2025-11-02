import React from 'react';

interface WatchVideoButtonProps {
  videoUrl?: string;
  onClick?: () => void;
  className?: string;
  buttonText?: string;
}

const WatchVideoButton: React.FC<WatchVideoButtonProps> = ({ 
  videoUrl,
  onClick,
  className = "",
  buttonText = "Watch video"
}) => {
  const handleClick = () => {
    if (onClick) {
      // Use custom onClick if provided
      onClick();
    } else if (videoUrl) {
      // Open video URL in new tab if provided
      window.open(videoUrl, '_blank', 'noopener,noreferrer');
    } else {
      // Default fallback behavior
      console.log("Watch video clicked - no URL or custom handler provided");
    }
  };

  return (
    <div
      onClick={handleClick}
      className={className}
      style={{
        borderRadius: "16px",
        border: "1px solid #C4C4C4",
        backgroundColor: "#FFFFFF",
        color: "#333333",
        padding: "6px 12px",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "12px",
        fontWeight: "500",
        cursor: "pointer",
        userSelect: "none",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "#F8F8F8";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "#FFFFFF";
      }}
    >
      <div
        style={{
          width: "16px",
          height: "16px",
          borderRadius: "50%",
          backgroundColor: "#E0E0E0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #C4C4C4",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: "5px solid #4A4A4A",
            borderTop: "3px solid transparent",
            borderBottom: "3px solid transparent",
            marginLeft: "1px",
          }}
        />
      </div>
      {buttonText}
    </div>
  );
};

export default WatchVideoButton; 