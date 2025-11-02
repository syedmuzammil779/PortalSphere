import { Spinner, Text } from "@shopify/polaris";

interface PageLoadSpinnerProps {
  title?: string;
  subtitle?: string;
}

export function PageLoadSpinner({ 
  title = "Loading...", 
  subtitle = "This may take a few moments" 
}: PageLoadSpinnerProps) {
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      width: '100%',
      position: 'fixed',
      top: 0,
      left: 0,
      background: 'white',
      zIndex: 1000,
      flexDirection: 'column',
      gap: '16px'
    }}>
      <Spinner accessibilityLabel="Loading" size="large" />
      <Text variant="headingMd" as="h2">
        {title}
      </Text>
      <Text variant="bodyMd" as="p" tone="subdued">
        {subtitle}
      </Text>
    </div>
  );
}