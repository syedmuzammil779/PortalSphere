import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigate, json } from "@remix-run/react";
import { Button, Card, Text, Page, BlockStack, RadioButton, Checkbox, Layout} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import PageHeader from "~/components/PageHeader";
import { PageLoadSpinner } from "~/components/PageLoadSpinner";
import { getShopId, isSubscriptionActive, setStoreType, updateSettings } from "~/services/Settings.server";
import { authenticate } from "~/shopify.server";

interface IShopConfig {
    enableComplemenaryProducts: boolean;
    enableTopProducts: boolean;
    storeType: string;
    shippingConfig?: {
        minimumPurchaseAmount: number;
        flatRate: number;
        status: string;
    };
}

const shopConfigQuery =`
query {
  shop {
    id
    metafields(first: 250, namespace:"b2bplus"){
      nodes{
        id
        key
        value
      }
    }
  }
}
`

interface IFetchMessage {
    type: string;
    message: string;
}

export const loader: LoaderFunction = async ({ request }) => {   
    const { admin, session, redirect } = await authenticate.admin(request);
    const { getThemesForStore, getLiveTheme, checkIfScriptIsEnabled, getConfigSettingsJSONFile } = await import('~/services/CustomFunctions.server');
    
    var themesOfThisStore;
    var liveTheme: { id: any; } | null | undefined;
    var isProductPricingScriptEnabled = false;
    var isTopProductsScriptEnabled = false;
    var isTopSellerPopupScriptEnabled = false;

    try {
        themesOfThisStore = await getThemesForStore(admin);
        liveTheme = await getLiveTheme(themesOfThisStore);
    
        if (liveTheme && Object.hasOwn(liveTheme, 'id')) {
            const assets = await getConfigSettingsJSONFile(admin, session, liveTheme.id);
            isProductPricingScriptEnabled = await checkIfScriptIsEnabled(assets, 'product-pricing-embed/f718d695-5b2e-4a23-b3fa-453b8c5945ba');
            isTopProductsScriptEnabled = await checkIfScriptIsEnabled(assets, 'top-products-embed/f718d695-5b2e-4a23-b3fa-453b8c5945ba');
            isTopSellerPopupScriptEnabled = await checkIfScriptIsEnabled(assets, 'top-seller-popup-embed/f718d695-5b2e-4a23-b3fa-453b8c5945ba');
        }    
    } catch (error: any) {
        console.log(error.message);
        console.trace(error);
    }
    
    if(!(await isSubscriptionActive(admin))) {
        return redirect('/app/subscription');
    }
 
    let shopConfig: IShopConfig = {
        enableComplemenaryProducts: false,
        enableTopProducts: false,
        storeType: "Unassigned"
    };

    let fetchMessage: IFetchMessage = {
        type: "error",
        message: "Unable to fetch store configurations"
    }

    let enableComplemenaryProducts: string = "false";
    let enableTopProducts: string = "false";
    try {
            const configResponse = await admin.graphql(shopConfigQuery);

            const configData = await configResponse.json();
            //console.log(configData)
            if (Array.isArray(configData?.data?.shop?.metafields?.nodes) && configData?.data?.shop?.metafields?.nodes?.length > 0) {
                enableComplemenaryProducts = configData.data.shop.metafields.nodes.find((node: any) => node.key === "enableComplementaryProducts")?.value;
                enableTopProducts = configData.data.shop.metafields.nodes.find((node: any) => node.key === "enableTopProducts")?.value;
                shopConfig.storeType = configData.data.shop.metafields.nodes.find((node: any) => node.key === "storeType")?.value;
                fetchMessage = {type:"success", message:"Successfully fetched store configurations"}
            }            

            shopConfig.enableComplemenaryProducts = (enableComplemenaryProducts === "true") ? true : false;
            shopConfig.enableTopProducts = (enableTopProducts === "true") ? true : false;
          
            const shippingConfigNode = configData.data.shop.metafields.nodes.find(
                (node: any) => node.key === "shipping-discount-config"
            );
            if (shippingConfigNode) {
                shopConfig.shippingConfig = JSON.parse(shippingConfigNode.value);
            }

            return {
                shopConfig, 
                message: fetchMessage, 
                liveTheme: liveTheme, 
                isProductPricingScriptEnabled: isProductPricingScriptEnabled,
                isTopProductsScriptEnabled: isTopProductsScriptEnabled,
                isTopSellerPopupScriptEnabled: isTopSellerPopupScriptEnabled
            }


    } catch(err){
        console.error(err);
        // Get the redirect page from the passed environment variable or default to "/app"
        const redirectPage = process.env.ERROR_REDIRECT_PAGE || '/app';
        return redirect(redirectPage);
    }
    return {shopConfig, message: fetchMessage}
}

export const action: ActionFunction = async ({ request }) => {
    const { admin, redirect, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const { shop } = session;
    const shopId = await getShopId(admin, shop);
    try {
        const complementaryProductsData = formData.get('enableComplemenaryProducts') ?? 'false';
        const topProductsData = formData.get('enableTopProducts') ?? 'false';
        const storeTypeData = formData.get('storeType')?.toString() ?? 'B2B';
        const shippingConfigData = formData.get('shippingConfig');

        await Promise.all([
            setStoreType(admin, storeTypeData, shopId),
            updateSettings(admin, 'enableComplementaryProducts', complementaryProductsData.toString()),
            updateSettings(admin, 'enableTopProducts', topProductsData.toString()),
            shippingConfigData && updateSettings(admin, 'shipping-discount-config', shippingConfigData.toString())
        ].filter(Boolean));
        
    } catch (error) {
        console.error(error);
        // Get the redirect page from the passed environment variable or default to "/app"
        const redirectPage = process.env.ERROR_REDIRECT_PAGE || '/app';
        return redirect(redirectPage);
    }
    return redirect("/app");
}

const StoreConfigurations = () => {
    const { shopConfig, message, liveTheme, isProductPricingScriptEnabled, isTopProductsScriptEnabled, isTopSellerPopupScriptEnabled}: any = useLoaderData();

    const [isFirstScriptEnabled, setIsFirstScriptEnabled] = useState(isProductPricingScriptEnabled);
    const [isSecondScriptEnabled, setIsSecondScriptEnabled] = useState(isTopProductsScriptEnabled);
    const [isThirdScriptEnabled, setIsThirdScriptEnabled] = useState(isTopSellerPopupScriptEnabled);
    const [liveThemeId] = useState(liveTheme?.id || null);

    // This effect will run once when the component mounts
    useEffect(() => {
        // Set the isFirstScriptEnabled to a boolean value, based on loader data
        setIsFirstScriptEnabled(isProductPricingScriptEnabled ?? false);
    }, [isProductPricingScriptEnabled]);

    useEffect(() => {
        // Set the isFirstScriptEnabled to a boolean value, based on loader data
        setIsSecondScriptEnabled(isSecondScriptEnabled ?? false);
    }, [isSecondScriptEnabled]);

    useEffect(() => {
        // Set the isFirstScriptEnabled to a boolean value, based on loader data
        setIsThirdScriptEnabled(isSecondScriptEnabled ?? false);
    }, [isThirdScriptEnabled]);

    const submit = useSubmit();
    const navigate = useNavigate();
    const [storeType, setStoreType] = useState((shopConfig as IShopConfig).storeType);
    const [isSaving, setIsSaving] = useState(false);
    const [enableComplemenaryProducts, setEnableComplemenaryProducts] = useState((shopConfig as IShopConfig).enableComplemenaryProducts);
    const [enableTopProducts, setEnableTopProducts] = useState((shopConfig as IShopConfig).enableTopProducts);
    const [shippingStatus, setShippingStatus] = useState(
        shopConfig.shippingConfig?.status === "active"
    );

    const handlestoreTypeChange = useCallback(
      (_: boolean, newValue: string) => setStoreType(newValue),
      [],
    );

    const setCheckedComplementaryProducts = useCallback(
        (newChecked: boolean) => setEnableComplemenaryProducts(newChecked),
        [],
    );

    const setCheckedTopProducts = useCallback(
        (newChecked: boolean) => setEnableTopProducts(newChecked),
        [],
    );
    
    const handleSaveConfigurations = () => {
        setIsSaving(true);
        const formData = new FormData();
        formData.append('storeType', storeType);
        formData.append('enableComplemenaryProducts', enableComplemenaryProducts.toString());
        formData.append('enableTopProducts', enableTopProducts.toString());

        if (shopConfig.shippingConfig) {
            const shippingConfig = {
                ...shopConfig.shippingConfig,
                status: shippingStatus ? 'active' : 'inactive'
            };
            formData.append('shippingConfig', JSON.stringify(shippingConfig));
        }

        submit(formData, { method: 'POST' });
    };

    const handleShippingStatusChange = useCallback(
        (checked: boolean) => setShippingStatus(checked),
        []
    );

    return (
        <>
            {isSaving ? (
                <PageLoadSpinner 
                    title="Saving store settings..." 
                    subtitle="This may take a few moments"
                />
            ) : (
            <Page>
                <Layout>
                    <Layout.Section>
                        <PageHeader 
                            title="Account" 
                            subtitle="Settings"
                        />
                        
                        <div style={{
                            display: "flex", 
                            justifyContent: "space-between", 
                            alignItems: "center",
                            marginTop: "24px", 
                            marginBottom: "24px"
                        }}>
                            <div style={{ maxWidth: "70%" }}>
                                <Text variant="bodyLg" tone="subdued" as="p">
                                    Configure account settings to choose store type (B2B-only or B2B/B2C), enable upsells, set shipping rules, manage product visibility, and control access request notifications.
                                </Text>
                            </div>
                            <Button variant="primary" onClick={handleSaveConfigurations}>Save Configurations</Button>
                        </div>
                    </Layout.Section>
                    <Layout.Section>
                        <BlockStack gap="200">
                            <Card>
                                <BlockStack>
                                    <Text as="h3" variant="headingMd">Store Type</Text>
                                    <RadioButton
                                        label="B2B"
                                        helpText="B2B Portal - For approved B2B buyers only. Checkout and wholesale prices are hidden until login."
                                        checked={storeType === 'B2B'}
                                        id="B2B"
                                        name="activeStoreType"
                                        onChange={handlestoreTypeChange}
                                    />
                                    <RadioButton
                                        label="B2B and B2C"
                                        helpText="Hybrid - Add B2B features to your B2C site. Regular shoppers see full prices; B2B buyers see wholesale prices & quantity rules."
                                        name="activeStoreType"
                                        id="Hybrid"
                                        checked={storeType === 'Hybrid'}
                                        onChange={handlestoreTypeChange}
                                    />
                                </BlockStack>
                            </Card>    
                            {liveThemeId && (
                            <div style={{marginTop: '10px'}}>
                                <BlockStack gap="500">
                                    <Card>
                                        <Text as="h3" variant="headingMd">Please click the "Save" button on the top right of the theme editor to activate the script</Text>
                                        <table style={{ width: '100%', marginTop:'10px', borderCollapse: 'collapse' }}>
                                            <tbody>
                                                <tr>
                                                    <td style={{width: '70%'}}>PortalSphere Script: <b>{isFirstScriptEnabled ? "Enabled" : "Disabled"}</b></td>
                                                    <td>
                                                        {!isFirstScriptEnabled ? (
                                                        <>
                                                        <Button
                                                            variant="primary"
                                                            onClick={() => navigate(`/app/enable-script?context=apps&activateAppId=f718d695-5b2e-4a23-b3fa-453b8c5945ba/product-pricing-embed&liveThemeId=${liveThemeId}`)}
                                                            fullWidth
                                                        >
                                                            Enable now
                                                        </Button>
                                                        </>
                                                        ) : ('')}
                                                    </td>
                                                </tr>
                                                <tr style={{display: 'none'}}>
                                                    <td style={{paddingTop: '20px'}}>Top Products Script: <b>{isSecondScriptEnabled ? "Enabled":"Disabled"}</b></td>
                                                    <td style={{paddingTop: '20px'}}>
                                                        {!isSecondScriptEnabled ? (
                                                            <>
                                                            <Button
                                                                variant="primary"
                                                                onClick={() => navigate(`/app/enable-script?context=apps&activateAppId=f718d695-5b2e-4a23-b3fa-453b8c5945ba/top-products-embed&liveThemeId=${liveThemeId}`)}
                                                                fullWidth
                                                            >
                                                                Enable now
                                                            </Button>
                                                            </>
                                                        ) : ('')}
                                                    </td>
                                                </tr>
                                                <tr style={{display: 'none'}}>
                                                    <td style={{paddingTop: '20px'}}>Top Seller Popup Script: <b>{isThirdScriptEnabled ? "Enabled":"Disabled"}</b></td>
                                                    <td style={{paddingTop: '20px'}}>
                                                        {!isThirdScriptEnabled ? (
                                                            <>
                                                            <Button
                                                                variant="primary"
                                                                target="_blank"
                                                                onClick={() => navigate(`/app/enable-script?context=apps&activateAppId=f718d695-5b2e-4a23-b3fa-453b8c5945ba/top-seller-popup-embed&liveThemeId=${liveTheme.id}`)}
                                                                fullWidth
                                                            >
                                                                Enable now
                                                            </Button>
                                                            </>
                                                        ) : ('')}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </Card>
                                </BlockStack>
                            </div>
                        )}
                            <div style={{marginTop: '10px'}}>
                                <Card>
                                    <Text as="h3" variant="headingMd">Upsell Configurations</Text>
                                    <BlockStack>
                                        <Checkbox
                                            label="Enable Top Products"
                                            checked={enableTopProducts}
                                            onChange={setCheckedTopProducts}
                                        />
                                        <Checkbox
                                            label="Enable Complementary Products"
                                            checked={enableComplemenaryProducts}
                                            onChange={setCheckedComplementaryProducts}
                                        />
                                    </BlockStack>    
                                </Card>
                            </div>
                            
                            {storeType === 'Hybrid' && (
                                <div style={{marginTop: '10px'}}>
                                    <Card>
                                    <BlockStack gap="400">
                                        <Text as="h3" variant="headingMd">B2B Shipping Configuration</Text>
                                        
                                        {shopConfig.shippingConfig ? (
                                            <>
                                                <BlockStack gap="200">
                                                    <Text as="p" variant="bodyMd">
                                                        Minimum Purchase Amount: ${shopConfig.shippingConfig.minimumPurchaseAmount}
                                                    </Text>
                                                    <Text as="p" variant="bodyMd">
                                                        Flat Rate: ${shopConfig.shippingConfig.flatRate}
                                                    </Text>
                                                    <Checkbox
                                                        label="Enable Shipping Discount"
                                                        checked={shippingStatus}
                                                        onChange={handleShippingStatusChange}
                                                    />
                                                </BlockStack>
                                                
                                                <div style={{ marginTop: "1rem" }}>
                                                    <Button
                                                        onClick={() => navigate("/app/shipping-discounts/config")}
                                                    >
                                                        Edit Shipping Configuration
                                                    </Button>
                                                </div>
                                            </>
                                        ) : (
                                            <BlockStack gap="200">
                                                <Text as="p" variant="bodyMd" tone="subdued">
                                                    No shipping configuration found.
                                                </Text>
                                                <Button
                                                    onClick={() => navigate("/app/shipping-discounts/config")}
                                                >
                                                    Configure Shipping
                                                </Button>
                                            </BlockStack>
                                        )}
                                    </BlockStack>
                                </Card>
                                </div>
                                
                            )}
                            {storeType === 'Hybrid' && (
                                <div style={{marginTop: '10px'}}>
                                <Card>
                                    <BlockStack gap="400">
                                        <Text as="h3" variant="headingMd">Product Visibility Settings</Text>
                                        <Text as="p" variant="bodyMd">
                                            Manage which products are visible to different customer groups.
                                        </Text>
                                        <div>
                                            <Button
                                                variant="primary"
                                                onClick={() => navigate("/app/product-visibility")}
                                            >
                                                Product Visibility
                                            </Button>
                                        </div>
                                    </BlockStack>
                                </Card>
                                </div>
                                
                            )}

                            <div style={{marginTop: '10px'}}>
                                <Card>
                                <BlockStack gap="400">
                                    <Text as="h3" variant="headingMd">Notification Emails</Text>
                                    <Text as="p" variant="bodyMd">
                                       Add email addresses aside from the store owner to receive notifications when a new wholesale buyer request is made.
                                    </Text>
                                    <div>
                                        <Button
                                            variant="primary"
                                            onClick={() => navigate("/app/notification-emails")}
                                        >
                                            Add Email Addresses
                                        </Button>
                                    </div>
                                </BlockStack>
                            </Card>
                            </div>
                            
                        </BlockStack>
                        
                    </Layout.Section>
                </Layout>
            </Page>
        )}
        </>
    );
}

export default StoreConfigurations
