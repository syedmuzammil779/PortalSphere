import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { handleCors } from "~/utils/cors.server";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import { getShopId } from "~/services/Settings.server";
import { CUSTOMER_TAG, findCustomersWithTags, GROUP_TAG } from "~/services/CustomerGroups.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const corsResponse = handleCors(request);

    if (corsResponse instanceof Response) {
        return corsResponse;
    }

    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsResponse });
    }

    let returnVal = null;
    const { admin, session } = await authenticate.admin(request);
    const { shop } = session;
    const dbRecord = await prisma.session.findFirst({where: { shop: shop }});
    const shopId = await getShopId(admin, shop);
    
    try {
        const url = new URL(request.url);
        const segmentId = url.searchParams.get('segmentId') || null;
        const tag = url.searchParams.get('tag') || null;
        
        if(!segmentId || !tag) {
            return json({
                status: false, 
                message: 'Invalid segment id / tag value detected'
            });
        }

        const segmentRecord = await prisma.shopSegmentsData.findFirst({
            where: {
                shop: shop,
                segmentId: segmentId
            }
        });

        if(!segmentRecord) {
            throw new Error('record not found');
        }

        if(!segmentRecord.tagID) {
            throw new Error('tag id not found!');
        }

        //Now find customers by tags
        let customersHavingThisTag = await findCustomersWithTags(admin, tag);

        if(customersHavingThisTag != null && customersHavingThisTag.length > 0) {
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
                }
            `;
            for(var i in customersHavingThisTag) {
                let customerToTag = customersHavingThisTag[i];
                const existingTags = customerToTag.tags || [];
                const updatedTags = [...new Set([...existingTags, segmentRecord.tagID])];
                // Update the customer with the new tag string
                const updateTagsResponse = await admin.graphql(UPDATE_CUSTOMER_TAGS_MUTATION, {
                    variables: {
                        input: {
                            id: customerToTag.id,
                            tags: updatedTags,
                            taxExempt: true,
                            metafields: [{
                                namespace: CUSTOMER_TAG,
                                key: GROUP_TAG,
                                value: tag,
                                type: "single_line_text_field",
                            }]
                        }
                    }
                });

                const updateResponse = await updateTagsResponse.json();
            }
        }

        returnVal = {
            status: true,
            message: `Assigned ${customersHavingThisTag.length} customers with tag ${segmentRecord.tagID}`
        }

    } catch(err: any) {
        console.error(err.message);
        returnVal = {status: false, message: 'error in delete buyer groups api', error: err.message, data: null};
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