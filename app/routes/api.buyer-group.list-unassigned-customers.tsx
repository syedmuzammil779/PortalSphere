import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { handleCors } from "~/utils/cors.server";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const corsResponse = handleCors(request);

    if (corsResponse instanceof Response) {
        return corsResponse;
    }

    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsResponse });
    }

    let returnVal = null;
    const { admin } = await authenticate.admin(request);
    try {
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
                        company: company
                    })
                });

                returnVal = {status: true, data: { customers: customers, pageInfo: pageInfo }, message: '', error: null};
            }

        } catch(err: any) {
            console.error(err);
            returnVal = {status: false, message: 'error in list unassigned members api', error: err.message, data: null};
        }

    } catch(err: any) {
        console.error(err.message);
        returnVal = {status: false, message: 'error in list unassigned members api', error: err.message, data: null};
    }

    return json( returnVal );
}

// Add action for handling non-GET requests
export async function action({ request }: LoaderFunctionArgs) {
    const corsResponse = handleCors(request);
    
    if (corsResponse instanceof Response) {
        return corsResponse;
    }

    if (request.method === "OPTIONS") {
        return new Response(null, { 
            headers: corsResponse 
        });
    }

    return json({ 
      error: "Method not allowed" 
    }, { 
      status: 405,
      headers: corsResponse
    });
}