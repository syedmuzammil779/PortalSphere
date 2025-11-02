import React from 'react';
import { MediaCard, VideoThumbnail } from '@shopify/polaris';

interface VideoCardProps {
    title: string;
    description: string;
    videoUrl: string;
    thumbnailUrl: string;
    videoLength: number;
}

const VideoCard: React.FC<VideoCardProps> = ({ title, description, videoUrl, thumbnailUrl , videoLength}) => {
    return (
        <div>
            <MediaCard
                portrait
                title={<span style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>{title}</span>}
                description={description}
            >
                <VideoThumbnail
                    videoLength={videoLength}
                    thumbnailUrl={thumbnailUrl}
                    onClick={() => window.open(videoUrl, '_blank')}
                />
            </MediaCard>
        </div>
    );
};

export default VideoCard; 