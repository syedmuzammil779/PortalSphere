import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, Link, useLoaderData, useSearchParams, useSubmit } from "@remix-run/react";
import { Button, Card, IndexTable, Layout, Page, TextField, useIndexResourceState, Pagination, Divider, Spinner } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { useState, useCallback, useEffect } from "react";
import { JourneyBreadcrumb } from "~/components/JourneyBreadcrumb";
import { useNavigation } from "@remix-run/react";
import { PageLoadSpinner } from "~/components/PageLoadSpinner";
import PageHeader from "~/components/PageHeader";
import prisma from "~/db.server";

export const loader: LoaderFunction = async ({ request }) => {
    const { admin } = await authenticate.admin(request);
    const url = new URL(request.url);
    const searchTerm = url.searchParams.get('searchTerm') || '';
    const cursor = url.searchParams.get('cursor') || null;
    const pageSize = 20; // Adjust as needed

    // Query to check if the store is on Shopify Plus
    const shopQuery = `
    query {
        shop {
            id
            name
            plan {
                shopifyPlus
            }
        }
    }`;

    let isShopifyPlus = false;

    try {
        const shopResponse = await admin.graphql(shopQuery);
        const shopData = await shopResponse.json();
        isShopifyPlus = Boolean(shopData.data.shop.plan.shopifyPlus);
    } catch (error) {
        console.error('Error fetching shop data:', error);
    }

    const query = isShopifyPlus ? `
        query getCustomers($query: String!, $first: Int!, $after: String) {
            customers(query: $query, first: $first, after: $after) {
                edges {
                    node {
                        id
                        displayName
                        companyContactProfiles {
                            company {
                                name
                            }
                        }
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
        }`: `
        query getCustomers($query: String!, $first: Int!, $after: String) {
            customers(query: $query, first: $first, after: $after) {
                edges {
                    node {
                        id
                        displayName
                        email
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

    const variables = {
        query: searchTerm 
            ? `${searchTerm}* -${process.env.B2B_PREFIX}*`
            : `-${process.env.B2B_PREFIX}*`,
        first: pageSize,
        after: cursor,
    };

    try {
        const response = await admin.graphql(query, { variables });
        const responseJson = await response.json();

        if (responseJson.data && responseJson.data.customers) {
            const { edges, pageInfo } = responseJson.data.customers;
            const customers = edges.map((edge: any) => {
                let company = "";
                if (isShopifyPlus && edge.node.companyContactProfiles && Array.isArray(edge.node.companyContactProfiles) && edge.node.companyContactProfiles.length > 0) {
                    company = edge.node.companyContactProfiles.map(({company}: {company: {name: string}}) => company.name).join(', ');
                }

                return ({
                    id: edge.node.id,
                    display_name: edge.node.displayName,
                    email: edge.node.email,
                    company
                })
            });

            return { customers, pageInfo };
        }

        return null;
    } catch(err) {
        console.error(err);
        const redirectPage = process.env.ERROR_REDIRECT_PAGE || '/app';
        return redirect(redirectPage);
    }
};

export const action: ActionFunction = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const { shop } = session;

    const formData = await request.formData();
    const customerIds = (formData.get('ids') as string).split(",");
    const groupName = (formData.get('groupName') as string)
    const groupId = (formData.get('groupId') as string)
    const groupTag = (formData.get('groupTag') as string)

    try {
        if(customerIds.length <= 0){
            return redirect("/app/customergroups");
        }

        try {
            for (const id of customerIds) {
                // Query to get existing customer data
                const getCustomerQuery = `
                    query getCustomer($id: ID!) {
                        customer(id: $id) {
                            id
                            displayName
                            tags
                            metafields(first: 1, namespace: "customer_tag") {
                                edges {
                                    node {
                                        id
                                        value
                                    }
                                }
                            }
                        }
                    }
                `;
        
                const getCustomerVariables = { id };
                const customerResponse = await admin.graphql(getCustomerQuery, { variables: getCustomerVariables });
                const customerData = await customerResponse.json();
                const existingTags = customerData.data.customer.tags;
                const updatedTags = [...new Set([...existingTags, groupTag])];

                // Mutation to update customer
                const updateCustomerMutation = `
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
                    }
                `;

                const updateCustomerVariables = {
                    input: {
                        id,
                        tags: updatedTags,
                        taxExempt: true,
                        metafields: [{
                            namespace: "customer_tag",
                            key: "group_tag",
                            value: groupTag,
                            type: "single_line_text_field",
                        }]
                    }
                };

                const updateResponse = await admin.graphql(updateCustomerMutation, { variables: updateCustomerVariables });
                const updateData = await updateResponse.json();

                if (updateData.data.customerUpdate.userErrors.length > 0) {
                    throw new Error(updateData.data.customerUpdate.userErrors[0].message);
                }
            }
        } catch (error) {
            console.error('Error updating customers:', error);
            throw error; // Re-throw the error to be handled by the caller
        }

        return redirect(`/app/segment/?groupId=${groupId}&groupName=${groupName}&groupTag=${groupTag}`);
    } catch(err) {
        console.error(err);
        const redirectPage = process.env.ERROR_REDIRECT_PAGE || '/app';
        return redirect(redirectPage);
    }
}

const AddMembers = () => {
    const submit = useSubmit();
    const [searchParams, setSearchParams] = useSearchParams();
    const groupName = searchParams.get('groupName')
    const groupId = searchParams.get('groupId')
    const groupTag = searchParams.get('groupTag')
    const isNewGroup = searchParams.get('isNewGroup');
    const { customers, pageInfo }: any = useLoaderData();
    const navigation = useNavigation();
    const isPaginating = navigation.state === "loading";
    const isLoading = navigation.state === "loading";

    const [searchValue, setSearchValue] = useState(searchParams.get('searchTerm') || '');

    const resourceName = {
        singular: 'customer',
        plural: 'customers',
    };

    const { selectedResources, allResourcesSelected, handleSelectionChange } = useIndexResourceState(customers);

    const handleAddMembers = () => submit({}, { replace: true, method: 'POST' });

    const handleSearchChange = useCallback((value: string) => {
        setSearchValue(value);
    }, []);

    const handleSearchSubmit = useCallback(() => {
        sessionStorage.removeItem('cursorHistory'); // Clear cursor history on new search
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.set('searchTerm', searchValue);
        newSearchParams.delete('cursor'); // Remove cursor to start from first page
        setSearchParams(newSearchParams);
    }, [searchValue, searchParams, setSearchParams]);

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

    // Clear cursor history when leaving page or when search term changes
    useEffect(() => {
        return () => {
            sessionStorage.removeItem('cursorHistory');
        };
    }, [location.pathname, searchValue]);

    const handlePaginationChange = (direction: 'prev' | 'next') => {
        const newSearchParams = new URLSearchParams(searchParams);
        const cursorHistory = JSON.parse(sessionStorage.getItem('cursorHistory') || '[]');
        
        if (direction === 'next' && pageInfo.hasNextPage) {
            newSearchParams.set('cursor', pageInfo.endCursor);
        } else if (direction === 'prev' && pageInfo.hasPreviousPage) {
            const currentCursor = searchParams.get('cursor');
            const currentIndex = cursorHistory.indexOf(currentCursor);
            
            if (currentIndex > 0) {
                newSearchParams.set('cursor', cursorHistory[currentIndex - 1]);
            } else {
                newSearchParams.delete('cursor');
            }
            
            if (currentIndex !== -1) {
                cursorHistory.splice(currentIndex);
                sessionStorage.setItem('cursorHistory', JSON.stringify(cursorHistory));
            }
        }
        
        // Preserve other query parameters
        newSearchParams.set('groupId', groupId || '');
        newSearchParams.set('groupName', groupName || '');
        newSearchParams.set('groupTag', groupTag || '');
        newSearchParams.set('searchTerm', searchValue);
        
        setSearchParams(newSearchParams);
    };

    const rowMarkup = customers.map((customer: any, index: number) => (
        <IndexTable.Row 
            id={customer.id} 
            key={customer.id} 
            selected={selectedResources.includes(customer.id)} 
            position={index}
        >
            <IndexTable.Cell>
                {customer.display_name} 
            </IndexTable.Cell>
            <IndexTable.Cell>
                {customer.company} 
            </IndexTable.Cell>
        </IndexTable.Row>
    ));

    return (
        <>
            {isLoading ? (
                <PageLoadSpinner />
            ) : (
                <>
                    {(isNewGroup && isNewGroup === "true") && <JourneyBreadcrumb currentStep={3} />}
                    <Page fullWidth>
                        <Layout>
                            <Layout.Section>
                                <PageHeader 
                                    title="Assign Buyers" 
                                    subtitle={groupName || ""}
                                />
                            </Layout.Section>
                            <Layout.Section>
                                <div style={{display: "flex", justifyContent: "flex-end", alignContent: "flex-end", gap: "10px"}}>
                                    <Link to={{
                                            pathname:"/app/segment/",
                                            search: `?groupId=${groupId}&groupName=${groupName}&groupTag=${groupTag}`
                                        }}>
                                        <Button>{(isNewGroup && isNewGroup === "true")? "Skip and Complete" : "Back"}</Button>
                                    </Link>
                                    <Form onSubmit={handleAddMembers} method="post">
                                    <div hidden>
                                        <TextField
                                            id="groupName"
                                            name="groupName"
                                            label="Group Name"
                                            autoComplete="off"
                                            value={groupName as string}
                                        />
                                        <TextField
                                            id="groupId"
                                            name="groupId"
                                            label="Group Name"
                                            autoComplete="off"
                                            value={groupId as string}
                                        />
                                        <TextField
                                            id="groupTag"
                                            name="groupTag"
                                            label="Group Tag"
                                            autoComplete="off"
                                            value={groupTag as string}
                                        />
                                        <TextField
                                            id="ids"
                                            name="ids"
                                            label="Customer Ids"
                                            autoComplete="off"
                                            value={selectedResources.toString()}
                                        />
                                    </div>
                                        <Button variant="primary" disabled={!Boolean(selectedResources.length)} submit>{(isNewGroup && isNewGroup === "true") ? "Save and Complete" : "Assign Buyers"}</Button>
                                    </Form>

                                </div>
                            </Layout.Section>
                            <Layout.Section>
                                <Card>
                                    <TextField
                                        label="Search customers"
                                        value={searchValue}
                                        onChange={handleSearchChange}
                                        autoComplete="off"
                                        connectedRight={<Button onClick={handleSearchSubmit}>Search</Button>}
                                    />
                                </Card>
                            </Layout.Section>
                            <Layout.Section>
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
                                                itemCount={customers.length}
                                                selectedItemsCount={allResourcesSelected ? 'All' : selectedResources.length}
                                                onSelectionChange={handleSelectionChange}
                                                headings={[{ title: 'Customers' }, { title: 'Company' }]}
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
                            </Layout.Section>
                        </Layout>
                    </Page>
                </>
            )}
        </>
    );           
}

export default AddMembers
