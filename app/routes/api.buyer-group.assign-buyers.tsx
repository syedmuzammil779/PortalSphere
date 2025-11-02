import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

export async function action({ request }: ActionFunctionArgs) {
    if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, { status: 405 });
    }

    const { admin, session } = await authenticate.admin(request);
    const { shop } = session;
    const reqBody = await request.json();

    try {

        const {customerIds, groupTag, groupId} = reqBody;

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

        for (const customerId of customerIds) {
          try {
            //console.log("Processing customer:", customerId);

            // Get customer data
            const responseData = await admin.graphql(
              `
              query getCustomer($id: ID!) {
                customer(id: $id) {
                  displayName
                  tags
                  metafield(namespace: "customer_tag", key: "group_tag") {
                    id
                    value
                  }
                }
              }
              `,
              {
                variables: { id: customerId },
              },
            );

            if (!responseData.ok) {
              console.error("Failed to get customer data for:", customerId);
              continue;
            }

            const { data: customerData } = await responseData.json();
            //console.log("Customer data:", customerData);

            if (!customerData || !customerData.customer) {
              console.error("No customer data found for:", customerId);
              continue;
            }

            // Add the tag if it's not already present
            const existingTags = customerData.customer.tags || [];
            const updatedTags = [...new Set([...existingTags, groupTag])];
            const updateTagsResponse = await admin.graphql(
              UPDATE_CUSTOMER_TAGS_MUTATION,
              {
                variables: {
                  input: {
                    id: customerId,
                    tags: updatedTags,
                    taxExempt: true,
                    metafields: [
                      {
                        namespace: "customer_tag",
                        key: "group_tag",
                        value: groupTag,
                        type: "single_line_text_field",
                      },
                    ],
                  },
                },
              },
            );

            if (!updateTagsResponse.ok) {
              console.error("Failed to update customer tags for:", customerId);
              const errorResponse = await updateTagsResponse.json();
              console.error("Update error response:", errorResponse);
              continue;
            }

            const updateResponse = await updateTagsResponse.json();
            if ((updateResponse as any).errors) {
              continue;
            }

            if (
              (updateResponse as any).data &&
              (updateResponse as any).data.customerUpdate &&
              (updateResponse as any).data.customerUpdate.userErrors &&
              (updateResponse as any).data.customerUpdate.userErrors.length > 0
            ) {
              console.error(
                "User errors in update response:",
                (updateResponse as any).data.customerUpdate.userErrors,
              );
              continue;
            }

            //console.log("Successfully updated customer tags for:", customerId);

            // Update database
            try {
              const dbRecord = await prisma.shopSegmentsData.findFirst({
                where: { shop: shop, segmentId: groupId },
              });

              if (dbRecord != null) {
                //console.log("Found DB record:", dbRecord);

                // Update member count
                if (dbRecord.memberCount != null) {
                  await prisma.shopSegmentsData.update({
                    where: { id: dbRecord.id },
                    data: { memberCount: dbRecord.memberCount + 1 },
                  });
                  //console.log("Updated member count");
                }

                // First, clean up any existing duplicates for this customer
                const numericId = customerId.split("/").pop();
                const customerGid = `gid://shopify/Customer/${numericId}`;
                const segmentMemberGid = `gid://shopify/CustomerSegmentMember/${numericId}`;

                // Find all existing records for this customer (any format)
                const existingBuyers = await prisma.shopSegmentsBuyers.findMany(
                  {
                    where: {
                      segmentId: dbRecord.id,
                      OR: [
                        { customerId: customerGid },
                        { customerId: segmentMemberGid },
                        { customerId: customerId },
                      ],
                    },
                  },
                );

                if (existingBuyers.length > 0) {

                  // If there are multiple records, keep only one and delete the rest
                  if (existingBuyers.length > 1) {
                    const [keepRecord, ...duplicates] = existingBuyers;
                    await prisma.shopSegmentsBuyers.deleteMany({
                      where: {
                        id: { in: duplicates.map((d) => d.id) },
                      },
                    });
                  }
                } else {
                  try {
                    const newBuyer = await prisma.shopSegmentsBuyers.create({
                      data: {
                        segmentId: dbRecord.id,
                        customerId: customerGid, // Always use Customer GID format for consistency
                        customerName: customerData.customer.displayName,
                      },
                    });
                  } catch (createError: any) {
                    if (createError.code === "P2002") {
                    } else {
                      throw createError;
                    }
                  }
                }
              } else {
                console.error("No DB record found for group:", groupId);
              }
            } catch (dbError) {
              console.error(
                "Database error for customer:",
                customerId,
                dbError,
              );
            }
          } catch (customerError) {
            console.error(
              "Error processing customer:",
              customerId,
              customerError,
            );
          }
        }

        return json({
          success: true,
          action: "assign-buyers",
          message: "Buyers assigned successfully",
        });
    } catch (assignError: any) {
        console.error("Error in assign-buyers action:", assignError);
        const errorMessage = assignError?.message || "Unknown error";
        return json(
          { error: `Failed to assign buyers: ${errorMessage}` },
          { status: 500 },
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