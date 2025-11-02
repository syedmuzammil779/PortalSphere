import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { json, Link, useActionData, useLoaderData, useLocation, useNavigation, useSearchParams, useSubmit } from "@remix-run/react";
import { Modal, TitleBar } from "@shopify/app-bridge-react";
import { Banner, Button, Card, Icon, IndexTable, Layout, List, Page, Spinner, Text, useIndexResourceState, Pagination, Divider, InlineGrid, InlineStack, BlockStack, Tooltip } from '@shopify/polaris';
import { authenticate } from "~/shopify.server";
import { DeleteIcon, PersonAddIcon, EditIcon, SettingsIcon, InfoIcon, ExitIcon } from '@shopify/polaris-icons';
import { useEffect, useState } from "react";
import { deleteSegment, deleteShopDiscountMetafield, getShopMetafield, getShopPaymentMethodsMetafield, getShopQuantityConfigMetafield, groupHasIncludedProducts, IQuantityConfig, removeCustomerTags } from "~/services/CustomerGroups.server";
import { getShopId } from "~/services/Settings.server";
import PageHeader from "~/components/PageHeader";
import prisma from "~/db.server";
import { ensureGidFormat } from "~/services/ProductVolumePriceConfig.server";

export const loader: LoaderFunction = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    let { searchParams } = new URL(request.url);
    
    const groupId = searchParams.get('groupId');
    const groupTag = String(searchParams.get('groupTag'));
    const cursor = searchParams.get('cursor');
    const metaNamespace = "b2bplus";
    const { shop } = session;
    const shopId = await getShopId(admin, shop);
    const pageSize = 20;

    const segmentsDBData = await prisma.shopSegmentsData.findFirst({
        where: {
            shop: shop,
            segmentId: groupId as string
        }
    })

    var memberBuyers = null;
    if(segmentsDBData) {
        memberBuyers = await prisma.shopSegmentsBuyers.findMany({
            where: {
                segmentId: segmentsDBData.id
            },
            orderBy: {
                customerName: 'asc'
            }
        })

        if(memberBuyers) {
            memberBuyers = memberBuyers.map((row) => ({
                id: row.customerId,    
                displayName: row.customerName
            }));
        }
    }
    
    const query = `
    query getCustomerSegmentMembers($groupId: ID!, $first: Int, $after: String) {
        customerSegmentMembers(
            first: $first,
            segmentId: $groupId,
            after: $after
        ) {
            edges {
                node {
                    id
                    displayName
                }
                cursor
            }
            pageInfo {
                hasNextPage
                hasPreviousPage
                startCursor
                endCursor
            }
        }
    }`;

    try {

        const [
            groupInfo,
            paymentMethodsMetafield,
            quantityConfigMetafield
        ] = await Promise.all([
            getShopMetafield(admin, groupTag, metaNamespace),
            getShopPaymentMethodsMetafield(admin, metaNamespace, "PaymentMethodOptions"),
            getShopQuantityConfigMetafield(admin, shopId, groupTag)
        ]);

        const paymentMethodsData = paymentMethodsMetafield 
            ? JSON.parse(paymentMethodsMetafield.value).find((method: any) => method.tag.toString() === groupTag)
            : {tag: groupTag, selectedPayments:["CreditCard"]};

        const hasNetTerms = (paymentMethodsData.selectedPayments.find((method: any) => method === "NetTerms"))?"Yes":"No";
        const defaultDiscount = (JSON.parse(groupInfo?.value || "{}")).discount;

        const response = await admin.graphql(query, { 
            variables: { 
                groupId, 
                first: pageSize, 
                after: cursor 
            } 
        });
        
        const responseJson = await response.json();
        const { 
            data: { 
                customerSegmentMembers: { edges, pageInfo } 
            } 
        } = responseJson;

        try {
            if(segmentsDBData != null && edges && edges.length > 0) {
                for(var i in edges) {
                    let node = edges[i].node;
                    let customerName = node.displayName;
                    let customerId = node.id.replace('gid://shopify/Customer/', '');
                    await prisma.shopSegmentsBuyers.upsert({
                        where: {
                            segmentId_customerId: {
                                segmentId: segmentsDBData.id,
                                customerId: customerId
                            }
                        },
                        update: {
                            segmentId: segmentsDBData.id,
                            customerId: customerId,
                            customerName: customerName 
                        },
                        create: {
                            segmentId: segmentsDBData.id,
                            customerId: customerId,
                            customerName: customerName
                        }
                    })
                }
            }    
        } catch (error: any) {
            console.log(error.message);
        }

        return { 
            members: edges.map((edge: any) => edge.node),
            defaultDiscount: defaultDiscount || null,
            hasNetTerms,
            quantityConfigMetafield,
            pageInfo,
        };

    } catch (err) {
        console.error("Error fetching customer segment members:", err);
        return { 
            members: [], 
            defaultDiscount: null,
            hasNetTerms: "No",
            quantityConfigMetafield: null,
            pageInfo: { 
                hasNextPage: false, 
                hasPreviousPage: false 
            }
        };
    }
};

export const action: ActionFunction = async ({ request,  }) => {

    const { redirect, admin, session } = await authenticate.admin(request);
    const { shop } = session;
    const shopId = await getShopId(admin, shop);
    const formData = await request.formData();
    const action = String(formData.get("action"));
    const groupId = String(formData.get("groupId"));
    if(action && action === "delete-member"){
        const segmentMemberIds = JSON.parse(String(formData.get("customerList")));
        const tagToRemove = String(formData.get("tag"));

        const UPDATE_CUSTOMER_TAGS_MUTATION = `
        mutation customerUpdate($input: CustomerInput!) {
            customerUpdate(input: $input) {
                customer {
                    id
                    tags
                    taxExempt
                }
                userErrors {
                    field
                    message
                }
            }
        }`;

        try {
            // Ensure tagToRemove is a string
            if (typeof tagToRemove !== 'string') {
                throw new Error('Invalid input: tag must be a string');
            }

            // Ensure customerIds is an array of strings
            if (!Array.isArray(segmentMemberIds) || !segmentMemberIds.every(id => typeof id === 'string')) {
                throw new Error('Invalid input: customerList must be an array of strings');
            }

        // Remove the specific tag from each customer
        const shopifyCustomerPrefix = `gid://shopify/Customer/`;
        await Promise.all(segmentMemberIds.map(async (segmentMemberId) => {
            // First, fetch the current tags for the customer
            const numericId = segmentMemberId.split("/");
            const customerId = `${shopifyCustomerPrefix}${numericId[numericId.length-1]}`;
            const responseData = await admin.graphql(`
                query getCustomer($id: ID!) {
                    customer(id: $id) {
                        tags
                        metafield(namespace: "customer_tag", key: "group_tag") {
                            id
                            value
                        }
                    }
                }
                `, {
                    variables: { id: customerId },
                });

                if(responseData.ok){
                    const { data: customerData } = await responseData.json();
                    // Remove the specific tag
                    const updatedTags = customerData.customer.tags.filter((tag: string) => tag !== tagToRemove);
                    // Update the customer with the new tag string
                    const updateTagsResponse = await admin.graphql(UPDATE_CUSTOMER_TAGS_MUTATION, {
                        variables: {
                            input: {
                                id: customerId,
                                tags: updatedTags,
                                taxExempt: false,
                            },
                        },
                    });

                    // Delete metafield if it exists
                    if (customerData.customer.metafield) {
                        const DELETE_METAFIELDS_MUTATION = `
                            mutation MetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
                                metafieldsDelete(metafields: $metafields) {
                                    deletedMetafields {
                                        key
                                    }
                                    userErrors {
                                        field
                                        message
                                    }
                                }
                            }
                        `;
                        
                        const deleteMetafieldsResponse = await admin.graphql(DELETE_METAFIELDS_MUTATION, {
                            variables: {
                                "metafields": {
                                    "ownerId": customerId,
                                    "namespace": "customer_tag",
                                    "key": "group_tag"
                                }
                            },
                        });
                    
                        if (!deleteMetafieldsResponse.ok) {
                            console.error('Failed to delete metafields');
                        }
                    }

                    const response = updateTagsResponse;
                    if(response.ok){
                        //Decrement the memberCount in the table shopSegmentsData
                        const dbRecord = await prisma.shopSegmentsData.findFirst({
                            where: {shop: shop, segmentId: groupId}
                        });

                        if(dbRecord != null) {
                            if(dbRecord.memberCount != null && dbRecord.memberCount > 0) {
                                await prisma.shopSegmentsData.update({ where: { id: dbRecord.id }, data: { memberCount: dbRecord.memberCount - 1 }})
                            }

                            //Also delete from buyers table
                            const deleteCondition = {
                                where: {
                                    segmentId: dbRecord.id,
                                    customerId: ensureGidFormat(customerId.replace('gid://shopify/Customer/', ''), 'CustomerSegmentMember')
                                }
                            }
                            await prisma.shopSegmentsBuyers.deleteMany(deleteCondition)
                        }
                        return redirect(`/app/segment?segmentId=${groupId}`);
                    }else{
                        throw new Error(`Error updating customer tags`);
                    }
                }
                return null;
            }));
    
        } catch (error) {
            console.error('Error removing tag:', error);
            return json({ error: 'Failed to remove tag' }, { status: 500 });
        }
    } else if(action && action === "delete-group"){
        //const b2bTag = String(process.env.B2B_PREFIX);
        if (!groupId) {
            return json({ status: "error", message: `Missing groupId, cannot delete group` });
        }

        try {
            const groupInfo = await deriveTagFromSegment(admin, groupId);
            if(groupInfo && Object.hasOwn(groupInfo, 'tag')){
                // check if group has associated products
                const hasIncludedProducts = await groupHasIncludedProducts(admin, groupInfo?.tag);
                //const groupName = groupInfo?.tag.replace(new RegExp(b2bTag, 'g'), '');

                if(hasIncludedProducts){
                    return json({ 
                        status: "error", 
                        message: `Customer group ${groupInfo?.name } is associated to at least 1 product and cannot be deleted. Please unlink those products before deleting the group` 
                    });
                }
    
                // remove shop metafield
                await deleteShopDiscountMetafield(admin, shopId, groupInfo?.tag);
                //remove customer tags
                await removeCustomerTags(admin, groupInfo?.tag);
                //remove segment
                await deleteSegment(admin, groupInfo.id);
                //at the last, delete it from DB
                await prisma.shopSegmentsData.deleteMany({
                    where: {shop: shop, segmentId: groupId}
                });
                await prisma.shopSegmentsBuyers.deleteMany({
                    where: {
                        segmentId: null
                    }
                }) 

                //then delete it from volume pricing data
                const deleteCondition = {
                    where: {
                        shop: shop,
                        tag: groupInfo.tag
                    }
                }
                await prisma.volumePricingData.deleteMany(deleteCondition);
            }else{
                return json({ status: "error", message: "Group data not found." });
            }
    
            //return json({ status: "success", message: "Groups deleted, customer tags updated, and segments removed successfully" });
            return redirect("/app/customergroups");
        } catch (err) {
            console.error(err);
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred";
            return json({ status: "error", message: `Error deleting groups: ${errorMessage}` });
        }       
    }    

    return redirect(`/app/segment?segmentId=${groupId}`);
};

async function deriveTagFromSegment(admin: any, groupId: string): Promise<{tag: string, id: string, name: string} | null> {
    const query = `
        query getSegment($id: ID!) {
            segment(id: $id) {
                id
                name
                query
            }
        }
    `;
    
    const response = await admin.graphql(query, { variables: { id: groupId } });
    const dataJson = await response.json();
    
    if (!dataJson.data.segment) {
        console.error("Segment not found");
        return null;
    }

    const segment = dataJson.data.segment;
    const tag = segment.query.split(" ").slice(-1)[0].replaceAll(/'/g, "");
    
    return {tag, id: segment.id, name: segment.name};
}

interface LoaderData {
    members: any[];
    defaultDiscount: string | null;
    hasNetTerms: string;
    quantityConfigMetafield: IQuantityConfig | null;
    pageInfo: {
        hasNextPage: boolean;
        hasPreviousPage: boolean;
        startCursor: string;
        endCursor: string;
    };
    cursors: string[];
}

const Segment = () => {
    const { members, pageInfo, defaultDiscount, hasNetTerms, quantityConfigMetafield } = useLoaderData<LoaderData>();
    const [searchParams, setSearchParams] = useSearchParams();
    const groupId = searchParams.get('groupId');
    const groupName = searchParams.get('groupName');
    const groupTag = searchParams.get('groupTag');
    const submit = useSubmit();
    const navigation = useNavigation();
    const location = useLocation();
    const actionData = useActionData();
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const isPaginating = navigation.state === "loading";

    // Keep track of cursor history in session storage
    useEffect(() => {
        const currentCursor = searchParams.get('cursor');
        if (currentCursor) {
            const cursorHistory = JSON.parse(sessionStorage.getItem('cursorHistory') || '[]');
            if (!cursorHistory.includes(currentCursor)) {
                cursorHistory.push(currentCursor);
                sessionStorage.setItem('cursorHistory', JSON.stringify(cursorHistory));
            }
        }
    }, [searchParams]);

    // Clear cursor history when navigating away from the page
    useEffect(() => {
        return () => {
            sessionStorage.removeItem('cursorHistory');
        };
    }, [location.pathname]);

    // Clear cursor history when groupId changes
    useEffect(() => {
        if (groupId) {
            sessionStorage.removeItem('cursorHistory');
        }
    }, [groupId]);

    const handlePaginationChange = (direction: 'prev' | 'next') => {
        const newSearchParams = new URLSearchParams(searchParams);
        const cursorHistory = JSON.parse(sessionStorage.getItem('cursorHistory') || '[]');
        
        if (direction === 'next' && pageInfo.hasNextPage) {
            newSearchParams.set('cursor', pageInfo.endCursor);
        } else if (direction === 'prev' && pageInfo.hasPreviousPage) {
            // Get the previous cursor from history
            const currentCursor = searchParams.get('cursor');
            const currentIndex = cursorHistory.indexOf(currentCursor);
            
            if (currentIndex > 0) {
                // Set to previous cursor
                newSearchParams.set('cursor', cursorHistory[currentIndex - 1]);
            } else {
                // If we're at the first page, remove cursor
                newSearchParams.delete('cursor');
            }
            
            // Update cursor history
            if (currentIndex !== -1) {
                cursorHistory.splice(currentIndex);
                sessionStorage.setItem('cursorHistory', JSON.stringify(cursorHistory));
            }
        }
        
        // Preserve other query parameters
        newSearchParams.set('groupId', groupId || '');
        newSearchParams.set('groupName', groupName || '');
        newSearchParams.set('groupTag', groupTag || '');
        
        setSearchParams(newSearchParams);
    };

    useEffect(() => {
        if (navigation.state === "submitting") {
            setIsLoading(true);
        } else if (navigation.state === "idle") {
            setIsLoading(false);
            if (actionData && typeof actionData === 'object' && 'status' in actionData && 'message' in actionData) {
                if (actionData.status === "error") {
                    setErrorMessage(actionData.message as string);
                }
            }
        }
    }, [navigation.state, actionData]);

    const dismissError = () => {
        setErrorMessage(null);
    };

    const resourceName = {
        singular: 'Member',
        plural: 'Members',
    };

    const { selectedResources, allResourcesSelected, handleSelectionChange } = useIndexResourceState(members as unknown as { [key: string]: unknown }[]);

    const rowMarkup = members.length > 0 ? members.map((member: any, index: number) => (
        <IndexTable.Row 
            id={member.id} 
            key={member.id} 
            selected={selectedResources.includes(member.id)} 
            position={index}
        >
            <IndexTable.Cell>
                {member.displayName}
            </IndexTable.Cell>
        </IndexTable.Row>
    )) : "";

    const handleRemoveMember = () => {
        const formData = new FormData();
        formData.append('action', "delete-member");
        formData.append('groupId', String(groupId))
        formData.append('customerList', JSON.stringify(selectedResources));
        formData.append('tag', String(groupTag))
        submit(formData, { method: 'post' });
        shopify.modal.hide('delete-member-modal')
    }

    const handleDeleteGroups = () => {
        const formData = new FormData();
        formData.append('action', "delete-group");
        formData.append('groupId', String(groupId) );
        submit(formData, { method: 'post' });
        shopify.modal.hide('delete-group-modal')
    }

    return (
      <>
        <style>
            {`
                .Polaris-Icon {
                    margin: 0 !important;
                }
            `}
        </style>

        <Page fullWidth>
            {isLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
                    <Spinner accessibilityLabel="Loading" size="large" />
                </div>
            ) : (
                
                <Layout>
                    <Layout.Section>
                        <PageHeader 
                            title="Customer Group" 
                            subtitle={groupName || ""}
                        />
                    </Layout.Section>
                    <Layout.Section>
                        <div style={{display: "flex", justifyContent: "flex-end", alignContent: "flex-end", gap: "10px"}}>
                            <Link to="/app/customergroups/"><Button icon={ExitIcon}> Back </Button></Link>
                            <Button icon={DeleteIcon} onClick={() => shopify.modal.show('delete-group-modal')} tone="critical">Delete Group</Button>
                        </div>
                    </Layout.Section>
                    {errorMessage && (
                        <Layout.Section>
                            <Banner
                                title="Error"
                                tone="critical"
                                onDismiss={dismissError}
                            >
                                <p>{errorMessage}</p>
                            </Banner>
                        </Layout.Section>
                    )}
                    <Layout.Section>
                        <BlockStack gap="500">
                            <Card>
                                <BlockStack gap="300">   
                                    <InlineGrid columns="1fr auto">
                                        <div style={{ display: 'flex', alignItems: 'left', gap: '4px' }}>
                                            <Text as="span" variant="headingMd">Default Rules</Text>
                                            <Tooltip content={
                                                <div>
                                                    Group wholesale buyers into “Customer Groups” to streamline your B2B operations. Each Customer Group can have its own pricing, quantity rules, and payment options.
                                                </div>
                                                }>
                                                <Icon source={InfoIcon} tone="subdued" />
                                            </Tooltip>
                                        </div>
                                        <Link to={{
                                            pathname: "/app/updategroup/",
                                            search: `?groupName=${groupName}&groupId=${groupId}&groupTag=${groupTag}`
                                        }}><Button icon={EditIcon} variant="primary">Edit Default Rules</Button></Link>
                                    </InlineGrid>
                                    <InlineGrid columns="5">
                                        <Text as="span"><b>Discount:</b> {(defaultDiscount)?`${defaultDiscount}%`:"N/A"}</Text>
                                        <Text as="span"><b>Min. Quantity:</b> {(quantityConfigMetafield && Object.hasOwn(quantityConfigMetafield, "minimum"))?(quantityConfigMetafield.minimum):"N/A"}</Text>
                                        <Text as="span"><b>Max Quantity:</b> {(quantityConfigMetafield && Object.hasOwn(quantityConfigMetafield, "maximum"))?(quantityConfigMetafield.maximum):"N/A"}</Text>
                                        <Text as="span"><b>Increments:</b> {(quantityConfigMetafield && Object.hasOwn(quantityConfigMetafield, "increment"))?(quantityConfigMetafield.increment):"N/A"}</Text>
                                        <Text as="span"><b>NetTerms?:</b> {hasNetTerms}</Text>   
                                    </InlineGrid>
                                </BlockStack>
                            </Card>
                            <Card>
                                <BlockStack gap="200">   
                                    <InlineGrid columns="1fr auto" alignItems="center">
                                        <div style={{ display: 'flex', alignItems: 'left', gap: '4px' }}>
                                            <Text as="span" variant="headingMd">Adjust Individual SKUs: tiered discounts & rule overrides</Text>
                                            <Tooltip content={
                                                <div>
                                                    Create tiered price breaks to incentivize larger orders, and manually adjust pricing & quantity rules for specific products within a Customer Group.
                                                </div>
                                                }>
                                                <Icon source={InfoIcon} tone="subdued" />
                                            </Tooltip>
                                        </div>
                                        <Link to={{
                                            pathname: "/app/groupvolumepriceconfig/",
                                            search: `?groupName=${groupName}&groupId=${groupId}&groupTag=${groupTag}`
                                        }}><Button variant="primary" icon={SettingsIcon}>Tiered Discounts and Rule Overrides</Button></Link>
                                    </InlineGrid>
                                </BlockStack>
                            </Card><br/>
                            <BlockStack gap="300">
                                <Text as="h2" variant="headingLg">Buyers</Text>
                                <Text as="p" variant="headingMd">Add Buyers To This Customer Group: </Text>
                                <Link to={{
                                    pathname: "/app/addmembers/",
                                    search: `?groupName=${groupName}&groupId=${groupId}&groupTag=${groupTag}`
                                }}><Button variant="primary" icon={PersonAddIcon}>Assign Buyers</Button></Link>

                                <InlineGrid columns="1fr auto" alignItems="center">
                                    <Text as="p" variant="headingMd">Remove Buyers From This Customer Group: </Text>
                                    <Button disabled={selectedResources.length === 0} variant="primary" onClick={() => shopify.modal.show('delete-member-modal')}>Remove Buyers</Button>
                                </InlineGrid>
                            </BlockStack>
                            <Card>
                                {isPaginating ? (
                                    <div style={{ 
                                        display: 'flex', 
                                        justifyContent: 'center', 
                                        alignItems: 'center', 
                                        height: '200px'
                                    }}>
                                        <Spinner accessibilityLabel="Loading" size="large" />
                                    </div>
                                ) : (
                                    <>
                                        <IndexTable
                                            resourceName={resourceName}
                                            itemCount={members.length}
                                            selectedItemsCount={allResourcesSelected ? 'All' : selectedResources.length}
                                            onSelectionChange={handleSelectionChange}
                                            headings={[{ title: 'Buyers' }]}
                                        >
                                            {rowMarkup}
                                        </IndexTable>
                                        <Divider />
                                        <Pagination
                                            hasPrevious={pageInfo.hasPreviousPage}
                                            onPrevious={() => !isPaginating && handlePaginationChange('prev')}
                                            hasNext={pageInfo.hasNextPage}
                                            onNext={() => !isPaginating && handlePaginationChange('next')}

                                        />
                                    </>
                                )}
                            </Card>
                        </BlockStack>
                    </Layout.Section>
                </Layout>
            )}
            <Layout>
                <Layout.Section>
                    <Modal id="delete-member-modal">
                        <br/><center><Text as="h2" tone="caution">Are you sure you want to remove the selected Customers from this Group?</Text></center><br/>
                        <TitleBar title="REMOVE CUSTOMER" >
                        <button variant="primary" onClick={handleRemoveMember}>Yes</button>
                        <button onClick={() => shopify.modal.hide('delete-member-modal')}>Cancel</button>
                        </TitleBar>
                    </Modal>
                </Layout.Section>
            </Layout>
            <Layout>
                <Layout.Section>
                    <Modal id="delete-group-modal">
                    <br/><center><div>
                    <Text variant="headingMd" as="h3">Are you sure you want to delete the selected group/s?</Text>
                    <em><Text variant="headingSm" as="p" tone="critical">NOTE: This action is irreversible and will remove association of all members to this group.</Text></em></div></center><br/>
                            <TitleBar title="Delete Confirmation" >
                            <button variant="primary" onClick={handleDeleteGroups}>DELETE</button>
                            <button onClick={() => shopify.modal.hide('delete-group-modal')}>CANCEL</button>
                            </TitleBar>
                    </Modal>
                </Layout.Section>
            </Layout>    
        </Page>
      </>
    )
}

export default Segment
