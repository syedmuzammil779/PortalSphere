import {
    Page, Layout, BlockStack, Card, Text,
    TextField, Tag,
    Button, Spinner
} from "@shopify/polaris";
import PageHeader from "~/components/PageHeader";
import { useState, useEffect } from "react";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { getSettings, updateSettings } from "~/services/Settings.server";
import type { LoaderFunction, ActionFunction } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { redirect } from "@remix-run/node";

export const loader: LoaderFunction = async ({ request }) => {  
    const { admin } = await authenticate.admin(request);
    const wholesaleSavedTags = (await getSettings(admin, "wholesaleExclusionTags")) || "";
    const retailSavedTags = (await getSettings(admin, "retailExclusionTags")) || "";
    return { wholesaleSavedTags, retailSavedTags };
}

export const action: ActionFunction = async ({ request }) => {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const wholesaleTags = formData.get("wholesaleTags");
    const retailTags = formData.get("retailTags");
    await updateSettings(admin, "wholesaleExclusionTags", wholesaleTags as string);
    await updateSettings(admin, "retailExclusionTags", retailTags as string);
    return redirect("/app/storeconfigs");
};

const ProductVisibility: React.FC = () => {
    const { wholesaleSavedTags, retailSavedTags } = useLoaderData<{ wholesaleSavedTags: string, retailSavedTags: string }>();
    const [wholesaleTag, setWholesaleTag] = useState('');
    const [wholesaleTags, setWholesaleTags] = useState<string[]>([]);
    const [retailTag, setRetailTag] = useState('');
    const [retailTags, setRetailTags] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const submit = useSubmit();

    useEffect(() => {
        if (wholesaleSavedTags) {
            const tagArray = wholesaleSavedTags.split(',').filter(tag => tag.trim());
            setWholesaleTags(tagArray);
        }
    }, [wholesaleSavedTags]);

    useEffect(() => {
        if (retailSavedTags) {
            const tagArray = retailSavedTags.split(',').filter(tag => tag.trim());
            setRetailTags(tagArray);
        }
    }, [retailSavedTags]);

    const handleWholesaleTagInput = (value: string) => {
        if (value.endsWith(',')) {
            const newTag = value.replace(/,/, '').trim();
            if (newTag && !wholesaleTags.includes(newTag)) {
                setWholesaleTags([...wholesaleTags, newTag]);
            }
            setWholesaleTag('');
        } else {
            setWholesaleTag(value);
        }
    };

    const handleWholesaleBlur = () => {
        if (wholesaleTag.trim() && !wholesaleTags.includes(wholesaleTag.trim())) {
            setWholesaleTags([...wholesaleTags, wholesaleTag.trim()]);
        }
        setWholesaleTag('');
    };

    const removeWholesaleTag = (tagToRemove: string) => {
        setWholesaleTags(wholesaleTags.filter(tag => tag !== tagToRemove));
    };

    const handleRetailTagInput = (value: string) => {
        if (value.endsWith(',')) {
            const newTag = value.replace(/,/, '').trim();
            if (newTag && !retailTags.includes(newTag)) {
                setRetailTags([...retailTags, newTag]);
            }
            setRetailTag('');
        } else {
            setRetailTag(value);
        }
    };

    const handleRetailBlur = () => {
        if (retailTag.trim() && !retailTags.includes(retailTag.trim())) {
            setRetailTags([...retailTags, retailTag.trim()]);
        }
        setRetailTag('');
    };

    const removeRetailTag = (tagToRemove: string) => {
        setRetailTags(retailTags.filter(tag => tag !== tagToRemove));
    };

    const handleSave = () => {
        setIsLoading(true);
        const formData = new FormData();
        formData.append("wholesaleTags", wholesaleTags.join(','));
        formData.append("retailTags", retailTags.join(','));
        submit(formData, { method: "post" });
    };

    return (
        <Page>
            <Layout>
                    <Layout.Section>
                        <PageHeader 
                            title="Product Visibility" 
                            subtitle="Settings"
                        />
                    </Layout.Section>
                    <Layout.Section>
                        <div style={{display: "flex", justifyContent: "flex-end", alignContent: "flex-end"}}>
                        <Button 
                            variant="primary" 
                            onClick={handleSave}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <Spinner size="small" />
                            ) : (
                                'Save Configurations'
                            )}
                        </Button>
                        </div>
                    </Layout.Section>
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="500">
                                <BlockStack gap="100">
                                    <Text as="h3" variant="headingMd">Product Visibility Settings</Text>
                                    <Text as="p" variant="bodyMd">
                                        Manage which products are visible to different customer groups.
                                    </Text>
                                    <Text as="p" tone="subdued">One of our technical experts will setup your store to hide products from buyers.</Text>
                                    <Text as="p" tone="subdued">We'll notify you when it's done (typically within 48 hours).</Text>
                                </BlockStack>
                                <BlockStack gap="200">
                                    <Text as="h4" variant="headingMd">Wholesale Exclusion Tags</Text>
                                    <TextField
                                        label=""
                                        type="text"
                                        value={wholesaleTag}
                                        onChange={handleWholesaleTagInput}
                                        onBlur={handleWholesaleBlur}
                                        placeholder="Enter wholesale tag (e.g., retail)"
                                        helpText="Enter tags separated by commas (e.g., retail, consumer)"
                                        autoComplete="off"
                                    />
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                                        {wholesaleTags.map((tag) => (
                                            <Tag key={tag} onRemove={() => removeWholesaleTag(tag)}>{tag}</Tag>
                                        ))}
                                    </div>
                                </BlockStack>
                                <BlockStack gap="200">
                                    <Text as="h4" variant="headingMd">Retail Exclusion Tags</Text>
                                    <TextField
                                        label=""
                                        type="text"
                                        value={retailTag}
                                        onChange={handleRetailTagInput}
                                        onBlur={handleRetailBlur}
                                        placeholder="Enter retail tag (e.g., wholesale)"
                                        helpText="Enter tags separated by commas (e.g., wholesale, b2b)"
                                        autoComplete="off"
                                    />
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                                        {retailTags.map((tag) => (
                                            <Tag key={tag} onRemove={() => removeRetailTag(tag)}>{tag}</Tag>
                                        ))}
                                    </div>
                                </BlockStack>
                            </BlockStack>                            
                        </Card>
                    </Layout.Section>
                </Layout>
        </Page>        
    );
}

export default ProductVisibility;