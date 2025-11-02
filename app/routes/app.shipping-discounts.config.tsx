import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Button,
  Text,
  Divider,
  Checkbox
} from "@shopify/polaris";
import { PageLoadSpinner } from "~/components/PageLoadSpinner";
import PageHeader from "~/components/PageHeader";
import { authenticate } from "../shopify.server";
import { DiscountCreator } from "~/services/AutomaticDiscountApp.server";
import { getShopId } from "~/services/Settings.server";
import { escapeObjectForGraphQL } from "~/helpers/metafieldHelpers";
import { useState } from "react";

interface ValidationError {
  field: string;
  message: string;
}

const validateAmount = (value: number, fieldName: string): ValidationError | null => {
  // Helper function to check if number has max 2 decimal places
  const hasValidDecimals = (num: number) => {
    const decimalStr = num.toString().split('.')[1];
    return !decimalStr || decimalStr.length <= 2;
  };

  if (isNaN(value)) {
    return {
      field: fieldName,
      message: `${fieldName === 'minimumPurchaseAmount' ? 'Minimum purchase amount' : 'Flat rate'} must be a valid number`
    };
  }

  if (value < 0) {
    return {
      field: fieldName,
      message: `${fieldName === 'minimumPurchaseAmount' ? 'Minimum purchase amount' : 'Flat rate'} cannot be less than 0`
    };
  }

  if (!hasValidDecimals(value)) {
    return {
      field: fieldName,
      message: `${fieldName === 'minimumPurchaseAmount' ? 'Minimum purchase amount' : 'Flat rate'} can only have up to 2 decimal places`
    };
  }

  return null;
};

const validateForm = (minimumPurchaseAmount: number, flatRate: number): ValidationError[] => {
  const errors: ValidationError[] = [];
  
  const minimumPurchaseError = validateAmount(minimumPurchaseAmount, 'minimumPurchaseAmount');
  const flatRateError = validateAmount(flatRate, 'flatRate');
  
  if (minimumPurchaseError) errors.push(minimumPurchaseError);
  if (flatRateError) errors.push(flatRateError);
  
  return errors;
};

export const loader = async ({ request }: any) => {
  const { admin, session } = await authenticate.admin(request);
  const { shop } = session;
  const shopId = await getShopId(admin, shop);
  await Promise.all([
    DiscountCreator.checkAndCreateDiscount(admin, "Shipping"),
    DiscountCreator.checkAndCreateShippingDiscountConfig(admin, shopId)
  ]);

  try {
    const response = await admin.graphql(`
      query getShippingConfig {
        shop {
          metafield(namespace: "b2bplus", key: "shipping-discount-config") {
            id
            value
          }
        }
      }
    `);

    const responseJson = await response.json();

    const shippingConfig =  responseJson.data.shop.metafield;
    const config = shippingConfig ? JSON.parse(shippingConfig.value) : null;

    return config;
    
  } catch (error) {
    console.error('Error fetching shipping discount:', error);
    // Get the redirect page from the passed environment variable or default to "/app"
    const redirectPage = process.env.ERROR_REDIRECT_PAGE || '/app';
    return redirect(redirectPage);
  }
};

export const action = async ({ request }: any) => {
  const { admin, redirect, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const { shop } = session;
  const shopId = await getShopId(admin, shop);

  // Parse form data
  const minimumPurchaseAmount = parseFloat(formData.get("minimumPurchaseAmount") as string);
  const flatRate = parseFloat(formData.get("flatRate") as string);
  const status = formData.get("status") || "inactive";

  // Validate form data
  const errors = validateForm(minimumPurchaseAmount, flatRate);
  if (errors.length > 0) {
    return json({ errors });
  }

  const config = {
    minimumPurchaseAmount,
    flatRate,
    status
  };

  try {
    const response = await admin.graphql(`
      mutation updateShippingConfig {
        metafieldsSet(metafields: [
          {
            namespace: "b2bplus"
            key: "shipping-discount-config"
            type: "json"
            value: "${escapeObjectForGraphQL(config)}"
            ownerId: "${shopId}"
          }
        ]) {
          metafields {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `);

    const responseJson = await response.json();
    
    if (responseJson.data?.discountNodeUpdate?.userErrors?.length > 0) {
      return json({ errors: responseJson.data.discountNodeUpdate.userErrors });
    }

    return redirect('/app/storeconfigs');
  } catch (error: unknown) {
    console.error('Error updating discount:', error);
    // Get the redirect page from the passed environment variable or default to "/app"
    const redirectPage = process.env.ERROR_REDIRECT_PAGE || '/app';
    return redirect(redirectPage);
  }
};
export default function ConfigureShippingDiscount() {
  const config: any = useLoaderData();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting" || navigation.state === "loading";
  const [localErrors, setLocalErrors] = useState<ValidationError[]>([]);
  const [formValues, setFormValues] = useState({
    minimumPurchaseAmount: config.minimumPurchaseAmount.toString(),
    flatRate: config.flatRate.toString(),
    status: config.status
  });

  const handleMinimumPurchaseChange = (value: string) => {
    setFormValues(prev => ({ 
      ...prev, 
      minimumPurchaseAmount: value
    }));
    const amount = parseFloat(value);
    const error = validateAmount(amount, 'minimumPurchaseAmount');
    setLocalErrors(prev => {
      const filtered = prev.filter(e => e.field !== 'minimumPurchaseAmount');
      return error ? [...filtered, error] : filtered;
    });
  };

  const handleFlatRateChange = (value: string) => {
    setFormValues(prev => ({ 
      ...prev, 
      flatRate: value
    }));
    const amount = parseFloat(value);
    const error = validateAmount(amount, 'flatRate');
    setLocalErrors(prev => {
      const filtered = prev.filter(e => e.field !== 'flatRate');
      return error ? [...filtered, error] : filtered;
    });
  };

  const handleStatusChange = (checked: boolean) => {
    setFormValues(prev => ({
      ...prev,
      status: checked ? "active" : "inactive"
    }));
  };

  return (
    <>
      {isLoading ? (
        <PageLoadSpinner 
          title="Saving shipping configuration..." 
          subtitle="This may take a few moments"
        />
      ) : (
        <Page>
          <PageHeader 
            title="Configure"
            subtitle="B2B Shipping Rates"
          />
          <Layout>
            <Layout.Section>
              <Card>
                <Form method="post">
                  <FormLayout>
                    <Text variant="headingMd" as="h2">Free Shipping Threshold</Text>
                    <TextField
                      label="Minimum Purchase Amount"
                      name="minimumPurchaseAmount"
                      type="number"
                      prefix="$"
                      autoComplete="off"
                      value={formValues.minimumPurchaseAmount}
                      onChange={handleMinimumPurchaseChange}
                      helpText="Orders above this amount qualify for free shipping (e.g., 99.99)"
                      error={localErrors.find(e => e.field === "minimumPurchaseAmount")?.message}
                      min={0}
                      step={0.01}
                    />

                    <Divider />

                    <Text variant="headingMd" as="h2">Flat Rate Shipping</Text>
                    <Text variant="bodyMd" as="p" tone="subdued">
                      Set the flat rate shipping amount for orders below the minimum purchase amount.
                    </Text>
                    <TextField
                      label="Flat Rate Amount" 
                      name="flatRate"
                      type="number"
                      prefix="$"
                      autoComplete="off"
                      value={formValues.flatRate}
                      onChange={handleFlatRateChange}
                      helpText="Shipping cost for orders below the minimum purchase amount (e.g., 9.99)"
                      error={localErrors.find(e => e.field === "flatRate")?.message}
                      min={0}
                      step={0.01}
                    />

                    <Checkbox
                      label="Enable shipping discount"
                      name="status"
                      checked={formValues.status === "active"}
                      onChange={handleStatusChange}
                      value="active"
                    />

                    <Button submit variant="primary" disabled={localErrors.length > 0}>Update Configuration</Button>
                  </FormLayout>
                </Form>
              </Card>
            </Layout.Section>
          </Layout>
        </Page>
      )}
    </>
  );
}