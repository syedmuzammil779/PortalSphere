import { Spinner } from "@shopify/polaris";
import React from 'react';

interface LoadingSpinnerProps {
    size?: 'small' | 'large';
    accessibilityLabel?: string;
}

export function LoadingSpinner({
    size = 'large',
    accessibilityLabel = 'Loading',
    }: LoadingSpinnerProps ) {
    return (
        <div 
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100vw',
                height: '100vh',
                backgroundColor: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999
            }}
        >
            <Spinner accessibilityLabel={accessibilityLabel} size={size} />
        </div>
    );
}