import { ProgressBar, Text, InlineStack } from '@shopify/polaris';
import { ChevronRightIcon, QuestionCircleIcon } from '@shopify/polaris-icons';
import { Icon } from '@shopify/polaris';

interface JourneyBreadcrumbProps {
  currentStep: number;
}

export function JourneyBreadcrumb({ currentStep }: JourneyBreadcrumbProps) {
  const steps = [
    "Default Storewide Purchasing Rules",
    "Custom Product-Specific Purchasing Rules & Tiered Pricing",
    "Assign Buyers"
  ];
  
  const progress = ((currentStep) / steps.length) * 100;

  return (
    <div style={{ marginBottom: "20px" }}>
      <InlineStack gap="200" align="center" wrap={false}>
        {steps.map((step, index) => (
          <InlineStack key={index} gap="200" align="center">
            <Text
              variant="headingMd"
              as="h3"
              tone={index + 1 === currentStep ? "base" : "subdued"}
              fontWeight={index + 1 === currentStep ? "semibold" : "regular"}
            >
              {step}
            </Text>
            {index < steps.length - 1 && (
              <Icon
                source={ChevronRightIcon}
                tone="subdued"
              />
            )}
          </InlineStack>
        ))}
      </InlineStack>
      <div style={{ marginBottom: "8px" }}>
        <Text as="h3" variant="headingMd" tone="subdued">
          (Step {currentStep} of {steps.length})
        </Text>
      </div>
      <div style={{ marginTop: "8px" }}>
        <ProgressBar progress={progress} size="small" />
      </div>
      <div style={{ marginTop: "8px", marginLeft: "8px" }}>

          <span style={{ margin: 0 }}>Need Help? </span> {/* Ensure no margin is applied */}
          <a 
              href="https://www.floik.com/flos/xjxb/fp4m/1c842475.html" // Replace with your target URL
              target="_blank" // Opens the link in a new tab
              rel="noopener noreferrer" // Security best practice
              style={{ color: '#007bff', textDecoration: 'none', margin: 0 }} // Ensure no margin is applied
          >          
              Click here to view the Video Tutorial
          </a>
      </div>
    </div>
  );
}