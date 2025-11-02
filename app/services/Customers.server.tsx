import { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { CUSTOMER_TAG, GROUP_TAG } from "./CustomerGroups.server";
import { GraphqlClient } from "@shopify/shopify-api";
import prisma from "~/db.server";

export async function processAddCustomerToGroup(customer: any, shop: string, admin: GraphqlClient, method: string = "create") {
  // Mutation to update customer
  //We never actually receive any tags in this payload so we have to fetch the customer all over again.

  const getCustomerMutation = `query {
    customer(id: "${customer.admin_graphql_api_id}") {
      id
      tags
    }
  }`;

  const custResponse = await admin.request(getCustomerMutation);
  var custTags = custResponse.data.customer.tags;

  if(Array.isArray(custTags)) {
    custTags = custTags.join(',');
  }

  const updateCustomerMutation = `mutation customerUpdate($input: CustomerInput!) {
    customerUpdate(input: $input) {
      customer {
        id
        taxExempt
        tags
        metafield(namespace: "${CUSTOMER_TAG}", key: "${GROUP_TAG}") {
          id
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }`;

  try {
    const customerId = customer.admin_graphql_api_id;
    const tags: string[] = custTags?.split(',').map((tag: string) => tag.trim()) || [];
    const portalSphereTags: string[]= tags.filter((tag: string) => 
      tag.startsWith('PortalSphere_B2B_')
    );
    const nonPortalSphereTags: string[] = tags.filter((tag: string) => 
      !tag.startsWith('PortalSphere_B2B_')
    );

    let metafieldValue: string | null = null;
    let selectedTag: string | null = null;

    if (portalSphereTags.length === 0) {
      //No portalsphere tags are found here, so delete from database if there are some
      const segments = await prisma.shopSegmentsData.findMany({
        where: { shop: shop }
      })

      if(segments && segments.length > 0) {
        for (const seg of segments) {
          await prisma.shopSegmentsData.update({
            where: { id: seg.id },
            data: {
              buyers: {
                deleteMany: {
                  customerId: customer.admin_graphql_api_id
                }
              }
            }
          })
        }
      } 
      
      return false;
    }

    if (method === "update") {
      const metafieldsQuery = `query getCustomerMetafields($customerId: ID!) {
        customer(id: $customerId) {
          tags
          metafields(first: 1, namespace: "${CUSTOMER_TAG}") {
            edges {
              node {
                id namespace
                key value
              }
            }
          }
        }
      }`;

      const getMetafieldResponse = await admin.request(metafieldsQuery, { variables: { customerId } });
      metafieldValue = (
        getMetafieldResponse.data.customer.metafields.edges.length > 0 && 
        getMetafieldResponse.data.customer.metafields.edges[0].node.key === GROUP_TAG
      ) ? getMetafieldResponse.data.customer.metafields.edges[0].node.value : null;
    }

    selectedTag = (
      metafieldValue && 
      portalSphereTags.length > 1
    ) ? portalSphereTags.filter((tag: string) => tag !== metafieldValue)[0]:portalSphereTags[0];
  
    // If the selected tag is the same as the metafield value, we don't need to update the customer
    if(selectedTag === metafieldValue) {
      return false;
    }

    const updatedTags = [...nonPortalSphereTags, selectedTag.trim()].join(', ');

    const variables = {
      input: {
        id: customerId,
        ...(portalSphereTags.length > 1) && { tags: updatedTags },
        taxExempt: true,
        metafields: [{
          namespace: CUSTOMER_TAG,
          key: GROUP_TAG,
          value: selectedTag,
          type: "single_line_text_field"
        }]
      }
    }

    console.log('updated input', JSON.stringify(variables));
    const response = await admin.request(updateCustomerMutation, { variables });

    if (response.data?.metafieldsSet?.userErrors?.length > 0) {
      throw new Error(`GraphQL Errors: ${JSON.stringify(response.data.metafieldsSet.userErrors)}`);
    }

    const shopSegmentData = await prisma.shopSegmentsData.findFirst({
      where: { shop: shop, tagID: selectedTag }
    });

    const otherSegments = await prisma.shopSegmentsData.findMany({
      where: {
        shop: shop, 
        tagID: { not: selectedTag },
        buyers: {
          some: {
            customerId: customer.admin_graphql_api_id // condition on buyers
          }
        }
      }
    });

    if(otherSegments && otherSegments.length > 0) {
      for (const seg of otherSegments) {
        await prisma.shopSegmentsBuyers.deleteMany({
          where: { segmentId: seg.id, customerId: customer.admin_graphql_api_id }
        })
      }
    }

    if(shopSegmentData) {
      await prisma.shopSegmentsBuyers.upsert({
        where: {
          segmentId_customerId: {
            segmentId: shopSegmentData.id,
            customerId: customer.admin_graphql_api_id
          }
        },
        update: {
          segmentId: shopSegmentData.id,
          customerId: customer.admin_graphql_api_id,
          customerName: `${customer.first_name} ${customer.last_name}`
        },
        create: {
          segmentId: shopSegmentData.id,
          customerId: customer.admin_graphql_api_id,
          customerName: `${customer.first_name} ${customer.last_name}`
        }
      })
    }

    console.log('successfully updated tag for customer', JSON.stringify(response.data));
    return response.data;
    
  } catch (error) {
    console.error(`Error processing customer ${customer.email}:`, error);
    throw error;
  }
}

export async function checkCustomerByEmail(admin: AdminApiContext, email: string, defaultResponse: boolean = false): Promise<boolean> {
  const query = `
      query {
          customers(first: 1, query: "email:${email}") {
              edges {
                  node {
                      id
                      tags
                  }
              }
          }
      }
  `;

  try {
      const response = await admin.graphql(query);
      const responseJson = await response.json();

      if (responseJson.data.customers.edges.length > 0) {
          const customer = responseJson.data.customers.edges[0].node;
          const tags: string[] = customer.tags

          // Get the B2B_PREFIX from environment variables
          const b2bPrefix = process.env.B2B_PREFIX || 'PortalSphere_B2B_'; // Fallback to default if not set

          // Check if any tag starts with the B2B_PREFIX
          const hasB2BTag:boolean = tags.some((tag: string) => tag.startsWith(b2bPrefix));
          return hasB2BTag;
      }

      return false; // No customer found
  } catch (error) {
      console.error(`Error checking customer by email ${email}:`, error);
      return defaultResponse;
  }
}