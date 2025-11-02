import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { getShopId } from "./Settings.server";
import { B2B_PLUS_NAMESPACE, CUSTOMER_TAG } from "./CustomerGroups.server";
import { webHookTopics } from "./CustomFunctions.server";

export async function registerWebhook(admin: AdminApiContext, topic: string) {
    const response = await admin.graphql(`
      mutation {
        webhookSubscriptionCreate(
          topic: ${topic}
          webhookSubscription: {
            callbackUrl: "${process.env.SHOPIFY_APP_URL}/webhooks"
            format: JSON
          }
        ) {
          userErrors {
            field
            message
          }
          webhookSubscription {
            id
          }
        }
      }
    `);
  
    const result = await response.json();
    console.log(`Webhook registration result for ${topic}:`, JSON.stringify(result.data, null, 2));
    return result;
}

export async function registerProductWebhooks(admin: AdminApiContext) {
  const results = [];

  for (const topic of webHookTopics) {
    const result = await registerWebhook(admin, topic);
    results.push({ topic, result });
  }

  return results;
}

export async function removeProductWebhooks(admin: AdminApiContext) {
  const results = [];

  // First, fetch existing webhooks
  const response = await admin.graphql(`
    query {
      webhookSubscriptions(first: 100) {
        edges {
          node {
            id
            topic
          }
        }
      }
    }
  `);

  const data = await response.json();
  const existingWebhooks = data.data.webhookSubscriptions.edges;

  // Filter and remove product webhooks
  for (const webhook of existingWebhooks) {
    if (webHookTopics.includes(webhook.node.topic)) {
      const deleteResponse = await admin.graphql(`
        mutation {
          webhookSubscriptionDelete(id: "${webhook.node.id}") {
            deletedWebhookSubscriptionId
            userErrors {
              field
              message
            }
          }
        }
      `);

      const deleteResult = await deleteResponse.json();
      results.push({ 
        topic: webhook.node.topic, 
        result: deleteResult.data.webhookSubscriptionDelete 
      });

      //console.log(`Webhook deletion result for ${webhook.node.topic}:`, JSON.stringify(deleteResult.data, null, 2));
    }
  }

  return results;
}

export async function checkWebhookUrlMatch(admin: AdminApiContext): Promise<boolean> {
  const response = await admin.graphql(`
    query {
      webhookSubscriptions(first: 1) {
        edges {
          node {
            endpoint {
              ... on WebhookHttpEndpoint {
                callbackUrl
              }
            }
          }
        }
      }
    }
  `);

  const data = await response.json();
  const webhooks = data.data.webhookSubscriptions.edges;

  if (webhooks.length === 0) {
    return false; // No webhooks found
  }

  const currentCallbackUrl = webhooks[0].node.endpoint?.callbackUrl;
  const expectedCallbackUrl = `${process.env.SHOPIFY_APP_URL}/webhooks`;

  if (!currentCallbackUrl) {
    return false; // No callback URL found
  }

  return currentCallbackUrl === expectedCallbackUrl;
}

export async function handleAppUninstalled(shop: string, admin: AdminApiContext) {
  try {
    await Promise.all([
      cleanupMetafields(shop, admin),
      removeAutomaticDiscounts(shop, admin),
      removeCustomerTags(admin)
    ]);
    // If any promise fails, this code won't execute
    console.log('All cleanup operations succeeded');
  } catch (error) {
    // If any promise fails, execution jumps here
    console.error('A cleanup operation failed:', error);
  } finally {
    // Always acknowledge the webhook
    throw new Response();
  }
}

async function cleanupMetafields(shop: string, admin: AdminApiContext) {
  await Promise.all([
    deleteShopMetafields(admin, shop, B2B_PLUS_NAMESPACE),
    //deleteProductMetafields(admin, B2B_PLUS_NAMESPACE),
    deleteCustomerMetafields(admin, CUSTOMER_TAG),
  ]);
}



function chunk(array: any[], size: number) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function deleteShopMetafields(admin: any, shop: string, namespace: string) {
  const metafieldKeys: string[] = [
    "enableTopProducts",
    "enableComplementaryProducts",
    "topProductsList",
    "SHOPIFY_API_KEY",
    "SHOPIFY_API_SECRET",
    "subscriptionStatus",
    "isComplementaryProductsInitialized",
    "shipping-discount-config"
  ];

  const shopId = await getShopId(admin, shop);
  const GET_SHOP_METAFIELDS = `#graphql
    query GetShopMetafields($namespace: String!, $after: String) {
      shop {
        id
        metafields(namespace: $namespace, first: 250, after: $after) {
          edges {
            node {
              id
              key
              namespace
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `;

  const DELETE_METAFIELD = `#graphql
    mutation metafieldsDelete($ownerId: ID!, $namespace: String!, $key: String!) {
      metafieldsDelete(metafields: { ownerId: $ownerId, namespace: $namespace, key: $key }) {
        deletedMetafields {
          namespace
          key
          ownerId
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    let hasNextPage = true;
    let cursor = null;

    while (hasNextPage) {
      const response: any = await admin.graphql(GET_SHOP_METAFIELDS, {
        variables: {
          namespace,
          after: cursor,
        },
      });
      
      const responseJson = await response.json();
      
      if (responseJson.errors) {
        throw new Error(`GraphQL Errors: ${JSON.stringify(responseJson.errors)}`);
      }

      const { shop } = responseJson.data;
      const metafields = shop.metafields.edges.map((edge: any) => {
        if (metafieldKeys.includes(edge.node.key)) {
          return {
            key: edge.node.key,
            namespace: edge.node.namespace,
            ownerId: shopId
          }
        }else{
          return null;
        }
      });

      for (const item of metafields) {
        try {
          const deleteResponse = await admin.graphql(DELETE_METAFIELD, {
            variables: {
              ownerId: item.ownerId,
              namespace: item.namespace,
              key: item.key,
            },
          });
          const deleteJson = await deleteResponse.json();
          
          if (deleteJson.errors) {
            console.error('metafield deletion errors:', deleteJson.errors);
          }
          
          if (deleteJson.data.metafieldsDelete.userErrors.length > 0) {
            console.error('Errors during metafield deletion:', 
              deleteJson.data.metafieldsDelete.userErrors
            );
          }
        } catch (error) {
          console.error('Failed to delete metafield:', error);
        }
      }

      hasNextPage = shop.metafields.pageInfo.hasNextPage;
      cursor = shop.metafields.pageInfo.endCursor;
    }
  } catch (error) {
    console.error('Error in deleteShopMetafields:', error);
    throw error;
  }
}

async function deleteProductMetafields(admin: any, namespace: string) {
  const GET_PRODUCT_METAFIELDS = `#graphql
    query GetProductMetafields($namespace: String!, $after: String) {
      products(first: 50, after: $after) {
        edges {
          node {
            id
            metafields(namespace: $namespace, first: 250) {
              edges {
                node {
                  id
                  key
                  namespace
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const DELETE_METAFIELDS = `#graphql
    mutation metafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
      metafieldsDelete(metafields: $metafields) {
        deletedMetafields {
          namespace
          key
          ownerId
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    let hasNextPage = true;
    let cursor = null;

    while (hasNextPage) {
      const response: any = await admin.graphql(GET_PRODUCT_METAFIELDS, {
        variables: {
          namespace,
          after: cursor,
        },
      });
      
      const responseJson = await response.json();
      
      if (responseJson.errors) {
        throw new Error(`GraphQL Errors: ${JSON.stringify(responseJson.errors)}`);
      }

      const { products } = responseJson.data;
      const metafields = products.edges.flatMap((edge: any) => {
        if (!edge.node.metafields?.edges?.length) {
          return [];
        }
        return edge.node.metafields.edges
          .filter((metafieldEdge: any) => metafieldEdge.node.namespace === namespace)
          .map((metafieldEdge: any) => ({
            key: metafieldEdge.node.key,
            namespace: metafieldEdge.node.namespace,
            ownerId: edge.node.id
          }));
      }).filter(Boolean);

      if (metafields.length > 0) {
        const batches = chunk(metafields, 25);
        for (const batch of batches) {
          try {
            const deleteResponse = await admin.graphql(DELETE_METAFIELDS, {
              variables: {
                metafields: batch,
              },
            });
            const deleteJson = await deleteResponse.json();
            
            if (deleteJson.errors) {
              console.error('Batch deletion errors:', deleteJson.errors);
            }
            
            if (deleteJson.data.metafieldsDelete.userErrors.length > 0) {
              console.error('User errors during batch deletion:', 
                deleteJson.data.metafieldsDelete.userErrors
              );
            }
          } catch (error) {
            console.error('Failed to delete metafields batch:', error);
          }
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      }

      hasNextPage = products.pageInfo.hasNextPage;
      cursor = products.pageInfo.endCursor;
    }
  } catch (error) {
    console.error('Error in deleteProductMetafields:', error);
    throw error;
  }
}

export async function deleteCustomerMetafields(admin: any, namespace: string) {
  const GET_CUSTOMER_METAFIELDS = `#graphql
    query GetCustomerMetafields($namespace: String!, $after: String) {
      customers(first: 50, after: $after) {
        edges {
          node {
            id
            metafields(namespace: $namespace, first: 250) {
              edges {
                node {
                  id
                  key
                  namespace
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const DELETE_METAFIELDS = `#graphql
    mutation metafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
      metafieldsDelete(metafields: $metafields) {
        deletedMetafields {
          namespace
          key
          ownerId
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    let hasNextPage = true;
    let cursor = null;

    while (hasNextPage) {
      const response: any = await admin.graphql(GET_CUSTOMER_METAFIELDS, {
        variables: {
          namespace,
          after: cursor,
        },
      });
      
      const responseJson = await response.json();
      
      if (responseJson.errors) {
        throw new Error(`GraphQL Errors: ${JSON.stringify(responseJson.errors)}`);
      }

      const { customers } = responseJson.data;
      const metafields = customers.edges.flatMap((edge: any) => {
        if (!edge.node.metafields?.edges?.length) {
          return [];
        }
        return edge.node.metafields.edges
          .filter((metafieldEdge: any) => metafieldEdge.node.namespace === namespace)
          .map((metafieldEdge: any) => ({
            key: metafieldEdge.node.key,
            namespace: metafieldEdge.node.namespace,
            ownerId: edge.node.id
          }));
      }).filter(Boolean);

      if (metafields.length > 0) {
        const batches = chunk(metafields, 25);
        for (const batch of batches) {
          try {
            const deleteResponse = await admin.graphql(DELETE_METAFIELDS, {
              variables: {
                metafields: batch,
              },
            });
            const deleteJson = await deleteResponse.json();
            
            if (deleteJson.errors) {
              console.error('Batch deletion errors:', deleteJson.errors);
            }
            
            if (deleteJson.data.metafieldsDelete.userErrors.length > 0) {
              console.error('User errors during batch deletion:', 
                deleteJson.data.metafieldsDelete.userErrors
              );
            }
          } catch (error) {
            console.error('Failed to delete metafields batch:', error);
          }
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      }

      hasNextPage = customers.pageInfo.hasNextPage;
      cursor = customers.pageInfo.endCursor;
    }
  } catch (error) {
    console.error('Error in deleteCustomerMetafields:', error);
    throw error;
  }
}

export async function removeAutomaticDiscounts(shop: string, admin: AdminApiContext) {
  try {
    // Query to get all automatic discounts
    const response = await admin.graphql(`
      query getDiscounts {
        discountNodes(first: 100, query: "title:Portal Sphere B2B") {
          edges {
            node {
              id
              discount {
                ... on DiscountAutomaticApp {
                  title
                }
              }
            }
          }
        }
      }
    `);

    const json = await response.json();
    const discounts = json.data.discountNodes.edges;
    console.log("discounts", discounts);
    // Delete each discount
    const deleteResults = await Promise.allSettled(
      discounts.map(async ({ node }: any) => {
        console.log("node", node);
        const deleteResponse = await admin.graphql(`
          mutation discountDelete {
            discountAutomaticDelete(id: "${node.id}") {
              deletedAutomaticDiscountId
              userErrors {
                message
                code
                field
              }
            }
          }
        `);

        const deleteJson = await deleteResponse.json();
        console.log("deleteJson", deleteJson);
        console.log(`Deletion result for discount ${node.id}:`, JSON.stringify(deleteJson.data, null, 2));

        if (deleteJson.data.discountNodeDelete.userErrors.length > 0) {
          throw new Error(`Failed to delete discount ${node.id}: ${
            deleteJson.data.discountNodeDelete.userErrors.map((e: any) => e.message).join(', ')
          }`);
        }

        return {
          discountId: node.id,
          title: node.discount.title,
          status: 'deleted'
        };
      })
    );

    // Log results
    deleteResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        console.log(`Successfully deleted discount: ${result.value.title}`);
      } else {
        console.error(`Failed to delete discount ${index}:`, result.reason);
      }
    });

  } catch (error) {
    console.error(`Error removing automatic discounts for shop ${shop}:`, error);
    throw error;
  }
}

export async function removeCustomerTags(admin: AdminApiContext) {
  const GET_CUSTOMERS = `#graphql
    query GetCustomers($after: String) {
      customers(first: 50, after: $after) {
        edges {
          node {
            id
            tags
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const UPDATE_CUSTOMER = `#graphql
    mutation customerUpdate($input: CustomerInput!) {
      customerUpdate(input: $input) {
        customer {
          id
          tags
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    let hasNextPage = true;
    let cursor = null;

    while (hasNextPage) {
      const response: any = await admin.graphql(GET_CUSTOMERS, {
        variables: {
          after: cursor,
        },
      });
      
      const responseJson = await response.json();
      
      if (responseJson.errors) {
        throw new Error(`GraphQL Errors: ${JSON.stringify(responseJson.errors)}`);
      }

      const { customers } = responseJson.data;
      
      // Process customers in parallel using Promise.allSettled
      const updateResults = await Promise.allSettled(
        customers.edges.map(async (edge: any) => {
          const customer = edge.node;
          const filteredTags = customer.tags.filter(
            (tag: string) => !tag.startsWith('PortalSphere_B2B_')
          );

          // Only update if tags were removed
          if (filteredTags.length !== customer.tags.length) {
            const updateResponse = await admin.graphql(UPDATE_CUSTOMER, {
              variables: {
                input: {
                  id: customer.id,
                  tags: filteredTags
                }
              }
            });

            const updateJson = await updateResponse.json();
            
            if ('errors' in updateJson || updateJson.data.customerUpdate.userErrors.length > 0) {
              throw new Error(`Failed to update customer ${customer.id}: ${
                JSON.stringify('errors' in updateJson ? updateJson.errors : updateJson.data.customerUpdate.userErrors)
              }`);
            }

            return {
              customerId: customer.id,
              removedTags: customer.tags.length - filteredTags.length
            };
          }
          return null;
        })
      );

      // Log results
      updateResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          console.log(`Removed ${result.value.removedTags} tags from customer ${result.value.customerId}`);
        } else if (result.status === 'rejected') {
          console.error('Failed to update customer tags:', result.reason);
        }
      });

      hasNextPage = customers.pageInfo.hasNextPage;
      cursor = customers.pageInfo.endCursor;
      
      // Add a small delay between batches to avoid rate limiting
      if (hasNextPage) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  } catch (error) {
    console.error('Error in removeCustomerTags:', error);
    throw error;
  }
}