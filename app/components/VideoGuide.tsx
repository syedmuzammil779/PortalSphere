import React, { useState } from "react";
import { Card, Text, InlineStack, BlockStack, Button } from "@shopify/polaris";
import { Play, Clock, ChevronUp, ChevronDown, Maximize2, Minimize2 } from "lucide-react";

interface VideoItem {
  title: string;
  description: string;
  videoUrl: string;
  thumbnailUrl: string;
  videoLength: number;
}

interface VideoGuideProps {
  videos: VideoItem[];
}

const VideoGuide: React.FC<VideoGuideProps> = ({ videos }) => {
  const [selectedVideo, setSelectedVideo] = useState<VideoItem>(videos[0]);
  const [showTopScroll, setShowTopScroll] = useState(false);
  const [showBottomScroll, setShowBottomScroll] = useState(true);
  const [isMaximized, setIsMaximized] = useState(false);

  const formatVideoLength = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleVideoSelect = (video: VideoItem) => {
    setSelectedVideo(video);
  };

  const handleMaximize = () => {
    setIsMaximized(!isMaximized);
  };

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.target as HTMLDivElement;
    const { scrollTop, scrollHeight, clientHeight } = target;
    
    // Show top scroll icon if scrolled down
    setShowTopScroll(scrollTop > 10);
    
    // Show bottom scroll icon if not at bottom
    setShowBottomScroll(scrollTop < scrollHeight - clientHeight - 10);
  };

  return (
    <div className="video-guide-container">
      <style>
        {`
          .video-guide-container {
            display: grid;
            grid-template-columns: 300px 1fr;
            gap: 24px;
            max-width: 1200px;
            margin: 0 auto 32px auto;
            padding: 24px;
          }
          
          .video-list {
            background: transparent;
            border: none;
            border-radius: 0;
            padding: 0;
            max-height: 600px;
            overflow-y: auto;
            scrollbar-width: none; /* Firefox */
            -ms-overflow-style: none; /* IE and Edge */
          }
          
          .video-list::-webkit-scrollbar {
            display: none; /* Chrome, Safari, Opera */
          }
          
          .video-list-container {
            position: relative;
            display: flex;
            flex-direction: column;
          }
          
          .scroll-indicator {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: rgba(48, 48, 48, 1);
            color: white;
            margin: 8px auto;
            z-index: 10;
            box-shadow: 0 2px 8px rgba(48, 48, 48, 0.3);
          }
          
          .scroll-indicator.top {
            margin-bottom: 4px;
          }
          
          .scroll-indicator.bottom {
            margin-top: 4px;
          }
          
          .video-item {
            padding: 12px 16px;
            margin-bottom: 0;
            border: none;
            border-bottom: 1px solid #e1e3e5;
            cursor: pointer;
            transition: background-color 0.2s ease;
          }
          
          .video-item:hover {
            background: #f8f9fa;
          }
          
          .video-item.selected {
            background: #f0f4ff;
            border-left: 3px solid #5c6ac4;
          }
          
          .video-item-title {
            font-weight: 600;
            font-size: 14px;
            color: #202223;
            margin-bottom: 4px;
            line-height: 1.3;
          }
          
          .video-item-description {
            font-size: 12px;
            color: #6d7175;
            line-height: 1.3;
            margin-bottom: 6px;
          }
          
          .video-item-meta {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: #8c9196;
          }
          
          .video-player {
            background: #1a1a1a;
            border-radius: 12px;
            overflow: hidden;
            position: relative;
            min-height: 400px;
            transition: all 0.3s ease;
          }
          
          .video-player.maximized {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 9999;
            border-radius: 0;
            background: #000;
          }
          
          .video-iframe {
            width: 100%;
            height: 100%;
            border: none;
            min-height: 400px;
            transition: all 0.3s ease;
          }
          
          .video-info {
            padding: 24px;
            background: white;
            border-radius: 12px;
            margin-bottom: 24px;
          }
          
          .video-title {
            font-size: 24px;
            font-weight: 700;
            color: #202223;
            margin-bottom: 12px;
          }
          
          .video-description {
            font-size: 16px;
            color: #6d7175;
            line-height: 1.5;
          }
          
          .video-duration {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: #5c6ac4;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            margin-top: 8px;
          }
          
          @media (max-width: 768px) {
            .video-guide-container {
              grid-template-columns: 1fr;
              gap: 16px;
              padding: 16px;
            }
            
            .video-list {
              max-height: 300px;
            }
          }
        `}
      </style>

      <div className="video-list-container">
        {/* Top scroll indicator */}
        {showTopScroll && (
          <div className="scroll-indicator top">
            <ChevronUp size={16} />
          </div>
        )}
        
        <div className="video-list" onScroll={handleScroll}>
          <div style={{ marginBottom: '20px', color: '#202223', fontSize: '18px', fontWeight: 'bold' }}>
            Onboarding Videos
          </div>
          
          {videos.map((video, index) => (
            <div
              key={index}
              className={`video-item ${selectedVideo === video ? 'selected' : ''}`}
              onClick={() => handleVideoSelect(video)}
            >
              <div className="video-item-title">{video.title}</div>
              <div className="video-item-description">{video.description}</div>
              <div className="video-item-meta">
                <Play size={12} />
                <span>Video</span>
                <Clock size={12} />
                <span>{formatVideoLength(video.videoLength)}</span>
              </div>
            </div>
          ))}
        </div>
        
        {/* Bottom scroll indicator */}
        {showBottomScroll && (
          <div className="scroll-indicator bottom">
            <ChevronDown size={16} />
          </div>
        )}
      </div>

      <div className="video-content">
        <div className="video-info">
          <div className="video-title">{selectedVideo.title}</div>
          <div className="video-description">{selectedVideo.description}</div>
          <div className="video-duration">
            <Clock size={12} />
            {formatVideoLength(selectedVideo.videoLength)}
          </div>
        </div>
        
        <div className={`video-player ${isMaximized ? 'maximized' : ''}`}>
          <div style={{ 
            position: 'relative', 
            width: '100%', 
            height: '100%',
            minHeight: isMaximized ? '100vh' : '400px'
          }}>
            <div
              onClick={handleMaximize}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                zIndex: 10,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
              }}
            >
              {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </div>
            <iframe
              src={selectedVideo.videoUrl}
              className="video-iframe"
              allowFullScreen
              title={selectedVideo.title}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                minHeight: isMaximized ? '80vh' : '400px',
                borderRadius: isMaximized ? '0' : '12px'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoGuide; 