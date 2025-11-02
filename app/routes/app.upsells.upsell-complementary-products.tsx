import type {
    IndexTableSelectionType
} from "@shopify/polaris";
import {
    Card,
    Layout,
    Page,
    Checkbox,
    Text,
    Tabs,
    IndexTable,
    Thumbnail,
    useIndexResourceState,
    Pagination,
    Select,
    Spinner,
    TextField,
    Button,
    Badge,
    Modal
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { useLoaderData, useSubmit, useSearchParams, useNavigation, useActionData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { getSettings, isSubscriptionActive, updateSettings } from "~/services/Settings.server";
import { 
    getComplementaryProductsCounts, 
    getUnassignedProductVariants, 
    getAssignedProductVariants,
    type ComplementaryProductsCounts,
    type UnassignedProductVariant,
    type AssignedProductVariant,
    replaceComplementaryProductVariant,
    resetComplementaryProducts
} from "~/services/ComplementaryProducts.server";
import type { LoaderFunction, ActionFunction, TypedResponse } from "@remix-run/node";
import { json } from "@remix-run/node";
import PageHeader from "~/components/PageHeader";
import { initializeComplementaryProducts } from "~/services/CustomFunctions.server";
import prisma from "~/db.server";

const complementaryProdEnabledFlag = 'enableComplementaryProducts';
const DEFAULT_PAGE_SIZE = 20;

interface LoaderData {
  isComplementaryProductsEnabled: boolean;
  counts: ComplementaryProductsCounts;
  unassignedVariants: {
    data: UnassignedProductVariant[];
    total: number;
  };
  assignedVariants: {
    data: AssignedProductVariant[];
    total: number;
  };
  unassignedPage: number;
  assignedPage: number;
  pageSize: number;
  searchTerm: string;
}

export const loader: LoaderFunction = async ({ request }): Promise<LoaderData | TypedResponse<never>> => {
    const { admin, redirect, session } = await authenticate.admin(request);
    
    if(!(await isSubscriptionActive(admin))) {
        return redirect('/app/subscription');
    }
    const {shop} = session;
    const url = new URL(request.url);
    const unassignedPage = parseInt(url.searchParams.get('unassignedPage') || '1', 10);
    const assignedPage = parseInt(url.searchParams.get('assignedPage') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') || DEFAULT_PAGE_SIZE.toString(), 10);
    const searchTerm = url.searchParams.get('search') || '';

    try {
        const isComplementaryProductsEnabled = (await getSettings(admin, complementaryProdEnabledFlag))?.toLocaleLowerCase() === 'true';
        var counts = await getComplementaryProductsCounts(admin);
        if(counts != null && counts.hasOwnProperty('assigned') && counts.hasOwnProperty('unassigned') && counts.hasOwnProperty('total')) {
            if(counts.assigned == 0 && counts.unassigned == 0 && counts.total == 0) {
                var store = await prisma.session.findFirst({where: {shop: shop}});
                await initializeComplementaryProducts(store);
                counts = await getComplementaryProductsCounts(admin);
            }
        }
        const unassignedVariants = await getUnassignedProductVariants(admin, unassignedPage, pageSize, searchTerm);
        const assignedVariants = await getAssignedProductVariants(admin, assignedPage, pageSize, searchTerm);
        return { isComplementaryProductsEnabled, counts, unassignedVariants, assignedVariants, unassignedPage, assignedPage, pageSize, searchTerm };
    } catch (error) {
        console.error(error);
        return { 
            isComplementaryProductsEnabled: false, 
            counts: { assigned: 0, unassigned: 0, total: 0 }, 
            unassignedVariants: { data: [], total: 0 }, 
            assignedVariants: { data: [], total: 0 },
            unassignedPage: 1,
            assignedPage: 1,
            pageSize: DEFAULT_PAGE_SIZE,
            searchTerm: ''
        };
    }
};

export const action: ActionFunction = async ({ request }) => {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const actionType = formData.get('actionType')?.toString();

    if (actionType === 'assignComplementaryProduct' || actionType === 'removeComplementaryProduct') {
        const variantIds = JSON.parse(formData.get('variantIds') as string);
        const complementaryProductVariantId = actionType === 'assignComplementaryProduct' ? formData.get('complementaryProductVariantId') as string : null;

        try {
            for (const variantId of variantIds) {
                await replaceComplementaryProductVariant(admin, variantId, complementaryProductVariantId);
            }
            // Fetch updated counts after assigning or removing
            const updatedCounts = await getComplementaryProductsCounts(admin);
            return json({ success: true, updatedCounts });
        } catch (error) {
            console.error(`Error ${actionType === 'assignComplementaryProduct' ? 'assigning' : 'removing'} complementary products:`, error);
            return json({ success: false, error: `Failed to ${actionType === 'assignComplementaryProduct' ? 'assign' : 'remove'} complementary products` }, { status: 500 });
        }
    }

    if (actionType === 'enable') {
        const data = JSON.parse(formData.get('data')?.toString() ?? '{}');
        try {
            //console.debug(actionType, data);
            await updateSettings(admin, complementaryProdEnabledFlag, data);
        }
        catch (error) {
            console.error(error);
        }
    }

    if (actionType === 'reset') {
        try {
            await resetComplementaryProducts(admin);
            return json({ success: true });
        } catch (error) {
            console.error('Error resetting complementary products:', error);
            return json({ success: false, error: 'Failed to reset complementary products' }, { status: 500 });
        }
    }

    return null;
}

const UpsellComplementaryProducts: React.FC = () => {
    const { isComplementaryProductsEnabled, counts: initialCounts, unassignedVariants, assignedVariants, unassignedPage, assignedPage, pageSize, searchTerm: initialSearchTerm } = useLoaderData<LoaderData>();
    const actionData = useActionData();
    const [counts, setCounts] = useState(initialCounts);
    const [isEnabled, setIsEnabled] = useState(isComplementaryProductsEnabled);
    const submit = useSubmit();
    const [searchParams, setSearchParams] = useSearchParams();
    const [selectedTab, setSelectedTab] = useState(0);
    const navigation = useNavigation();
    const [isLoadingPage, setIsLoadingPage] = useState(false);
    const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
    const [showResetDialog, setShowResetDialog] = useState(false);

    const {
        selectedResources: selectedUnassignedResources,
        allResourcesSelected: allUnassignedResourcesSelected,
        handleSelectionChange: handleUnassignedSelectionChange,
        clearSelection: clearUnassignedSelection,
    } = useIndexResourceState(unassignedVariants.data);

    const {
        selectedResources: selectedAssignedResources,
        allResourcesSelected: allAssignedResourcesSelected,
        handleSelectionChange: handleAssignedSelectionChange,
        clearSelection: clearAssignedSelection,
    } = useIndexResourceState(assignedVariants.data);

    useEffect(() => {
      if (navigation.state === "loading") {
        setIsLoadingPage(true);
      } else if (navigation.state === "idle" && isLoadingPage) {
        setIsLoadingPage(false);
      }
    }, [navigation.state, isLoadingPage]);

    // Clear selections when switching tabs or when page changes
    useEffect(() => {
        clearUnassignedSelection();
        clearAssignedSelection();
    }, [selectedTab, unassignedPage, assignedPage, clearUnassignedSelection, clearAssignedSelection]);

    useEffect(() => {
        if (actionData?.updatedCounts) {
            setCounts(actionData.updatedCounts);
        }
    }, [actionData]);

    useEffect(() => {
        setIsEnabled(isComplementaryProductsEnabled);
    }, [isComplementaryProductsEnabled]);

    const handleEnableComplementaryProducts = async (value: boolean) => {
        window.shopify.loading(true);
        setIsEnabled(value); // Update local state immediately
        const formData = new FormData();
        formData.append('actionType', 'enable');
        formData.append('data', JSON.stringify(value ? 'true' : 'false'));
        submit(formData, { method: 'POST' });
        window.shopify.loading(false);
        window.shopify.toast.show('Complementary Products ' + (value ? 'Enabled' : 'Disabled'));
    };

    const handlePaginationChange = useCallback(
        (newPage: number) => {
            const newSearchParams = new URLSearchParams(searchParams);
            if (selectedTab === 0) {
                newSearchParams.set('unassignedPage', newPage.toString());
            } else {
                newSearchParams.set('assignedPage', newPage.toString());
            }
            setSearchParams(newSearchParams);
        },
        [searchParams, selectedTab, setSearchParams]
    );


    const handlePageSizeChange = useCallback(
        (newSize: string) => {
            const newSearchParams = new URLSearchParams(searchParams);
            newSearchParams.set('pageSize', newSize);
            newSearchParams.set('unassignedPage', '1');
            newSearchParams.set('assignedPage', '1');
            setSearchParams(newSearchParams);
        },
        [searchParams, setSearchParams]
    );

    const tabs = [
        {
            id: 'unassigned',
            content: 'Unassigned',
            accessibilityLabel: 'Unassigned complementary products',
            panelID: 'unassigned-panel',
        },
        {
            id: 'assigned',
            content: 'Assigned',
            accessibilityLabel: 'Assigned complementary products',
            panelID: 'assigned-panel',
        },
    ];

    const handleSelectionChange = useCallback(
      (selectionType: IndexTableSelectionType, toggleType: boolean, id: string) => {
          if (selectedTab === 0) {
              if (selectionType === 'page') {
                  if (toggleType) {
                      handleUnassignedSelectionChange('page', true);
                  } else {
                      clearUnassignedSelection();
                  }
              } else {
                  handleUnassignedSelectionChange(selectionType, toggleType, id);
              }
          } else {
              if (selectionType === 'all') {
                  if (toggleType) {
                      handleAssignedSelectionChange('all', true);
                  } else {
                      clearAssignedSelection();
                  }
              } else {
                  handleAssignedSelectionChange(selectionType, toggleType, id);
              }
          }
      },
      [selectedTab, handleUnassignedSelectionChange, handleAssignedSelectionChange, clearUnassignedSelection, clearAssignedSelection]
  );

    const renderVariantRow = (variant: UnassignedProductVariant | AssignedProductVariant, index: number) => {
        const variantTitle = variant.productInfo.variantTitle && variant.productInfo.variantTitle !== "Default Title"
            ? ` ${variant.productInfo.variantTitle}`
            : '';

        const getBadgeProps = (status: string) => {
            switch (status.toLowerCase()) {
                case 'active':
                    return { tone: 'success' as const, children: 'Active' };
                case 'draft':
                    return { tone: 'attention' as const, children: 'Draft' };
                case 'archived':
                    return { tone: 'warning' as const, children: 'Archived' };
                default:
                    return { tone: 'info' as const, children: status };
            }
        };

        if (selectedTab === 0) {
            // Unassigned variant row (unchanged)
            return (
                <IndexTable.Row
                    id={variant.id}
                    key={variant.id}
                    selected={selectedUnassignedResources.includes(variant.id)}
                    position={index}
                >
                    <IndexTable.Cell>
                        <Thumbnail source={variant.productInfo.image} alt={variantTitle} />
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                        <Text as="p" variant="bodyMd" fontWeight="bold">{variant.productTitle}</Text>
                        {variantTitle && <Text as="p" variant="bodyMd" tone="subdued">{variantTitle}</Text>}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                        <Badge {...getBadgeProps(variant.productInfo.status)} />
                    </IndexTable.Cell>
                </IndexTable.Row>
            );
        } else {
            // Assigned variant row (modified)
            const assignedVariant = variant as AssignedProductVariant;
            const complementaryVariantTitle = assignedVariant.complementaryProductInfo.variantTitle && assignedVariant.complementaryProductInfo.variantTitle !== "Default Title"
                ? ` ${assignedVariant.complementaryProductInfo.variantTitle}`
                : '';
            

            return (
                <IndexTable.Row
                    id={variant.id}
                    key={variant.id}
                    selected={selectedAssignedResources.includes(variant.id)}
                    position={index}
                >
                    <IndexTable.Cell>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <Thumbnail source={variant.productInfo.image} alt={variant.productTitle} />
                            <div style={{ marginLeft: '12px' }}>
                                <Text as="p" variant="bodyMd" fontWeight="bold">{variant.productTitle}</Text>
                                {variantTitle && <Text as="p" variant="bodyMd" tone="subdued">{variantTitle}</Text>}
                            </div>
                        </div>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <Text as="p" variant="bodyMd" fontWeight="bold">{assignedVariant.complementaryProductInfo.productTitle}</Text>
                                {complementaryVariantTitle && <Text as="p" variant="bodyMd" tone="subdued">{complementaryVariantTitle}</Text>}
                            </div>
                            <Thumbnail source={assignedVariant.complementaryProductInfo.image} alt={assignedVariant.complementaryProductInfo.productTitle} />
                        </div>
                    </IndexTable.Cell>
                </IndexTable.Row>
            );
        }
    };

    const handleSearchChange = useCallback((value: string) => {
        setSearchTerm(value);
    }, []);

    const handleSearchSubmit = useCallback(() => {
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.set('search', searchTerm);
        newSearchParams.set('unassignedPage', '1');
        newSearchParams.set('assignedPage', '1');
        setSearchParams(newSearchParams);
    }, [searchTerm, searchParams, setSearchParams]);

    const handleAssignComplementaryProduct = useCallback(async () => {
        try {
            const selection = await window.shopify.resourcePicker({
                type: 'product',
                action: 'select',
                options: {
                    selectMultiple: false,
                },
            });

            if (selection && selection.length > 0) {
                const selectedProduct = selection[0];
                if (selectedProduct.variants && selectedProduct.variants.length > 0) {
                    const complementaryProductVariantId = selectedProduct.variants[0].id;

                    // Check if any selected variant is trying to assign itself
                    const isSelfAssignment = selectedUnassignedResources.some(
                        variantId => unassignedVariants.data.find(v => v.id === variantId)?.productVariantId === complementaryProductVariantId
                    );

                    if (isSelfAssignment) {
                        window.shopify.toast.show('Cannot assign a product as its own complementary product', { isError: true });
                        return;
                    }

                    window.shopify.loading(true);

                    const formData = new FormData();
                    formData.append('actionType', 'assignComplementaryProduct');
                    formData.append('variantIds', JSON.stringify(selectedUnassignedResources));
                    formData.append('complementaryProductVariantId', complementaryProductVariantId ?? '');

                    submit(formData, { method: 'post' });
                    clearUnassignedSelection();
                    window.shopify.toast.show('Complementary products assigned successfully');
                }
            }
        } catch (error) {
            console.error('Error assigning complementary products:', error);
            window.shopify.toast.show('Error assigning complementary products', { isError: true });
        } finally {
            window.shopify.loading(false);
        }
    }, [selectedUnassignedResources, clearUnassignedSelection, submit, unassignedVariants.data]);

    const handleRemoveComplementaryProduct = useCallback(async () => {
      try { 
        window.shopify.loading(true);

        const formData = new FormData();
        formData.append('actionType', 'removeComplementaryProduct');
        formData.append('variantIds', JSON.stringify(selectedAssignedResources));
        submit(formData, { method: 'post' });
        clearAssignedSelection();
        window.shopify.toast.show('Complementary products removed successfully');
      } catch (error) {
          console.error('Error removing complementary products:', error);
          window.shopify.toast.show('Error removing complementary products', { isError: true });
      } finally {
          window.shopify.loading(false);
      }
    }, [selectedAssignedResources, clearAssignedSelection, submit]);

    const handleResetConfirm = async () => {
        try {
            window.shopify.loading(true);
            submit(
                { actionType: 'reset' },
                { method: 'POST' }
            );
            window.shopify.toast.show('Complementary Products Reset Successfully');
            clearUnassignedSelection();
            clearAssignedSelection();
            setShowResetDialog(false);
            
            // Set timeout for reload only
            setTimeout(() => {
                // Check if both variant lists are empty
                if (unassignedVariants.total === 0 && assignedVariants.total === 0) {
                    console.debug('No variants found, reloading page');
                    window.location.replace(window.location.href);
                }
                window.location.replace(window.location.href);
            }, 15000);
        } catch (error) {
            console.error('Error resetting complementary products:', error);
            window.shopify.toast.show('Error resetting complementary products', { isError: true });
            setShowResetDialog(false);
        } finally {
            window.shopify.loading(false);
        }
    };

    const renderActionButton = () => {
      if (selectedUnassignedResources.length > 0) {
        return (
          <Button variant="primary" onClick={handleAssignComplementaryProduct}>
            Assign Complementary Product
          </Button>
        );
      }
      else if (selectedAssignedResources.length > 0) {
        return (
          <Button variant="primary" onClick={handleRemoveComplementaryProduct}>
            Remove Complementary Product
          </Button>
        );
      }
      return null;
    };

    return (
        <Page>
            <ui-title-bar title="Upsell Complementary Products"></ui-title-bar>
            <Layout>
                <Layout.Section>
                    <PageHeader 
                        title="Complementary Products" 
                        subtitle="Upsell"
                    />
                </Layout.Section>
                <Layout.Section>
                    <Card>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <Checkbox 
                                label="Enable Complementary Products" 
                                checked={isEnabled}
                                onChange={handleEnableComplementaryProducts}
                                name={complementaryProdEnabledFlag}
                            />
                            <Button onClick={() => setShowResetDialog(true)} tone="critical">
                                Reset Complementary Products
                            </Button>
                        </div>
                    </Card>
                </Layout.Section>
                <Layout.Section>
                    <Card>
                        <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
                            <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <Text variant="headingMd" as="h3">{tabs[selectedTab].content}</Text>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                                    {renderActionButton()}
                                    <TextField
                                        label="Search products or variants"
                                        value={searchTerm}
                                        onChange={handleSearchChange}
                                        autoComplete="off"
                                    />
                                    <Button onClick={handleSearchSubmit}>Search</Button>
                                    <Select
                                        label="Page size"
                                        options={[
                                            {label: '10 per page', value: '10'},
                                            {label: '20 per page', value: '20'},
                                            {label: '50 per page', value: '50'},
                                            {label: '100 per page', value: '100'},
                                        ]}
                                        onChange={handlePageSizeChange}
                                        value={pageSize.toString()}
                                    />
                                </div>
                            </div>
                            {isLoadingPage ? (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
                                <Spinner accessibilityLabel="Loading" size="large" />
                            </div>
                        ) : (
                            <><IndexTable
                                resourceName={{ singular: 'variant', plural: 'variants' }}
                                itemCount={selectedTab === 0 ? unassignedVariants.total : assignedVariants.total}
                                selectedItemsCount={
                                    selectedTab === 0 
                                        ? selectedUnassignedResources.length 
                                        : selectedAssignedResources.length
                                }
                                onSelectionChange={handleSelectionChange}
                                headings={
                                    selectedTab === 0
                                        ? [
                                            { title: 'Image' },
                                            { title: 'Product Title' },
                                            { title: 'Status' },
                                        ]
                                        : [
                                            { title: 'Product' },
                                            { title: 'Complementary Product' },
                                        ]
                                }
                            >
                                {(selectedTab === 0 ? unassignedVariants.data : assignedVariants.data).map(renderVariantRow)}
                            </IndexTable>
                            <Pagination
                                hasPrevious={selectedTab === 0 ? unassignedPage > 1 : assignedPage > 1}
                                onPrevious={() => handlePaginationChange(selectedTab === 0 ? unassignedPage - 1 : assignedPage - 1)}
                                hasNext={selectedTab === 0 
                                    ? unassignedPage * pageSize < unassignedVariants.total 
                                    : assignedPage * pageSize < assignedVariants.total
                                }
                                onNext={() => handlePaginationChange(selectedTab === 0 ? unassignedPage + 1 : assignedPage + 1)}
                            />
                          </>
                        )
                        }
                        </Tabs>
                    </Card>
                </Layout.Section>
                <Layout.Section>
                    <Card>
                        <Text variant="headingMd" as="h2">Complementary Products Statistics</Text>
                        <Text variant="bodyMd" as="p">Assigned: {counts.assigned}</Text>
                        <Text variant="bodyMd" as="p">Unassigned: {counts.unassigned}</Text>
                        <Text variant="bodyMd" as="p">Total: {counts.total}</Text>
                    </Card>
                </Layout.Section>
            </Layout>

            <Modal
                open={showResetDialog}
                onClose={() => setShowResetDialog(false)}
                title="Reset Complementary Products"
                primaryAction={{
                    content: 'Yes, Reset',
                    onAction: handleResetConfirm,
                    tone: 'critical',
                }}
                secondaryActions={[
                    {
                        content: 'Cancel',
                        onAction: () => setShowResetDialog(false),
                    },
                ]}
            >
                <Modal.Section>
                    <Text as="p">
                        Are you sure you want to reset the complementary products list? This action cannot be undone.
                    </Text>
                </Modal.Section>
            </Modal>
        </Page>        
    );
}

export default UpsellComplementaryProducts;