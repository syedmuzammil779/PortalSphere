import { Box, Text } from '@shopify/polaris';
import { useState, useRef, useEffect } from 'react';
import { CheckListItem } from './CheckListItem';

interface CollapsibleSectionProps {
  title: string;
  isCompleted: boolean;
  children: React.ReactNode;
  isExpanded?: boolean;
  onToggle?: () => void;
}

export function CollapsibleOnboardingStep({
  title,
  isCompleted,
  children,
  isExpanded: controlledIsExpanded,
  onToggle
}: CollapsibleSectionProps) {
  const [internalIsExpanded, setInternalIsExpanded] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [contentHeight, setContentHeight] = useState<number>(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // Use controlled or uncontrolled expanded state
  const isExpanded = controlledIsExpanded !== undefined ? controlledIsExpanded : internalIsExpanded;

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [children]);

  const handleClick = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalIsExpanded(!internalIsExpanded);
    }
  };

  return (
    <Box 
      background={
        isExpanded 
          ? "bg-surface-selected" 
          : isHovered 
            ? "bg-surface-disabled" 
            : "bg-surface"
      }
      borderRadius="200" 
      borderWidth={isExpanded ? '025' : '0'} 
      borderColor={isExpanded ? 'border' : 'transparent'}
      padding='300'
    >
      <div 
        onClick={handleClick} 
        style={{ cursor: 'pointer'}}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <CheckListItem isCompleted={isCompleted} margin="0px">
          <Text as="p" variant="headingMd">{title}</Text>
        </CheckListItem>
      </div>

      <div
        ref={contentRef}
        style={{
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-out, opacity 0.3s ease-out',
          maxHeight: isExpanded ? `${contentHeight}px` : '0',
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div
          style={{
            transform: `translateY(${isExpanded ? 0 : -10}px)`,
            transition: 'transform 0.3s ease-out',
          }}
        >
          {children}
        </div>
      </div>
    </Box>
  );
}