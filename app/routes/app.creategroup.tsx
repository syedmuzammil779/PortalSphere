import type { ActionFunction } from "@remix-run/node";
import { json } from "@remix-run/node"
import { useActionData, useSubmit, useNavigation, Link } from "@remix-run/react"
import { Button, Card, Page, TextField, Layout, ChoiceList, BlockStack, Text, Banner, InlineGrid, InlineStack, Icon, Tooltip } from "@shopify/polaris"
import { useState, useCallback, useRef } from "react"
import { authenticate } from "~/shopify.server"
import { getShopId } from "../services/Settings.server";
import { createSegment, setShopVolumeDiscountMetafield, setShopPaymentMethodsMetafield, IQuantityConfig, setShopQuantityConfigMetafield, getCustomerSegments } from "../services/CustomerGroups.server";
import { ExitIcon, InfoIcon } from "@shopify/polaris-icons";
import { JourneyBreadcrumb } from "~/components/JourneyBreadcrumb";
import { PageLoadSpinner } from "~/components/PageLoadSpinner";
import PageHeader from "~/components/PageHeader";
import prisma from "~/db.server";

export const action: ActionFunction = async ({ request }) => {
    const { admin, session, redirect } = await authenticate.admin(request);
    const { shop } = session;
    const shopId = await getShopId(admin, shop);

    const formData = await request.formData();
    const { name, overallAdjustment, selectedPayments, increment, minimum, maximum } = Object.fromEntries(formData);
    const b2bPrefix = process.env.B2B_PREFIX;
    let parsedSelectedPayments: any;

    const quantityConfigs: IQuantityConfig = {
        increment: increment?.toString() ?? '',
        minimum: minimum?.toString() ?? '',
        maximum: maximum?.toString() ?? '',
    }

    try {
        parsedSelectedPayments = JSON.parse(selectedPayments as string);

        if (!name) {
            return json({ error: 'Group name is required' }, { status: 400 });
        }

        // Check if the group name already exists
        const existingSegments = await getCustomerSegments(admin);
        if(!existingSegments) {
            return json({ error: 'Create Group Failed! Please try again later.' }, { status: 400 });
        }
        const nameExists = existingSegments.some((segment: any) => segment.name.toLowerCase() === name.toString().toLowerCase());
        if (nameExists) {
            return json({ error: 'Group Name already exist!' }, { status: 400 });
        }

        if (!Array.isArray(parsedSelectedPayments) || !(parsedSelectedPayments.length > 0)) {
            return json({ error: 'At least one payment method must be selected' }, { status: 400 });
        }

        if (!b2bPrefix) {
            return json({ error: 'B2B_PREFIX must be set in environment variables' }, { status: 500 });
        }

        const tag = `${b2bPrefix}${name.toString().replaceAll(" ","_")}`;

        await Promise.all([
            setShopVolumeDiscountMetafield(admin, shopId, tag, overallAdjustment.toString()),
            setShopPaymentMethodsMetafield(admin, shopId, tag, parsedSelectedPayments),
            setShopQuantityConfigMetafield(admin, shopId, tag, quantityConfigs)
        ]);
        const groupId = await createSegment(admin, name as string, tag);
        await prisma.shopSegmentsData.create({
            data: {
                shop: shop,
                segmentId: groupId,
                segmentName: name as string,
                query: `customer_tags CONTAINS '${tag}'`,
                defaultDiscount: overallAdjustment as string,
                defaultMOQ: quantityConfigs.minimum != '' ? quantityConfigs.minimum : '0',
                paymentMethods: parsedSelectedPayments.join(', '),
                tagID: tag,
                memberCount: 0,
                hasIncludedProducts: false,
                status: true
            }
        });

        return redirect(`/app/groupvolumepriceconfig?groupId=${groupId}&groupName=${name}&groupTag=${tag}&isNewGroup=true`);
    } catch (error) {
        console.error('Failed to create group:', error);
        return json({ error: 'Failed to create group', success: false }, { status: 500 });
    }
};

const CreateGroup = () => {
    const actionData = useActionData<{ error?: string, success?: boolean }>();
    const submit = useSubmit();
    const navigation = useNavigation();
    const isLoading = navigation.state === "loading";
    const [name, setName] = useState('')
    const [increment, setIncrement] = useState('')
    const [minimum, setMinimum] = useState('')
    const [maximum, setMaximum] = useState('')
    const [overallAdjustment, setOverallAdjustment] = useState('0')
    const [selected, setSelected] = useState(['all_products']);
    const [selectedPayments, setSelectedPayments] = useState<string[]>(['CreditCard']);
    const [showMaxValueWarning, setShowMaxValueWarning] = useState(false);

    const paymentsRef = useRef<HTMLDivElement>(null);

    // Generic onChange handler
    const handleChange = (setter: React.Dispatch<React.SetStateAction<string>>) => (value: string) => {
        // Remove any non-digit characters
        const sanitizedValue = value.replace(/\D/g, '');
        setter(sanitizedValue);
    };

    const generateGroup = () => {
        window.shopify.loading(true);
        const formData = new FormData();
        formData.append('name', name);
        formData.append('overallAdjustment', overallAdjustment);
        formData.append('selectionMethod', selected[0]);
        formData.append('selectedPayments', JSON.stringify(selectedPayments));
        formData.append('increment', increment);
        formData.append('minimum', minimum);
        formData.append('maximum', maximum);
        
        submit(formData, { replace: true, method: 'POST' });
    }

    const handleOverallAdjustmentChange = (value: string) => {
        // Remove any non-digit characters except decimal point
        const sanitizedValue = value.replace(/[^\d.]/g, '');
        
        // Ensure only one decimal point
        const parts = sanitizedValue.split('.');
        if (parts.length > 2) {
            parts.pop();
        }
        
        // Join back the parts
        let finalValue = parts.join('.');
        
        // Convert to number for comparison
        const numericValue = parseFloat(finalValue);
        
        // Check if the value exceeds 100
        if (numericValue > 100) {
            finalValue = "100";
            setShowMaxValueWarning(true);
        } else {
            setShowMaxValueWarning(false);
        }
        
        // Update state with the sanitized value
        setOverallAdjustment(finalValue);
    };

    const handleChangePayments = useCallback((value: string[]) => setSelectedPayments(value), []);

    const adjustMinimum = (minValue: string, incValue: string) => {
        if (minValue === '' || incValue === '') return minValue;

        let numericMin = parseInt(minValue, 10);
        const numericInc = parseInt(incValue, 10);

        if (isNaN(numericMin) || isNaN(numericInc) || numericInc <= 0) return minValue;

        // Ensure minimum is not less than increment
        numericMin = Math.max(numericMin, numericInc);

        // Adjust to next higher multiple of increment if not already a multiple
        if (numericMin % numericInc !== 0) {
            numericMin = Math.ceil(numericMin / numericInc) * numericInc;
        }

        return numericMin.toString();
    };

    const adjustMaximum = (maxValue: string, minValue: string, incValue: string) => {
        if (maxValue === '') return maxValue;

        let numericMax = parseInt(maxValue, 10);
        const numericMin = parseInt(minValue, 10);
        const numericInc = parseInt(incValue, 10);

        if (isNaN(numericMax)) return maxValue;

        if (!isNaN(numericInc) && numericInc > 0) {
            // Ensure maximum is a multiple of increment
            numericMax = Math.ceil(numericMax / numericInc) * numericInc;

            if (!isNaN(numericMin) && numericMin > 0) {
                // Ensure maximum is at least minimum + increment
                numericMax = Math.max(numericMax, numericMin + numericInc);
            }
        } else if (!isNaN(numericMin) && numericMin > 0) {
            // If increment is not defined or not positive, but minimum is defined
            // Ensure maximum is at least minimum + 1
            numericMax = Math.max(numericMax, numericMin + 1);
        }

        return numericMax.toString();
    };

    const handleIncrementBlur = () => {
        let newIncrement = increment;
        if (newIncrement !== '') {
            const numericValue = parseInt(newIncrement, 10);
            if (numericValue > 0) {
                newIncrement = numericValue.toString();
            } else {
                newIncrement = '';
            }
        }
        setIncrement(newIncrement);

        // Re-evaluate minimum and maximum
        const newMinimum = adjustMinimum(minimum, newIncrement);
        setMinimum(newMinimum);

        const newMaximum = adjustMaximum(maximum, newMinimum, newIncrement);
        setMaximum(newMaximum);
    };

    const handleMinimumBlur = () => {
        const newMinimum = adjustMinimum(minimum, increment);
        setMinimum(newMinimum);

        // Re-evaluate maximum
        const newMaximum = adjustMaximum(maximum, newMinimum, increment);
        setMaximum(newMaximum);
    };

    const handleMaximumBlur = () => {
        const newMaximum = adjustMaximum(maximum, minimum, increment);
        setMaximum(newMaximum);
    };

    const paymentOptions = [
        {
          label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span><strong>Credit Card</strong></span>
                <Tooltip content={
                    <div>
                        <strong>Credit Card</strong><br />
                        Credit card payment collected through your payment processor.
                    </div>
                }>
                <Icon source={InfoIcon} tone="subdued" />
                </Tooltip>
            </div>
          ),
          value: 'CreditCard'
        },
        {
          label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span><strong>Net Terms</strong></span>
                <Tooltip content={
                    <div>
                        <strong>Net Terms</strong><br />
                        Allows buyers to checkout without payment; orders remain pending until admin approval.
                    </div>
                }>
                <Icon source={InfoIcon} tone="subdued" />
                </Tooltip>
            </div>
          ),
          value: 'NetTerms',
        },
    ];

    return (
        <>
            {isLoading ? (
                <PageLoadSpinner />
            ) : (
                <>
                    <JourneyBreadcrumb currentStep={1} />
                    <Page>
                        {actionData?.error && (
                            <Banner tone="critical">
                                <p>{actionData.error}</p>
                            </Banner>
                        )}
                        {actionData?.success && (
                            <Banner tone="success">
                                <p>Group created successfully!</p>
                            </Banner>
                        )}
                        <Layout>
                            <Layout.Section>
                                <PageHeader 
                                    title="Create" 
                                    subtitle="Customer Group"
                                />
                            </Layout.Section>
                            <Layout.Section>
                                <div style={{display: "flex", justifyContent: "flex-end", alignContent: "flex-end", gap: "10px"}}>
                                    <Link to="/app/customergroups/"><Button icon={ExitIcon}> Cancel </Button></Link>
                                    <Button variant="primary" onClick={generateGroup}>
                                        Save and Continue
                                    </Button>
                                </div>
                            </Layout.Section>
                            <Layout.Section>
                                <Card>
                                    <Text variant="headingMd" as="h2">
                                        Group Name
                                    </Text>
                                    <TextField
                                        id="name"
                                        name="name"
                                        label=""
                                        autoComplete="off"
                                        requiredIndicator={true}
                                        value={name}
                                        helpText="For internal use; buyers won't see this."
                                        onChange={setName}
                                        error={actionData?.error === 'Group name is required' ? actionData.error : undefined}
                                    />
                                </Card>
                            </Layout.Section>
                            <Layout.Section>
                                <Card>
                                    <BlockStack gap="200">
                                        <Text variant="headingMd" as="h2">
                                            Default Discount (% off MSRP)
                                        </Text>
                                        {showMaxValueWarning && (
                                            <Banner
                                                title="Maximum Value Reached"
                                                tone="warning"
                                                onDismiss={() => setShowMaxValueWarning(false)}
                                            >
                                                <p>The maximum allowed value is 100%.</p>
                                            </Banner>
                                        )}
                                        <TextField
                                            label=""
                                            type="number"
                                            value={overallAdjustment}
                                            onChange={handleOverallAdjustmentChange}
                                            autoComplete="off"
                                            helpText="Enter a value between 0-100. This is the group's default discount for all products, including any new items added later, and is applied as a percentage off the full price (MSRP). This can be manually adjusted per product on the next page."
                                            min={0}
                                            max={100}
                                            step={0.01}
                                        />
                                    </BlockStack>
                                </Card>
                            </Layout.Section>
                            <Layout.Section>
                                <Card>
                                    <Text variant="headingMd" as="h2">
                                        Payment Methods
                                    </Text>
                                    <BlockStack>
                                        <div ref={paymentsRef}>
                                            <ChoiceList
                                                allowMultiple
                                                title="Select the payment options you'd like to make available to buyers in this group."
                                                choices={paymentOptions}
                                                selected={selectedPayments}
                                                onChange={handleChangePayments}
                                                error={actionData?.error === 'At least one payment method must be selected' ? actionData.error : undefined}
                                            />
                                        </div>
                                    </BlockStack>
                                </Card>
                            </Layout.Section>
                            <Layout.Section>
                                <Card>
                                    <Text variant="headingMd" as="h2">
                                        Default Quantity Rules
                                    </Text>
                                    <BlockStack gap="400">
                                    <Text as="p"> Set the quantity limits and increments buyers must follow when adding products to their cart in this group. These settings apply to all products in the group but can be adjusted per product on the next page.</Text>
                                        <TextField
                                            id="minimum"
                                            name="minimum"
                                            label={(
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                  <span><b>Minimum</b><em> (optional - defaults to 1)</em></span>
                                                  <Tooltip content={
                                                    <div>
                                                        <strong>Minimum</strong><br />
                                                        The smallest number of units a buyer can add to their cart for each product. 
                                                    </div>
                                                }>
                                                    <Icon source={InfoIcon} tone="subdued" />
                                                  </Tooltip>
                                                </div>
                                              )}
                                            autoComplete="off"
                                            value={minimum}
                                            onChange={handleChange(setMinimum)}
                                            onBlur={handleMinimumBlur}
                                            type="text"
                                        />
                                        <TextField
                                            id="maximum"
                                            name="maximum"
                                            label={(
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                  <span><b>Maximum</b><em> (optional - defaults to no max)</em></span>
                                                  <Tooltip content={
                                                    <div>
                                                        <strong>Maximum</strong><br />
                                                        The largest number of units a buyer can add to their cart for each product.  
                                                    </div>
                                                }>
                                                    <Icon source={InfoIcon} tone="subdued" />
                                                  </Tooltip>
                                                </div>
                                              )}
                                            autoComplete="off"
                                            value={maximum}
                                            onChange={handleChange(setMaximum)}
                                            onBlur={handleMaximumBlur}
                                            type="text"
                                        />
                                        <TextField
                                            id="increment"
                                            name="increment"
                                            label={(
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                  <span><b>Increments</b><em> (optional - defaults to 1)</em></span>
                                                  <Tooltip content={
                                                    <div>
                                                        <strong>Increments</strong><br />
                                                        Buyers will only be able to add a product to their cart in multiples of this value (e.g., 5, 10, 15).  
                                                    </div>
                                                }>
                                                    <Icon source={InfoIcon} tone="subdued" />
                                                  </Tooltip>
                                                </div>
                                              )}
                                            autoComplete="off"
                                            value={increment}
                                            onChange={handleChange(setIncrement)}
                                            onBlur={handleIncrementBlur}
                                            type="text"
                                        />
                                    </BlockStack>
                                </Card>
                            </Layout.Section>
                            </Layout>
                    </Page>
                </>
            )}
        </>
    )
}

export default CreateGroup;
