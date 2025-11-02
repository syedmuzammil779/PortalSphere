import { useFetcher, useNavigation, redirect, useLoaderData, Form } from "@remix-run/react"
import { json, type LoaderFunction } from "@remix-run/node";

import { authenticate } from "~/shopify.server";
import { Page, Card, FormLayout, TextField, Button, Layout, BlockStack, Banner} from "@shopify/polaris"
import { getActiveSubscription } from "~/services/Settings.server";
import prisma from "~/db.server";
import PageHeader from "~/components/PageHeader";
import { useEffect, useState } from 'react';

export const loader: LoaderFunction = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const { shop } = session;

  // Check for active subscription first
  const activeSubscription = await getActiveSubscription(request);
  if(!activeSubscription) {
    return redirect('/app/subscription');
  }

  //Now check if db record exists of this store having a status true
  const alreadySubmittedRow = await prisma.shopKlaviyoRecords.findFirst({
    where: {
      shop: shop,
      status: true
    },
    orderBy: {
      id: 'desc'
    }
  });

  // if(alreadySubmittedRow) {
  //   // console.log('already found row', alreadySubmittedRow);
  //   // return redirect('/app');
  // }

  const shopDetailsResp = await admin.graphql(`
    query {
      shop {
        contactEmail
        email
        myshopifyDomain
        name
      }
    }
  `);

  let shopDetails = null;

  if(shopDetailsResp.ok) {
    const response = await shopDetailsResp.json();
    shopDetails = response.data.shop;
  }

  return json({ shop: shopDetails, dbRow: alreadySubmittedRow });
}

export default function CompleteInfoForm() {
  const { shop, dbRow } = useLoaderData<{ shop: any, dbRow: any }>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [firstName, setFirstName] = useState(dbRow ? dbRow.first_name : null);
  const [lastName, setLastName] = useState(dbRow ? dbRow.last_name : null);
  const [email, setEmail] = useState(dbRow ? dbRow.email : null);

  // Form validation state
  const [errors, setErrors] = useState({
    firstName: false,
    lastName: false,
    email: false
  });

  // Validate form before submission
  const validateForm = () => {
    const newErrors = {
      firstName: !firstName.trim(),
      lastName: !lastName.trim(),
      email: !email || !email.trim() || !/\S+@\S+\.\S+/.test(email)
    };

    setErrors(newErrors);
    return !Object.values(newErrors).some(Boolean);
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    if (!validateForm()) {
      e.preventDefault();
    }
  };

  return (
    <Page hasSubtitleMaxWidth>
      <Layout>
        <Layout.Section>
          <PageHeader
            title="Contact Info"
            subtitle=""
          />
        </Layout.Section>
        <Layout.Section>
          <Card>
            <BlockStack inlineAlign="center">
              {dbRow ? (<>
                <Banner
                  title="Success!"
                  tone="success"
                >
                  <p>Registration Complete! Please continue exploring the app from the left menu.</p>
                </Banner>
                </>
              ):(<></>)}
              <div style={{ padding: "1.5rem", width: "70%" }}>
                <Form method="POST" action="/api/complete-info-form">
                  <FormLayout>
                    <TextField
                      value={firstName}
                      label="First Name"
                      onChange={setFirstName}
                      name="first_name"
                      placeholder="Enter first name"
                      type="text"
                      autoComplete="given-name"
                      requiredIndicator
                      error={errors.firstName ? "First name is required" : undefined}
                    />
                    <TextField
                      value={lastName}
                      label="Last Name"
                      name="last_name"
                      placeholder="Enter last name"
                      type="text"
                      onChange={setLastName}
                      autoComplete="family-name"
                      requiredIndicator
                      error={errors.lastName ? "Last name is required" : undefined}
                    />
                    <TextField
                      label="Email"
                      onChange={setEmail}
                      value={email}
                      name="email"
                      type="email"
                      placeholder="Enter your email"
                      autoComplete="email"
                      requiredIndicator
                      error={errors.email ? "Valid email is required" : undefined}
                    />
                    <input type="hidden" name="myshopifyDomain" value={shop?.myshopifyDomain || ''} />

                    {/* Submit button with loading state */}
                    <div style={{ position: 'relative' }}>
                      <Button submit variant="primary" fullWidth disabled={isSubmitting}>
                        {isSubmitting ? "Submitting..." : "Submit"}
                      </Button>

                      {/* Overlay spinner when loading */}
                      {isSubmitting && (
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <div className="Polaris-Spinner Polaris-Spinner--sizeSmall">
                            <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                              <path d="M7.229 1.173a9.25 9.25 0 1 0 11.655 11.412 1.25 1.25 0 1 0-2.4-.698 6.75 6.75 0 1 1-8.506-8.329 1.25 1.25 0 1 0-.75-2.385z" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  </FormLayout>
                </Form>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
