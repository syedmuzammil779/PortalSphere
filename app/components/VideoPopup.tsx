import React from 'react';

interface VideoPopupProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string;
  title?: string;
}

const VideoPopup: React.FC<VideoPopupProps> = ({ 
  isOpen, 
  onClose, 
  videoUrl, 
  title = "Video Tutorial" 
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: "relative",
          width: "90%",
          maxWidth: "1200px",
          maxHeight: "90vh",
          backgroundColor: "white",
          borderRadius: "16px",
          overflow: "hidden",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #e3e4e8",
            backgroundColor: "#f9fafb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ 
            margin: 0, 
            fontSize: "20px", 
            fontWeight: "600", 
            color: "#1f2937" 
          }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              width: "32px",
              height: "32px",
              backgroundColor: "rgba(0, 0, 0, 0.7)",
              border: "none",
              borderRadius: "50%",
              color: "white",
              fontSize: "18px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background-color 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
            }}
          >
            ×
          </button>
        </div>
        
        {/* Video Container */}
        <div style={{ padding: "24px" }}>
          <div
            style={{
              overflow: "hidden",
              borderRadius: "12px",
              position: "relative",
              width: "100%",
              maxHeight: "calc(90vh - 140px)",
              aspectRatio: "16/9",
            }}
          >
            <iframe
              src={videoUrl}
              frameBorder="0"
              allowFullScreen={true}
              style={{
                width: '100%', 
                height: '100%', 
                border: 'none', 
                position: 'absolute', 
                top: 0, 
                left: 0
              }}
              allow="clipboard-read; clipboard-write"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPopup; 