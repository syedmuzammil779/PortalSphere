import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { ensureGidFormat } from "~/services/ProductVolumePriceConfig.server";
import { CUSTOMER_TAG, GROUP_TAG } from "~/services/CustomerGroups.server";

export async function action({ request }: ActionFunctionArgs) {
    if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, { status: 405 });
    }

    const { admin, session } = await authenticate.admin(request);
    const { shop } = session;
    const reqBody = await request.json();

    try {
        const { tagToRemove, customersList, groupId } = reqBody;

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
        for (let customerId of customersList) {
          
            try {
                customerId = ensureGidFormat(customerId, 'Customer');
                console.log("Constructed customer ID:", customerId);

                // Get customer data
                const responseData = await admin.graphql(`query getCustomer($id: ID!) {
                    customer(id: $id) {
                        tags
                        metafield(namespace: "${CUSTOMER_TAG}", key: "${GROUP_TAG}") {
                            id
                            value
                        }
                    }
                }`, {
                    variables: { id: customerId }
                });

                if (!responseData.ok) {
                    console.error("Failed to get customer data for:", customerId);
                    continue;
                }

                const { data: customerData } = await responseData.json();
                
                if (!customerData || !customerData.customer) {
                    console.error("No customer data found for:", customerId);
                    continue;
                }

                // Remove the specific tag
                const updatedTags = customerData.customer.tags.filter(
                    (tag: string) => tag !== tagToRemove
                );

                // Update the customer with the new tag string
                const updateTagsResponse = await admin.graphql(UPDATE_CUSTOMER_TAGS_MUTATION, {
                    variables: {
                        input: {
                            id: customerId,
                            tags: updatedTags,
                            taxExempt: false
                        }
                    }
                });

                if (!updateTagsResponse.ok) {
                    continue;
                }

                const updateResponse = await updateTagsResponse.json();
                
                // Check for GraphQL errors in the response
                if ((updateResponse as any).errors) {
                    continue;
                }

                if (
                    (updateResponse as any).data &&
                    (updateResponse as any).data.customerUpdate &&
                    (updateResponse as any).data.customerUpdate.userErrors &&
                    (updateResponse as any).data.customerUpdate.userErrors.length > 0
                ) {
                    continue;
                }

                // Delete metafield if it exists
                if (customerData.customer.metafield) {
                    try {
                        const deleteMetafieldsResponse = await admin.graphql(DELETE_METAFIELDS_MUTATION, {
                            variables: {
                                metafields: {
                                    ownerId: customerId,
                                    namespace: CUSTOMER_TAG,
                                    key: GROUP_TAG,
                                }
                            }
                        });

                        if (!deleteMetafieldsResponse.ok) {
                            console.error("Failed to delete metafields for:", customerId);
                        }
                    } catch (metafieldError) {
                        console.error(
                            "Error deleting metafields for:",
                            customerId,
                            metafieldError,
                        );
                    }
                }

                // Update database - use the same approach as segment.tsx
                try {
                    const dbRecord = await prisma.shopSegmentsData.findFirst({
                        where: { shop: shop, segmentId: groupId },
                    });

                    if (dbRecord != null) {
                        if (dbRecord.memberCount != null && dbRecord.memberCount > 0) {
                            await prisma.shopSegmentsData.update({
                                where: { id: dbRecord.id },
                                data: { memberCount: dbRecord.memberCount - 1 },
                            });
                        }

                        //Also delete from buyers table - handle both Customer and CustomerSegmentMember IDs
                        // First try with Customer ID
                        let deleteCondition = {
                            where: {
                                segmentId: dbRecord.id,
                                customerId: customerId
                            }
                        };

                        // Check how many records will be deleted with Customer ID
                        let recordsToDelete = await prisma.shopSegmentsBuyers.findMany(deleteCondition);
                    
                        // If no records found with Customer ID, try with CustomerSegmentMember ID
                        if (recordsToDelete.length === 0) {
                            deleteCondition = {
                                where: {
                                    segmentId: dbRecord.id,
                                    customerId: customerId, // Try CustomerSegmentMember ID
                                },
                            };

                            recordsToDelete = await prisma.shopSegmentsBuyers.findMany(deleteCondition);
                        }

                        if (recordsToDelete.length > 0) {
                            await prisma.shopSegmentsBuyers.deleteMany(deleteCondition);
                        }

                    } else {
                        console.error("No DB record found for group:", groupId);
                    }
                } catch (dbError) {
                    console.error(
                        "Database error for customer:",
                        customerId,
                        dbError
                    );
                }
                
            } catch (customerError) {
                console.error(
                    "Error processing customer segment member:",
                    customerId,
                    customerError,
                );
            }
        }

        return json({
            success: true,
            action: "remove-buyers",
            message: "Buyers removed successfully",
        }, {
            status: 200
        });
    } catch (removeError: any) {
        const errorMessage = removeError?.message || "Unknown error";
        return json(
            { error: `Failed to remove buyers: ${errorMessage}` },
            { status: 500 }
        );
    }
    
}

export async function loader() {
    return json({
        message: "This is a POST endpoint. Send POST requests with JSON data.",
        endpoint: "/api/data",
        method: "POST",
    });
}