import { Card, InlineGrid, BlockStack, Text, Box } from "@shopify/polaris";

interface StoreTypeCardProps {
  title: string;
  subtitle: string;
  description: string;
  isSelected: boolean;
}

export function StoreTypeCard({ title, subtitle, description, isSelected }: StoreTypeCardProps) {
  return (
    <>
      <style>
        {`
          span.Polaris-Choice__Label {
            width: 100% !important;
          }
          
          label.Polaris-Choice.Polaris-RadioButton__ChoiceLabel {
            width: 100% !important;
          }
              
          .Polaris-Choice__Control {
            display: none !important;
          }

          .Polaris-Choice {
            padding-left: 25px !important;
          }
        `}
      </style>
      <div style={{width: '100%'}}>
        <Box padding="400" borderColor={isSelected ? 'border-inverse' :'border'} borderRadius='300' borderStyle="solid" borderWidth={isSelected ? '100' :'050'}>
          <InlineGrid alignItems="center" columns="0.5fr 5fr">
            <BlockStack>
              <Text as="h1" variant="headingLg">
                {title}
              </Text>
            </BlockStack>
            <BlockStack>
              <Text variant="headingMd" as="h3">{subtitle}</Text>
              <Text as="p">{description}</Text>
            </BlockStack>
          </InlineGrid>
        </Box>
      </div>
    </>
  );
}