import type { GraphQLClient } from "node_modules/@shopify/shopify-app-remix/dist/ts/server/clients/types"
import type { AdminOperations } from "node_modules/@shopify/admin-api-client/dist/ts/graphql/types";
import { AdminApiContext, UnauthenticatedAdminContext } from "@shopify/shopify-app-remix/server";
import { getAdminClient, sendSlackNotification } from "./CustomFunctions.server";
import { ensureGidFormat, getProductVariantVolumePriceConfig } from "./ProductVolumePriceConfig.server";
import { GraphqlClient } from "@shopify/shopify-api";
import { ShopSegmentsData } from "@prisma/client";
import prisma from "~/db.server";

export interface IPriceConfig {
    quantity: string,
    percentage: string
}

export interface IQuantityConfig {
    increment?: string,
    minimum? : string,
    maximum?: string,
    breakdowns?: any
}

export interface IProductPriceQuantityConfigs {
    productId: string,
    volume: IQuantityConfig,
    price: IPriceConfig[],
    type?: string
}

export interface ISelectedProduct {
    productId: string;
    productTitle: string;
    productVariants: Array<{
        id: string;
        title: string;
    }>;
}

export const VOLUME_DISCOUNTS_KEY = "volumeDiscounts";
export const COLLECTION_DISCOUNTS_KEY = "collectionDiscounts";
export const CUSTOMER_TAG = "customer_tag";
export const GROUP_TAG = "group_tag";
export const B2B_PLUS_NAMESPACE = "b2bplus";

export interface IPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
  hasPreviousPage: boolean;
  startCursor: string | null;
}

export interface IPaginatedProductVariants {
  variants: Array<{
    variantId: string;
    variantTitle: string;
    variantDisplayName: string;
    variantImageUrl: string | null;
    productStatus: string;
    productImageUrl: string | null;
    inclusionMetafield: any;
    variantPrice: string;
    metafield: {
      id: string;
      value: string;
    } | null;
    cursor?: string;
  }>;
  pageInfo: IPageInfo
}

const PRODUCTS_PER_PAGE = 250; // Adjust this based on Shopify's limits
const DELAY_BETWEEN_REQUESTS = 500; // 500ms delay between requests
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const bulkAssignCustomers = async (payload: any, admin: AdminApiContext, shop: string): Promise<any> => {
  try {
    const {customerIds, groupTag, groupId} = payload;

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
        const responseData = await admin.graphql(`query getCustomer($id: ID!) {
          customer(id: $id) {
            displayName
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
          continue;
        }

        // Add the tag if it's not already present
        const existingTags = customerData.customer.tags || [];
        const updatedTags = [...new Set([...existingTags, groupTag])];
        const updateTagsResponse = await admin.graphql(UPDATE_CUSTOMER_TAGS_MUTATION, {
          variables: {
            input: {
              id: customerId,
              tags: updatedTags,
              taxExempt: true,
              metafields: [{
                namespace: CUSTOMER_TAG,
                key: GROUP_TAG,
                value: groupTag,
                type: "single_line_text_field"
              }]
            }
          }
        });

        if (!updateTagsResponse.ok) {
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

        // Update database
        try {
          const dbRecord = await prisma.shopSegmentsData.findFirst({
            where: { shop: shop, segmentId: groupId },
          });

          if (dbRecord != null) {
            if (dbRecord.memberCount != null) {
              await prisma.shopSegmentsData.update({
                where: { id: dbRecord.id },
                data: { memberCount: dbRecord.memberCount + 1 },
              });
            }

            // First, clean up any existing duplicates for this customer
            const numericId = customerId.split("/").pop();
            const customerGid = `gid://shopify/Customer/${numericId}`;
            const segmentMemberGid = `gid://shopify/CustomerSegmentMember/${numericId}`;

            // Find all existing records for this customer (any format)
            const existingBuyers = await prisma.shopSegmentsBuyers.findMany({
              where: {
                segmentId: dbRecord.id,
                OR: [
                  { customerId: customerGid },
                  { customerId: segmentMemberGid },
                  { customerId: customerId },
                ],
              },
            });

            if (existingBuyers.length > 0) {

              // If there are multiple records, keep only one and delete the rest
              if (existingBuyers.length > 1) {
                const [keepRecord, ...duplicates] = existingBuyers;
                await prisma.shopSegmentsBuyers.deleteMany({
                  where: { id: { in: duplicates.map((d) => d.id) } }
                });
              }
            } else {
              try {
                const newBuyer = await prisma.shopSegmentsBuyers.create({
                  data: {
                    segmentId: dbRecord.id,
                    customerId: customerGid, // Always use Customer GID format for consistency
                    customerName: customerData.customer.displayName,
                  }
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
          console.error("Database error for customer:", customerId, dbError);
        }
      } catch (customerError) {
        console.error("Error processing customer:", customerId, customerError);
      }
    }

    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export const bulkRemoveCustomers = async (payload: any, admin: AdminApiContext, shop: string): Promise<any> => {
  try {
    const { tagToRemove, customerIdsArray, groupId } = payload;

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
    for (var customerId of customerIdsArray) {
      try {
        customerId = ensureGidFormat(customerId, 'Customer');
        var customerSegmentId = ensureGidFormat(customerId.replace('gid://shopify/Customer/', ''), 'CustomerSegmentMember');
        
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
                  key: GROUP_TAG
                }
              }
            });

            if (!deleteMetafieldsResponse.ok) {
              console.error("Failed to delete metafields for:", customerId);
            }
          } catch (metafieldError) {
            console.error("Error deleting metafields for:", customerId, metafieldError);
          }
        }

        // Update database - use the same approach as segment.tsx
        try {
          const dbRecord = await prisma.shopSegmentsData.findFirst({
            where: { shop: shop, segmentId: groupId }
          });

          if (dbRecord != null) {
            if (dbRecord.memberCount != null && dbRecord.memberCount > 0) {
              await prisma.shopSegmentsData.update({
                where: { id: dbRecord.id },
                data: { memberCount: dbRecord.memberCount - 1 }
              });
            }

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
                  customerId: customerSegmentId 
                }
              };

              recordsToDelete = await prisma.shopSegmentsBuyers.findMany(deleteCondition);
            }

            if (recordsToDelete.length > 0) {
              await prisma.shopSegmentsBuyers.deleteMany(deleteCondition);
            }

          } else {
            console.error("No DB record found for group:", groupId);
          }
        } catch (dbError: any) {
          await sendSlackNotification(`Error in db: ${customerId} - ${dbError.message}`);
        }
          
      } catch (customerError: any) {
        await sendSlackNotification(`Error processing customer segment member: ${customerId} - ${customerError.message}`);
      }
    }

    return true;
  } catch (error: any) {
    await sendSlackNotification(`Error in full function - ${error.message}`);
    return false;
  }
}

export const getCustomerGroups = async (
    graphql: GraphQLClient<AdminOperations>,
): Promise<{id: string, name: string}[] | undefined> => {
    const b2bTag = String(process.env.B2B_PREFIX);
    const b2cTag = String(process.env.B2C_PREFIX);
    const query =`
        query {
            segments(first: 50) {
            edges {
                node {
                id
                name
                query
                }
            }
            }
        }
    `;

    const response = await graphql(query);

    if (response.ok) {
        const data = await response.json();
        const {
            data: {
                segments: {
                    edges
                }
            }
        } = data;
        const customerGroups = edges.filter((segment: any) => {
            const segmentQuery: string[] = segment.node.query.split(" ");
            const segmentTag = segmentQuery[segmentQuery.length-1];
            return ((segmentQuery[0] === "customer_tags" 
                && (segmentTag.includes(b2bTag) 
                    || segmentTag.includes(b2cTag))));
        });
        ////console.debug('customer groups', customerGroups);
        return ['', ...customerGroups.map((x: any) => ({
          id: x.node?.id,
          name: x.node?.name ?? 'None'
        }))];
    }
}

export const removeCustomerTag = async (customerId: string, tag: string, admin: AdminApiContext) => {
    try {
      // First, fetch the current tags of the customer
      const getCustomerQuery = `
        query getCustomer($id: ID!) {
          customer(id: $id) {
            tags
          }
        }
      `;
  
      const getCustomerVariables = { id: customerId };
  
      const customerResponse = await admin.graphql(getCustomerQuery, { variables: getCustomerVariables });
      const customerResult = await customerResponse.json() as { data?: { customer: { tags: string[] } }, errors?: { message: string }[] };
  
      if (customerResult.errors && customerResult.errors.length > 0) {
        throw new Error(customerResult.errors[0].message);
      }
  
      if (!customerResult.data || !customerResult.data.customer) {
        throw new Error('Customer data not found in the response');
      }
  
      const currentTags = customerResult.data.customer.tags;
  
      // Remove the specified tag from the current tags
      const updatedTags = currentTags.filter((currentTag: string) => currentTag !== tag);
  
      // Now update the customer with the new set of tags
      const updateQuery = `
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
  
      const updateVariables = {
        input: {
          id: customerId,
          tags: updatedTags
        }
      };
  
      const updateResponse = await admin.graphql(updateQuery, { variables: updateVariables });
      const updateResult = await updateResponse.json();
  
      if (updateResult.data.customerUpdate.userErrors.length > 0) {
        throw new Error(updateResult.data.customerUpdate.userErrors[0].message);
      }
  
      return updateResult.data.customerUpdate.customer;
    } catch (error) {
      console.error('Error removing customer tag:', error);
      throw error;
    }
  }

  /**
   * Decreasing the number from 250 to 100 because 250 customers would consume a lot of points
   * then instantly hitting it with 250 more requests would likely cause the GraphQL API to fail.
   * 
   * @param admin 
   * @param removeTag 
   */
export async function removeCustomerTags(admin: any, removeTag: string) {
  const customersQuery = `
    query($query: String!, $cursor: String) {
      customers(first: 100, after: $cursor, query: $query) {
        edges {
          node {
            id
          }
          cursor
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  `;

  const customersQueryVariables = {
    query: `tag:${removeTag}`
  };

  let hasNextPage = true;
  let cursor = null;
  let batchCount = 0;
  while (hasNextPage) {
    const variables: { query: string; cursor: string | null } = { ...customersQueryVariables, cursor };
    const customersResponse: Response = await admin.graphql(customersQuery, { variables });
    const customersData: { data: { customers: { edges: Array<{ node: { id: string }; cursor: string }>; pageInfo: { hasNextPage: boolean } } } } = await customersResponse.json();
    const customers = customersData.data.customers.edges;

    for (const customer of customers) {
      await removeCustomerTag(customer.node.id, removeTag, admin);
    }

    hasNextPage = customersData.data.customers.pageInfo.hasNextPage;
    cursor = customers[customers.length - 1]?.cursor;

    batchCount++;

    // Add a 1-second delay after each batch
    console.log(`Processed batch ${batchCount} (${batchCount * 250} customers). Pausing for 500ms...`);
    await delay(500); // 500ms delay
  }

  console.log(`Finished processing all customers. Total batches: ${batchCount}`);
}  

export async function createSegment(admin: AdminApiContext, name: string, tag: string) {
    const createSegmentResponse = await admin.graphql(
      `#graphql
      mutation {
        segmentCreate(name: "${name}", query: "customer_tags CONTAINS '${tag}'") {
          segment {
            id
          }
          userErrors {
            field
            message
          }
        }
      }`
    );

  const segmentData = await createSegmentResponse.json();
  if (!createSegmentResponse.ok || !segmentData.data.segmentCreate.segment) {
    throw new Error("Failed to create customer group");
  }
  return segmentData.data.segmentCreate.segment.id;
}

export async function deleteSegment(admin: any, groupId: string) {
  const deleteSegmentMutation = `
      mutation deleteSegment($id: ID!) {
          segmentDelete(id: $id) {
              deletedSegmentId
              userErrors {
                  field
                  message
              }
          }
      }
  `;

  const variables = { id: groupId };
  const response = await admin.graphql(deleteSegmentMutation, { variables });
  const result = await response.json();

  if (result.data.segmentDelete.userErrors.length > 0) {
      throw new Error(`Error deleting segment ${groupId}: ${result.data.segmentDelete.userErrors[0].message}`);
  }
}

export async function setShopVolumeDiscountMetafield(admin: AdminApiContext, shopId: string, tag: string, overallAdjustment: string, tiers?: any|null) {
  const newValue = {
    tag: tag,
    discount: overallAdjustment,
    tiers: null
  };

  if(tiers) {
    newValue.tiers = tiers;
  }

  // First, fetch the existing shop metafield
  const getShopMetafieldQuery = `
    query getShopMetafield {
      shop {
        metafield(namespace: "${B2B_PLUS_NAMESPACE}", key: "${VOLUME_DISCOUNTS_KEY}") {
          value
        }
      }
    }
  `;

  const shopMetafieldResponse = await admin.graphql(getShopMetafieldQuery);
  const shopMetafieldData = await shopMetafieldResponse.json();

  let updatedMetafieldValue = [];

  if (shopMetafieldData.data.shop.metafield) {
    const existingValue = JSON.parse(shopMetafieldData.data.shop.metafield.value);
    if (Array.isArray(existingValue) && existingValue.length > 0) {
      // Check if an entry with the same tag already exists
      const existingIndex = existingValue.findIndex(item => item.tag === tag);
      if (existingIndex !== -1) {
        // Update existing entry
        existingValue[existingIndex] = newValue;
        updatedMetafieldValue = existingValue;
      } else {
        // Add new entry
        updatedMetafieldValue = [...existingValue, newValue];
      }
    } else {
      updatedMetafieldValue = [newValue];
    }
  } else {
    updatedMetafieldValue = [newValue];
  }

  const metafieldInput = {
    namespace: B2B_PLUS_NAMESPACE,
    key: VOLUME_DISCOUNTS_KEY,
    value: JSON.stringify(updatedMetafieldValue),
    type: "json",
    ownerId: shopId
  };

  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const setMetafieldResponse = await admin.graphql(
    mutation, {
      variables: {
        metafields: [metafieldInput]
      }
    }
  );

  const setMetafieldData = await setMetafieldResponse.json();
  //await sendSlackNotification(`Response for setShopVolumeDiscountMetafield function - ${JSON.stringify(setMetafieldData.data)}`);
  if (setMetafieldData.data.metafieldsSet.userErrors.length > 0) {
    console.error('Error setting metafield:', setMetafieldData.data.metafieldsSet.userErrors);
    throw new Error('Failed to set shop metafield');
  }

  return setMetafieldData.data.metafieldsSet.metafields[0];
}

// export async function setProductVariantMetafields(admin: AdminApiContext, selectedProducts: ISelectedProduct[], tag: string, metafieldValue?: any) {
//     for (const product of selectedProducts) {
//         for (const variant of product.productVariants) {
//             await setVariantMetafield(admin, variant.id, tag);
//         }
//     }
// }

export async function setProductVariantInclusionMetafields(admin: AdminApiContext, selectedProductIds: string[], tag: string) {
  for (const variantId of selectedProductIds) {
        await setVariantInclusionMetafield(admin, variantId, tag);
  }
}

export async function setAllProductVariantMetafields(admin: AdminApiContext, tag: string) {
    let hasNextPage = true;
    let cursor = null;

    while (hasNextPage) {
        const GET_ALL_VARIANTS = `#graphql
            query($cursor: String) {
                productVariants(first: 250, after: $cursor) {
                    edges {
                        node {
                            id
                        }
                        cursor
                    }
                    pageInfo {
                        hasNextPage
                    }
                }
            }
        `;

        const variantsResponse: any = await admin.graphql(GET_ALL_VARIANTS, {
            variables: { cursor }
        });
        const variantsData = await variantsResponse.json();

        const variants = variantsData.data.productVariants.edges.map((edge: any) => edge.node);

        for (const variant of variants) {
            await setVariantInclusionMetafield(admin, variant.id, tag);
        }

        hasNextPage = variantsData.data.productVariants.pageInfo.hasNextPage;
        cursor = variantsData.data.productVariants.edges[variantsData.data.productVariants.edges.length - 1].cursor;

        if (hasNextPage) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

export async function setVariantInclusionMetafield(admin: AdminApiContext|GraphqlClient, variantId: string, tag: string) {

  const metafieldInput = {
    namespace: B2B_PLUS_NAMESPACE,
    key: tag,
    value: "included",
    type: "single_line_text_field",
    ownerId: variantId
  };

  const mutation = `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
        value
      }
      userErrors {
        field
        message
      }
    }
  }`;

  let setMetafieldData;

  if('graphql' in admin) {
    const setMetafieldResponse = await admin.graphql(mutation, {
      variables: {
        metafields: [metafieldInput]
      }
    });

    setMetafieldData = await setMetafieldResponse.json();
  } else {
    setMetafieldData = await admin.request(mutation, {
      variables: {
        metafields: [metafieldInput]
      }
    })
  }
  
  if (setMetafieldData.data.metafieldsSet?.userErrors.length > 0) {
    console.error('Error setting metafield for variant:', variantId, setMetafieldData.data.metafieldsSet.userErrors);
    throw new Error('Failed to set metafield for variant');
  }
}

function getQueryObject(limit: Number, cursor:string|null = null) {
  var returnVal = new Array(); 
  returnVal.push(`first: ${limit}`);
  if(cursor) {
    returnVal.push(`after: "${cursor}"`);
  }

  return returnVal.join(', ');
}

export async function getProductIdsInCollection(admin: AdminApiContext|GraphqlClient, collectionId: string) {
  var limit: Number = 100;
  var cursor: string|null = null;
  var returnVal: Array<string> = new Array();
  do {
    var hasNextPage: Boolean = false;
    var queryObject = getQueryObject(limit, cursor);
    var query = `
      query {
        collection(id: "${collectionId}") {
          id
          products(${queryObject}) {
            pageInfo {
              hasNextPage
            }
            edges {
              cursor
              node {
                id
              }
            }
          }
        }
      }
    `;

    let respBody = null;
    if('graphql' in admin) {
      var response = await admin.graphql(query);
      if(response.ok) {
        respBody = await response.json();
      }    
    } else {
      respBody = await admin.request(query);
    }

    if(respBody && respBody.data && respBody.data.collection) {
      var products = respBody.data?.collection?.products || null;
      if(products) {
        hasNextPage = products.pageInfo?.hasNextPage || false;
        if(products.edges && products.edges.length > 0) {
          for(var i in products.edges) {
            var currentEdge = products.edges[i];
            cursor = currentEdge.cursor;
            returnVal.push(currentEdge.node.id);
          }
        } 
      } 
    }  
  } while(hasNextPage);

  return returnVal;
}

export async function setCollectionInclusionMetafieldForProduct(admin: AdminApiContext|GraphqlClient, productId: string, tag: string) {
  const metafieldInput = {
    namespace: B2B_PLUS_NAMESPACE,
    key: tag,
    value: "included",
    type: "single_line_text_field",
    ownerId: productId
  };

  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  let setMetafieldData;

  if('graphql' in admin) {
    const setMetafieldResponse = await admin.graphql(mutation, {
      variables: {
        metafields: [metafieldInput]
      }
    });

    setMetafieldData = await setMetafieldResponse.json();
  } else {
    setMetafieldData = await admin.request(mutation, {
      variables: {
        metafields: [metafieldInput]
      }
    });
  }

  if (setMetafieldData.data.metafieldsSet?.userErrors.length > 0) {
    console.error('Error setting metafield for collection:', productId, setMetafieldData.data.metafieldsSet.userErrors);
    throw new Error('Failed to set metafield for collection');
  }

  return setMetafieldData.data;
}

export const processSegment = async (segment: ShopSegmentsData): Promise<void> => {
  const productDiscounts = typeof(segment.productDiscounts) == 'string' ? JSON.parse(segment.productDiscounts) : segment.productDiscounts;
  const collectionDiscounts = typeof(segment.collectionDiscounts) == 'string' ? JSON.parse(segment.collectionDiscounts) : segment.collectionDiscounts;
  const limit = 5;
  var finalProductsJson = new Array();
  var finalCollectionsJson = new Array();
  const storeRecord = await prisma.session.findFirst({where: { shop: segment.shop }});
  const admin = await getAdminClient(storeRecord);

  var productsFlag :boolean = false; 
  var collectionsFlag :boolean = false;

  if(!segment.tagID) return;

  const toProcessProductsArr = new Array();
  
  try {
    if(productDiscounts) {
      for(var i = 0; i < productDiscounts.length; i++) {
        if(productDiscounts[i].hasOwnProperty('processed') && productDiscounts[i].processed == true) {
          //Collect it so it can be updated
          finalProductsJson.push(productDiscounts[i]);
        } else {
          if(toProcessProductsArr.length <= limit) {
            toProcessProductsArr.push(productDiscounts[i]);
          } else {
            finalProductsJson.push(productDiscounts[i]);
          }
        }
      }
    }
  
    //Check if you even found any products to process.
    //If not that means that products are completed to process.
  
    if(toProcessProductsArr.length > 0) {
      for(var key in toProcessProductsArr) {
        var priceConfig = new Array();
        if(toProcessProductsArr[key].priceConfig && toProcessProductsArr[key].priceConfig.length > 0) {
          for(var j in toProcessProductsArr[key].priceConfig) {
            var currentPriceConfig = toProcessProductsArr[key].priceConfig[j];
            priceConfig.push({
              percentage: currentPriceConfig.value,
              quantity: currentPriceConfig.quantity
            });
          }
        }
        
        var metafieldObject = {
          volumeConfig: {
            maximum: toProcessProductsArr[key].volumeConfig.maximum,
            increment: toProcessProductsArr[key].volumeConfig.increments,
            minimum: toProcessProductsArr[key].volumeConfig.minimum
          },
          priceConfig: priceConfig,
          type: toProcessProductsArr[key].discount_type == 'percentage' ? 'percentage':'fixedAmount'
        };

        console.log(`${segment.id} - ${segment.shop} - creating a new variant metafield now.`);
        console.log(`${toProcessProductsArr[key].id} - ${segment.tagID}, ${JSON.stringify(metafieldObject)}`);

        await setVariantMetafield(admin, toProcessProductsArr[key].id, segment.tagID, metafieldObject);
        await setVariantInclusionMetafield(admin, toProcessProductsArr[key].id, segment.tagID);  

        try {
          var currentVariantId = toProcessProductsArr[key].id.replace('gid://shopify/ProductVariant/', '');
          currentVariantId = parseInt(currentVariantId);
          await prisma.shopSegmentVariants.upsert({
            where: {
              segmentId_variantId: {
                segmentId: segment.id,
                variantId: currentVariantId
              }
            },
            create: {
              segmentId: segment.id,
              variantId: currentVariantId,
              discount_type: toProcessProductsArr[key].discount_type,
              priceConfig: toProcessProductsArr[key].priceConfig,
              volumeConfig: toProcessProductsArr[key].volumeConfig,
              included: true
            },
            update: {
              discount_type: toProcessProductsArr[key].discount_type,
              priceConfig: toProcessProductsArr[key].priceConfig,
              volumeConfig: toProcessProductsArr[key].volumeConfig,
              included: true
            }
          });  
        } catch (error: any) {
          console.log(error.message);  
        }
        
        toProcessProductsArr[key].processed = true;
        finalProductsJson.push(toProcessProductsArr[key]);
      }

      await prisma.shopSegmentsData.update({
        where: { id: segment.id },
        data: { productDiscounts: finalProductsJson }
      })
    } else {
      productsFlag = true; //Products have finished processing
    }  
  } catch (error: any) {
    console.trace(error);
    console.log(`Error in products part segment ${segment.id}-${segment.shop} - ${error.message}`);
  }

  //Now start checking collections
  const toProcessCollectionsArr = new Array();

  try {
    if(collectionDiscounts) {
      for(var i = 0; i < collectionDiscounts.length; i++) {
        if(collectionDiscounts[i].hasOwnProperty('processed') && collectionDiscounts[i].processed == true) {
          //Collect it so it can be updated
          finalCollectionsJson.push(collectionDiscounts[i]);
        } else {
          if(toProcessCollectionsArr.length <= limit) {
            toProcessCollectionsArr.push(collectionDiscounts[i]);
          } else {
            finalCollectionsJson.push(collectionDiscounts[i]);
          }
        }
      }
    }

    if(toProcessCollectionsArr != null && toProcessCollectionsArr.length > 0) {
      for(var key in toProcessCollectionsArr) {
        var collectionId = toProcessCollectionsArr[key].id.split('gid://shopify/Collection/');
        collectionId = collectionId[1];
        collectionId = ensureGidFormat(collectionId, 'Collection');
        
        var productIdsInCollection = await getProductIdsInCollection(admin, collectionId);
        if(productIdsInCollection && productIdsInCollection.length > 0) {
          for(var j in productIdsInCollection) {
            var currentId = ensureGidFormat(productIdsInCollection[j], 'Product');

            var metaCollectObject = {
              volumeConfig: toProcessCollectionsArr[key].volumeConfig,
              priceConfig: toProcessCollectionsArr[key].priceConfig,
              type: toProcessCollectionsArr[key].discount_type,
              discountValue: toProcessCollectionsArr[key].discountValue
            };

            console.log(`${segment.id} - ${segment.shop} - creating a new collection metafield now.`);
            console.log(`${currentId} - ${segment.tagID}, ${JSON.stringify(metaCollectObject)}`);

            await setCollectionMetafieldForProduct(admin, currentId, segment.tagID, metaCollectObject);
            await setCollectionInclusionMetafieldForProduct(admin, currentId, segment.tagID)
          }

          var dbCollectionId = parseInt(collectionId.replace('gid://shopify/Collection/', ''));
          await prisma.shopSegmentCollections.upsert({
            where: {
              segmentId_collectionId: {
                segmentId: segment.id,
                collectionId: dbCollectionId
              }
            },
            create: {
              segmentId: segment.id,
              collectionId: dbCollectionId,
              priceConfig: toProcessCollectionsArr[key].priceConfig,
              volumeConfig: toProcessCollectionsArr[key].volumeConfig,
              discount_type: toProcessCollectionsArr[key].discount_type,
              included: true
            },
            update: {
              priceConfig: toProcessCollectionsArr[key].priceConfig,
              volumeConfig: toProcessCollectionsArr[key].volumeConfig,
              discount_type: toProcessCollectionsArr[key].discount_type,
              included: true
            }
          })
        }

        toProcessCollectionsArr[key].processed = true;
        finalCollectionsJson.push(toProcessCollectionsArr[key]);
      }

      await prisma.shopSegmentsData.update({
        where: { id: segment.id },
        data: { collectionDiscounts: finalCollectionsJson }
      })
    } else {
      collectionsFlag = true;
    }
  } catch (error: any) {
    console.log(`Error in collections part segment ${segment.id}-${segment.shop} - ${error.message}`);
  }

  console.log(`For segment ${segment.segmentName} - productsFlag - ${productsFlag} - collectionsFlag - ${collectionsFlag}`);

  if(productsFlag && collectionsFlag) {
    await prisma.shopSegmentsData.update({
      where: { id: segment.id },
      data: { status: true }
    })
  }
}

export const getConfigFromProductHandle = async(admin: AdminApiContext|UnauthenticatedAdminContext, productHandle: string, tag: string, shop: string): Promise<any> => {
  const filteredproductHandle = productHandle.split('?')[0];
  const query = `
    query getProductByHandle($handle: String!) {
      productByHandle(handle: $handle) {
        id
        handle
        variants(first: 1) {
          edges {
            node {
              id
            }
          }
        }
      }
    }
  `;

  let responseBody = null;
  let variables = {variables: { handle: filteredproductHandle }}
  const response = 'graphql' in admin ? await admin.graphql(query, variables) : await admin.admin.graphql(query, variables);
  responseBody = await response.json();
  
  const productVariantId = responseBody?.data?.productByHandle?.variants?.edges[0].node.id || null;
  if(productVariantId) {
    const retval = await getProductVariantVolumePriceConfig(admin, productVariantId, tag ?? '');
  
    if(retval) {
      let formattedVariantId = ensureGidFormat(productVariantId, 'ProductVariant');
      setTimeout(async () => {
        const existingDBRecord = await prisma.volumePricingData.findFirst({
          where: {
            shop: shop,
            tag: tag,
            productVariantId: formattedVariantId  
          }
        });

        if(existingDBRecord && existingDBRecord != null) {
          await prisma.volumePricingData.updateMany({
            where: {
              shop: shop,
              tag: tag,
              productVariantId: formattedVariantId  
            },
            data: {
              productVariantHandle: retval.handle,
              returnData: JSON.parse(JSON.stringify(retval))
            }
          })
        } else {
          await prisma.volumePricingData.create({
            data: {
              shop: shop,
              tag: tag,
              productVariantHandle: retval.handle,
              productVariantId: formattedVariantId,
              returnData: JSON.parse(JSON.stringify(retval))
            }
          });
        }
      }, 1000);

      return {
        productVariantHandle: productHandle,
        returnData: JSON.parse(JSON.stringify(retval))
      }
    }
  }

  return {data: responseBody.data};
}

export async function setCollectionMetafieldForProduct(admin: AdminApiContext|GraphqlClient, productId: string, tag: string, metafieldValue?: {volumeConfig: any, priceConfig: any, type: string, discountValue: Number|string|null} | null) {
  let discountType = 'percentage';
  if(metafieldValue) {
    if(metafieldValue.hasOwnProperty('type')) {
      if(['fixedAmount', 'fixed'].includes(metafieldValue.type)) {
        discountType = 'fixedAmount';
      }
    }
  }
  
  const newValue = {
    tag: tag,
    volumeConfig: metafieldValue?.volumeConfig || {},
    priceConfig: metafieldValue?.priceConfig || [],
    type: discountType,
    discount: metafieldValue?.discountValue
  };

  // First, fetch the existing variant metafield
  const getProductCollectionMetafieldQuery = `
    query getProductCollectionMetafield($productId: ID!) {
      product(id: $productId) {
        metafield(namespace: "${B2B_PLUS_NAMESPACE}", key: "${COLLECTION_DISCOUNTS_KEY}") {
          value
        }
      }
    }
  `;

  let productCollectionMetafieldData;
  let updatedCollectionMetafieldValue = [];

  if('graphql' in admin) {
    const productCollectionMetafieldResponse = await admin.graphql(getProductCollectionMetafieldQuery, {
      variables: { productId }
    });
    productCollectionMetafieldData = await productCollectionMetafieldResponse.json();
  } else {
    productCollectionMetafieldData = await admin.request(getProductCollectionMetafieldQuery, {
      variables: { productId }
    })
  }


  if (productCollectionMetafieldData.data.product.metafield) {
    const existingValue = JSON.parse(productCollectionMetafieldData.data.product.metafield.value);
    if (Array.isArray(existingValue) && existingValue.length > 0) {
      const existingIndex = existingValue.findIndex((item: any) => item.tag === tag); 
      if(existingIndex !== -1){
        existingValue[existingIndex] = newValue;
        updatedCollectionMetafieldValue = existingValue;
      } else {
        updatedCollectionMetafieldValue = [...existingValue, newValue];
      }
    } else {
      updatedCollectionMetafieldValue = [newValue];
    }
  } else {
    updatedCollectionMetafieldValue = [newValue];
  }

  // Now set both metafields for the variant
  const metafieldInputs = [{
    namespace: B2B_PLUS_NAMESPACE,
    key: COLLECTION_DISCOUNTS_KEY,
    value: JSON.stringify(updatedCollectionMetafieldValue),
    type: "json",
    ownerId: productId
  }];

  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  let setMetafieldData;

  if('graphql' in admin) {
    const setMetafieldResponse = await admin.graphql(mutation, {
      variables: {
        metafields: metafieldInputs
      }
    });

    setMetafieldData = await setMetafieldResponse.json();
  } else {
    setMetafieldData = await admin.request(mutation, {
      variables: {
        metafields: metafieldInputs
      }
    });
  }

  if (setMetafieldData.data.metafieldsSet.userErrors.length > 0) {
    console.error('Error setting metafields:', setMetafieldData.data.metafieldsSet.userErrors);
    throw new Error('Failed to set metafields');
  }

  return setMetafieldData.data.metafieldsSet.metafields;
}

export const findCustomersWithTags = async(admin: AdminApiContext|GraphqlClient, tag: string): Promise<any> => {
  try {
    let hasNextPage = true;
    let afterCursor = null;
    let variables, tempCustomers;
    let returnVal = new Array();
    const query = `
      query getCustomers($first: Int!, $after: String) {
        customers(first: $first, after: $after, query: "tag:${tag}") {
          pageInfo {
            hasNextPage
          }
          edges {
            cursor
            node {
              id
              tags
            }
          }
        }
      }
    `;
    do {
      variables = {
        first: 50, // fetch 50 customers per request
        after: afterCursor
      };

      let response = null, respJson = null;
      if('graphql' in admin) {
        response = await admin.graphql(query, {variables: variables});
        respJson = await response.json();
      } else {
        respJson = await admin.request(query, {variables: variables});
      }

      tempCustomers = respJson.data.customers.edges;

      
      if(tempCustomers != null && tempCustomers.length > 0) {
        for(var i in tempCustomers) {
          returnVal.push({
            id: tempCustomers[i].node.id,
            tags: tempCustomers[i].node.tags
          })
        }
      }

      console.log('tempCustomers', returnVal);


      hasNextPage = respJson.data.customers.pageInfo.hasNextPage;
      afterCursor = hasNextPage ? tempCustomers[tempCustomers.length - 1].cursor : null;

    } while (hasNextPage);

    return returnVal;
  } catch (error) {
    console.log('error in finding customers via tag');
    console.log(error.message);
    console.trace(error);
  }
}

export async function setVariantMetafield(admin: AdminApiContext|GraphqlClient, variantId: string, tag: string, metafieldValue?: {volumeConfig: any, priceConfig: any, type: string} | null) {
  const newValue = {
    tag,
    volumeConfig: metafieldValue?.volumeConfig || {},
    priceConfig: metafieldValue?.priceConfig || [],
    type: metafieldValue?.type || "percentage"
  };

  // First, fetch the existing variant metafield
  const getVariantMetafieldQuery = `query getVariantMetafield($variantId: ID!) {
    productVariant(id: $variantId) {
      metafield(namespace: "${B2B_PLUS_NAMESPACE}", key: "${VOLUME_DISCOUNTS_KEY}") {
        value
      }
    }
  }`;

  let variantMetafieldData;
  if('graphql' in admin) {
    const variantMetafieldResponse = await admin.graphql(getVariantMetafieldQuery, {
      variables: { variantId }
    });
    variantMetafieldData = await variantMetafieldResponse.json();
  } else {
    variantMetafieldData = await admin.request(getVariantMetafieldQuery, { variables: { variantId }});
  }

  let updatedVariantMetafieldValue = [];

  if (variantMetafieldData.data.productVariant.metafield) {
    const existingValue = JSON.parse(variantMetafieldData.data.productVariant.metafield.value);
    if (Array.isArray(existingValue) && existingValue.length > 0) {
      const existingIndex = existingValue.findIndex((item: any) => item.tag === tag); 
      if(existingIndex !== -1){
        existingValue[existingIndex] = newValue;
        updatedVariantMetafieldValue = existingValue;
      } else {
        updatedVariantMetafieldValue = [...existingValue, newValue];
      }
    } else {
      updatedVariantMetafieldValue = [newValue];
    }
  } else {
    updatedVariantMetafieldValue = [newValue];
  }

  // Now set both metafields for the variant
  const metafieldInputs = [{
    namespace: B2B_PLUS_NAMESPACE,
    key: VOLUME_DISCOUNTS_KEY,
    value: JSON.stringify(updatedVariantMetafieldValue),
    type: "json",
    ownerId: variantId
  }];

  const mutation = `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
        value
      }
      userErrors {
        field
        message
      }
    }
  }`;

  let setMetafieldData;
  if('graphql' in admin) {
    const setMetafieldResponse = await admin.graphql(mutation, {
      variables: {
        metafields: metafieldInputs
      } 
    });

    setMetafieldData = await setMetafieldResponse.json();
  } else {
    setMetafieldData = await admin.request(mutation, {
      variables: {
        metafields: metafieldInputs
      }
    })
  }

  console.log('payload here', metafieldInputs)
  console.log(`Response here ${JSON.stringify(setMetafieldData.data)}`);
  
  if (setMetafieldData.data.metafieldsSet.userErrors.length > 0) {
    console.error('Error setting metafields:', setMetafieldData.data.metafieldsSet.userErrors);
    throw new Error('Failed to set metafields');
  }

  return setMetafieldData.data.metafieldsSet.metafields;
}

export async function setShopPaymentMethodsMetafield(admin: AdminApiContext, shopId: string, tag: string, selectedPayments: string[]) {
  const getMetafieldResponse = await admin.graphql(
    `#graphql
    query {
      shop {
        metafield(key: "PaymentMethodOptions", namespace: "${B2B_PLUS_NAMESPACE}") {
          value
        }
      }
    }`
  );

  const metafieldData = await getMetafieldResponse.json();
  let updatedValue;

  if (metafieldData.data.shop.metafield) {
      const existingValue = JSON.parse(metafieldData.data.shop.metafield.value);
      const existingIndex = existingValue.findIndex((item: any) => item.tag === tag);
      if (existingIndex !== -1) {
          existingValue[existingIndex] = { tag, selectedPayments };
      } else {
          existingValue.push({ tag, selectedPayments });
      }
      updatedValue = JSON.stringify(existingValue);
  } else {
    updatedValue = JSON.stringify([{ tag, selectedPayments }]);
  }

  const metafields = [{
    namespace: B2B_PLUS_NAMESPACE,
    key: "PaymentMethodOptions",
    value: updatedValue,
    type: "json",
    ownerId: shopId
  }];

  const mutation = `
    mutation createMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          key
          namespace
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const setMetafieldResponse = await admin.graphql(mutation, {
    variables: {
      metafields
    }
  });

  const setMetafieldData = await setMetafieldResponse.json();
  //await sendSlackNotification(`Response for setShopPaymentMethodsMetafield function - ${JSON.stringify(setMetafieldData.data)}`);

  if (setMetafieldData.data.metafieldsSet.userErrors.length > 0) {
    throw new Error('Failed to set payment methods metafield');
  }
}

export async function getShopMetafield(admin: AdminApiContext | UnauthenticatedAdminContext, tag: string, namespace: string) {
  const query = `query getShopMetafield($namespace: String!, $key: String!) {
    shop {
      metafield(namespace: $namespace, key: $key) {
        id
        value
      }
    }
  }`;

  const variables = {
    namespace,
    key: VOLUME_DISCOUNTS_KEY,
  };

  try {
    const response = 'graphql' in admin ? await admin.graphql(query, { variables }) : await admin.admin.graphql(query, { variables });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseJson = await response.json();

    if (responseJson.data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(responseJson.data.errors)}`);
    }

    const metafield = responseJson.data.shop.metafield;

    if (metafield && metafield?.value) {
      let parsedValue;
      try {
        parsedValue = JSON.parse(metafield.value);
      } catch (error) {
        console.error('Error parsing metafield value:', error);
        return null;
      }

      if (Array.isArray(parsedValue) && parsedValue.length > 0) {
        const foundObject = parsedValue.find(obj => obj.tag === tag);
        return foundObject ? {value: JSON.stringify(foundObject)} : null;
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching shop metafield:', error);
    throw error;
  }
}

export async function getShopPaymentMethodsMetafield(admin: AdminApiContext, namespace: string, key: string) {
  try {
    const response = await admin.graphql(
      `query getShopPaymentMethodsMetafield($namespace: String!, $key: String!) {
        shop {
          metafield(namespace: $namespace, key: $key) {
            id
            value
          }
        }
      }`,
      {
        variables: {
          namespace,
          key,
        },
      }
    );

    const responseJson = await response.json();
    return responseJson.data.shop.metafield;
  } catch (error) {
    console.error('Error fetching shop payment methods metafield:', error);
    throw error;
  }
}

export async function getProductVariantMetafields(
  admin: AdminApiContext, 
  namespace: string, 
  tag: string, 
  first: number = 10,
  cursor: string | null = null,
  searchTerm: string | null = null
): Promise<IPaginatedProductVariants> {
  const query = `
    query getProductVariants($first: Int!, $cursor: String, $query: String) {
      productVariants(first: $first, after: $cursor, query: $query) {
        edges {
          node {
            id
            title
            displayName
            price
            image {
              url
            }
            product {
              status
              featuredMedia {
                ... on MediaImage {
                  image {
                    url
                  }
                }
              }
            }
            metafields(first: 10) {
              nodes {
                id
                key
                value
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
    }
  `;

  try {
    const variables: {
      //namespace: string;
      first: number;
      cursor: string | null;
      query?: string;
    } = {
      //namespace,
      first,
      cursor
    };

    // Add search query if searchTerm exists
    if (searchTerm && searchTerm.trim()) {
      //variables.query = `product_title:*${searchTerm.trim()}* OR variant_title:*${searchTerm.trim()}*`;
      variables.query = `*${searchTerm.trim()}*`;
    }

    console.log('Query variables:', variables);
    const response = await admin.graphql(query, { variables });
    const responseJson = await response.json();

    if (responseJson.data?.errors && responseJson.data.errors.length > 0) {
      throw new Error(responseJson.data.errors[0].message);
    }

    const productVariants = responseJson.data?.productVariants;
    if (!productVariants) {
      throw new Error('No product variants data found in the response');
    }

    const variants = productVariants.edges.map((edge: any) => {
      const variant = edge.node;
      let inclusionMetafield = null;
      let metafield = null;
      const metafields = variant.metafields;

      if (metafields && metafields.nodes.length > 0) {
        inclusionMetafield = metafields.nodes.find((metafield: any) => metafield.key === tag) ?? null;
        metafield = metafields.nodes.find((metafield: any) => metafield.key === VOLUME_DISCOUNTS_KEY) ?? null;
      }

      return {
        variantId: variant.id,
        variantTitle: variant.title,
        variantDisplayName: variant.displayName,
        productStatus: variant.product.status,
        variantImageUrl: variant.image?.url ?? null,
        productImageUrl: variant.product.featuredMedia?.image?.url ?? null,
        inclusionMetafield,
        variantPrice: variant.price,
        metafield,
        cursor: edge.cursor // Include cursor in the return data
      };
    });

    return {
      variants,
      pageInfo: {
        hasNextPage: productVariants.pageInfo.hasNextPage,
        hasPreviousPage: productVariants.pageInfo.hasPreviousPage,
        startCursor: productVariants.pageInfo.startCursor,
        endCursor: productVariants.pageInfo.endCursor
      }
    };

  } catch (error) {
    console.error('Error fetching product variant metafields:', error);
    throw error;
  }
}

export async function updateSegment(admin: AdminApiContext, segmentId: string, name: string) {
  try {
    // Check if a segment with exactly the same name already exists
    const checkExistingSegmentResponse = await admin.graphql(
      `query checkExistingSegment($query: String!) {
        segments(first: 1, query: $query) {
          edges {
            node {
              id
              name
            }
          }
        }
      }`,
      {
        variables: {
          query: `name='${name}'`
        }
      }
    );

    const checkExistingSegmentJson = await checkExistingSegmentResponse.json();
    const existingSegments = checkExistingSegmentJson.data.segments.edges;

    if (existingSegments.length > 0 && existingSegments[0].node.id !== segmentId) {
      throw new Error('A segment with this name already exists');
    }

    if (existingSegments.length > 0 && existingSegments[0].node.id === segmentId) {
      return true;
    }

    // If no existing segment with the same name, proceed with the update
    const updateResponse = await admin.graphql(
      `mutation updateSegment($id: ID!, $name: String!) {
        segmentUpdate(id: $id, name: $name) {
          segment {
            id
            name
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          id: segmentId,
          name: name
        }
      }
    );

    const updateResponseJson = await updateResponse.json();
    //await sendSlackNotification(`Response for updating segment - ${JSON.stringify(updateResponseJson.data)}`);
    if (updateResponseJson.data.segmentUpdate.userErrors.length > 0) {
      throw new Error(updateResponseJson.data.segmentUpdate.userErrors[0].message);
    }
    return updateResponseJson.data.segmentUpdate.segment;
  } catch (error) {
    console.error('Error updating segment:', error);
    throw error;
  }
}

export async function getSegmentDetails(admin: AdminApiContext, segmentId: string) {
  try {
    const response = await admin.graphql(
      `query getSegment($id: ID!) {
        segment(id: $id) {
          id
          name
          query
        }
      }`,
      {
        variables: {
          id: segmentId,
        },
      }
    );
    const responseJson = await response.json();
    if (responseJson.data.segment === null) {
      throw new Error('Segment not found');
    }
    if (responseJson.data.userErrors && responseJson.data.userErrors.length > 0) {
      throw new Error(responseJson.data.userErrors[0].message);
    }

    const segment = responseJson.data.segment;
    if (!segment) {
      throw new Error('Segment not found');
    }

    return {
      id: segment.id,
      name: segment.name,
      query: segment.query,
    };
  } catch (error) {
    console.error('Error fetching segment details:', error);
    throw error;
  }
}

export async function deleteShopDiscountMetafield(admin: AdminApiContext, shopId: string, tag: string) {
  const query = `
    query getShopMetafield {
      shop {
        metafield(namespace: "${B2B_PLUS_NAMESPACE}", key: "${VOLUME_DISCOUNTS_KEY}") {
          id
          value
        }
      }
    }
  `;

  try {
    // Fetch the shop metafield
    const response = await admin.graphql(query);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseJson = await response.json();

    if ('errors' in responseJson || 'errors' in (responseJson.data || {})) {
      const errors = 'errors' in responseJson ? responseJson.errors : responseJson.data?.errors;
      throw new Error(`GraphQL errors: ${JSON.stringify(errors)}`);
    }

    const metafield = responseJson.data.shop.metafield;

    if (metafield && metafield.value) {
      let parsedValue;
      try {
        parsedValue = JSON.parse(metafield.value);
      } catch (error) {
        console.error('Error parsing metafield value:', error);
        return;
      }

      if (Array.isArray(parsedValue) && parsedValue.length > 0) {
        const index = parsedValue.findIndex(obj => obj.tag === tag);
        if (index !== -1) {
          // Remove the object from the array
          parsedValue.splice(index, 1);

          // Save the updated array back to the metafield
          const mutation = `
            mutation metafieldSet($input: MetafieldsSetInput!) {
              metafieldsSet(metafields: [$input]) {
                metafields {
                  id
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `;

          const variables = {
            input: {
              ownerId: shopId,
              namespace: B2B_PLUS_NAMESPACE,
              key: VOLUME_DISCOUNTS_KEY,
              value: JSON.stringify(parsedValue),
              type: "json"
            }
          };

          const mutationResponse = await admin.graphql(mutation, { variables });
          
          if (!mutationResponse.ok) {
            throw new Error(`HTTP error! status: ${mutationResponse.status}`);
          }

          const mutationJson = await mutationResponse.json();

          if (mutationJson.data.metafieldsSet.userErrors.length > 0) {
            throw new Error(`Error updating metafield: ${JSON.stringify(mutationJson.data.metafieldsSet.userErrors)}`);
          }

          console.log(`Successfully removed discount for tag: ${tag}`);
        } else {
          console.warn(`No discount found for tag: ${tag}`);
        }
      } else {
        console.warn('Metafield value is not an array or is empty');
      }
    } else {
      console.warn('No metafield found or metafield has no value');
    }
  } catch (error) {
    console.error('Error in deleteShopDiscountMetafield:', error);
    throw error;
  }
}

export async function deleteCollectionMetafield(admin: AdminApiContext, collectionId: string, tag: string) {
  var productsInCollection = await getProductIdsInCollection(admin, collectionId);
  if(productsInCollection) {
    for(var i in productsInCollection) {
      var currentId = ensureGidFormat(productsInCollection[i], 'Product');
      await deleteProductMetafield(admin, currentId, COLLECTION_DISCOUNTS_KEY);  
    }
  }

  return true;
}

export async function deleteProductMetafield(admin: AdminApiContext, productId: string, tag: string) {
  const mutation = `mutation metafieldDelete($ownerId: ID!, $key: String!) {
    metafieldsDelete(
      metafields: {ownerId: $ownerId, namespace: "${B2B_PLUS_NAMESPACE}", key: $key}
    ) {
      userErrors {
        field
        message
      }
      deletedMetafields {
        key
      }                
    }
  }`;

  const variables = {
    ownerId: productId,
    key: tag
  };

  const deleteMetafieldResponse = await admin.graphql(mutation, { variables });
  const deleteMetafieldData = await deleteMetafieldResponse.json();

  if (deleteMetafieldData.data.metafieldsDelete?.userErrors.length > 0) {
    console.error('Error deleting metafield for product:', productId, deleteMetafieldData.data.metafieldsDelete.userErrors);
    throw new Error('Failed to delete metafield for product');
  }

  return true;
}

export async function deleteVariantMetafield(admin: AdminApiContext, variantId: string, tag: string) {
    const mutation = `
    mutation metafieldDelete($ownerId: ID!, $key: String!) {
      metafieldsDelete(
        metafields: {ownerId: $ownerId, namespace: "${B2B_PLUS_NAMESPACE}", key: $key}
      ) {
        userErrors {
            field
            message
        }
        deletedMetafields {
          key
        }                
      }
    }`;

    const variables = {
      ownerId: variantId,
      key: tag
    };

    const deleteMetafieldResponse = await admin.graphql(
        mutation,
        { variables }
    );

    const deleteMetafieldData = await deleteMetafieldResponse.json();

    if (deleteMetafieldData.data.metafieldsDelete?.userErrors.length > 0) {
        console.error('Error deleting metafield for variant:', variantId, deleteMetafieldData.data.metafieldsDelete.userErrors);
        throw new Error('Failed to delete metafield for variant');
    }

    if (deleteMetafieldResponse.ok) {
      // Query to fetch the productVariant metafield
      const query = `
      query getProductVariantMetafield($variantId: ID!) {
        productVariant(id: $variantId) {
          metafield(namespace: "${B2B_PLUS_NAMESPACE}", key: "${VOLUME_DISCOUNTS_KEY}") {
            id
            value
          }
        }
      }
      `;
  
      const variables = { variantId };
  
      try {
        const response = await admin.graphql(query, { variables });

        if (response.ok) {
          const responseJson = await response.json();
          const productVariant = responseJson.data.productVariant;

          if (productVariant.metafield && productVariant.metafield?.value) {
            let metafieldValue;
            try {
              metafieldValue = JSON.parse(productVariant.metafield.value);
            } catch (error) {
              console.error('Error parsing metafield value:', error);
              return;
            }

            if (Array.isArray(metafieldValue) && metafieldValue.length > 0) {
              const index = metafieldValue.findIndex(element => element.tag === tag);

              if (index !== -1) {
                // Remove the element from the array
                metafieldValue.splice(index, 1);

                // Set the updated metafield
                const mutation = `
                mutation metafieldSet($input: MetafieldsSetInput!) {
                  metafieldsSet(metafields: [$input]) {
                    metafields {
                      id
                    }
                    userErrors {
                      field
                      message
                    }
                  }
                }
                `;

                const metafieldInput = {
                  namespace: B2B_PLUS_NAMESPACE,
                  key: VOLUME_DISCOUNTS_KEY,
                  value: JSON.stringify(metafieldValue),
                  type: "json",
                  ownerId: variantId
                };

                const setMetafieldResponse = await admin.graphql(mutation, {
                  variables: { input: metafieldInput }
                });

                if (!setMetafieldResponse.ok) {
                  console.error('Failed to update metafield:', setMetafieldResponse.status);
                } else {
                  const setMetafieldJson = await setMetafieldResponse.json();
                  if (setMetafieldJson.data.metafieldsSet.userErrors.length > 0) {
                    console.error('Errors updating metafield:', setMetafieldJson.data.metafieldsSet.userErrors);
                  } 
                }
              }
            }
          }
        } else {
          console.error('Failed to fetch product variant metafield:', response.status);
        }
      } catch (error) {
          console.error('Error processing product variant metafield:', error);
      }
  }
  
  return true;
}

export async function deleteMetafieldForAllActiveProducts(admin: AdminApiContext, key: string) {
  let hasNextPage = true;
  let cursor = null;
  let deletedCount = 0;

  while (hasNextPage) {
      const { products, pageInfo } = await fetchActiveProducts(admin, cursor);
      
      for (const product of products) {
          for (const variant of product.variants) {
              try {
                  await deleteVariantMetafield(admin, variant.id, key);
                  deletedCount++;
                  console.log(`Deleted metafield for variant ${variant.id}`);
                  
                  // Add a small delay to avoid hitting rate limits
                  await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
              } catch (error) {
                  console.error(`Failed to delete metafield for variant ${variant.id}:`, error);
              }
          }
      }

      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;
  }

  console.log(`Finished deleting metafields. Total deleted: ${deletedCount}`);
  return deletedCount;
}

async function fetchActiveProducts(admin: AdminApiContext, cursor: string | null) {
  const query = `
  query getActiveProducts($cursor: String, $first: Int!) {
      products(first: $first, after: $cursor, query: "status:active") {
          edges {
              node {
                  id
                  variants(first: 250) {
                      edges {
                          node {
                              id
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

  const variables = {
      first: PRODUCTS_PER_PAGE,
      cursor: cursor
  };

  const response = await admin.graphql(query, { variables });
  const data = await response.json();

  const products = data.data.products.edges.map((edge: any) => ({
      id: edge.node.id,
      variants: edge.node.variants.edges.map((variantEdge: any) => ({
          id: variantEdge.node.id
      }))
  }));

  return {
      products,
      pageInfo: data.data.products.pageInfo
  };
}

/**
 * Changing this function to query by input tag itself, which is possible in Shopify
 * Reference - https://shopify.dev/docs/apps/build/custom-data/metafields/query-by-metafield-value
 * 
 * It's working a bit faster now given I'm directly searching inside the metafield on root level
 * 
 * @param admin 
 * @param tag 
 * @returns 
 */
export async function groupHasIncludedProducts(admin: AdminApiContext, tag: string): Promise<boolean> {
  let hasNextPage = true;
  let cursor: string | null = null;
  let totalCount = 0;
  let retryCount = 0;
  const MAX_RETRIES = 3;

  while (hasNextPage) {
    var afterCursor = cursor ? `, after: "${cursor}"` : ``;
    try {
      const query = `
        query {
          productVariants(first: 100, query:"metafields.${B2B_PLUS_NAMESPACE}.${tag}:'included'" ${afterCursor}) {
            edges {
              node {
                id
                metafield(namespace: "${B2B_PLUS_NAMESPACE}", key: "${tag}") {
                  id
                  value
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

      const variables = {
        cursor,
        tag
      };

      const response = await admin.graphql(query, { variables });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json() as { data?: any, errors?: any[] };

      if ('errors' in data && data.errors) {
        console.error('GraphQL errors:', JSON.stringify(data.errors, null, 2));
        throw new Error('GraphQL errors occurred');
      }

      if (!data.data || !data.data.productVariants) {
        throw new Error('Unexpected response structure');
      }

      const variants = data.data.productVariants.edges.filter((edge: any) => (edge.node.metafield !== null && edge.node.metafield?.value === "included"));
      totalCount += variants.length;
      
      if(totalCount > 0) {
        return true;
      }

      hasNextPage = data.data.productVariants.pageInfo.hasNextPage;
      cursor = data.data.productVariants.pageInfo.endCursor;

      // Reset retry count on successful request
      retryCount = 0;

      // Add a small delay to avoid hitting rate limits
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error('Error fetching product variants:', error);

      if (retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`Retrying... Attempt ${retryCount} of ${MAX_RETRIES}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
        continue;
      }

      throw new Error(`Failed to fetch product variants after ${MAX_RETRIES} attempts: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return totalCount > 0;
}

export async function getProductVariantCounts(admin: AdminApiContext): Promise<number> {
  const query = `
    query {
      productVariantsCount {
        count
      }
    }
  `;

  try {
    const response = await admin.graphql(query);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json() as { 
      data?: { 
        productVariantsCount: { count: number }
      }, 
      errors?: any[] 
    };

    if ('errors' in data && data.errors) {
      console.error('GraphQL errors:', JSON.stringify(data.errors, null, 2));
      throw new Error('GraphQL errors occurred');
    }

    if (!data.data || !data.data.productVariantsCount) {
      throw new Error('Unexpected response structure');
    }

    return data.data.productVariantsCount.count;

  } catch (error) {
    console.error('Error fetching product variant count:', error);
    throw new Error(`Failed to fetch product variant count: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function setShopQuantityConfigMetafield(
  admin: AdminApiContext, 
  shopId: string, 
  tag: string, 
  quantityConfig: IQuantityConfig
) {
  const B2B_PLUS_NAMESPACE = "b2bplus";

  const metafieldInput = {
    namespace: B2B_PLUS_NAMESPACE,
    key: tag,
    value: JSON.stringify(quantityConfig),
    type: "json",
    ownerId: shopId
  };

  const mutation = `
  mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
        value
      }
      userErrors {
        field
        message
      }
    }
  }`;

  try {
    const response = await admin.graphql(
      mutation,
      {
        variables: {
          metafields: [metafieldInput]
        }
      }
    );

    const responseJson = await response.json();
    //await sendSlackNotification(`Response for setShopQuantityConfigMetafield function - ${JSON.stringify(responseJson.data)}`);

    if (responseJson.data.metafieldsSet.userErrors.length > 0) {
      console.error('Error setting metafield:', responseJson.data.metafieldsSet.userErrors);
      throw new Error('Failed to set shop quantity config metafield');
    }

    return responseJson.data.metafieldsSet.metafields[0];
  } catch (error) {
    console.error('Error in setShopQuantityConfigMetafield:', error);
    throw error;
  }
}

export async function removeShopQuantityConfigMetafield(
  admin: AdminApiContext,
  shopId: string,
  tag: string
) {
  const B2B_PLUS_NAMESPACE = "b2bplus";

  const mutation = `
  mutation metafieldDelete($input: MetafieldDeleteInput!) {
    metafieldDelete(input: $input) {
      deletedId
      userErrors {
        field
        message
      }
    }
  }`;

  const variables = {
    input: {
      ownerId: shopId,
      namespace: B2B_PLUS_NAMESPACE,
      key: tag
    }
  };

  try {
    const response = await admin.graphql(mutation, { variables });
    const responseJson = await response.json();

    if (responseJson.data.metafieldDelete.userErrors.length > 0) {
      console.error('Error deleting metafield:', responseJson.data.metafieldDelete.userErrors);
      throw new Error('Failed to delete shop quantity config metafield');
    }

    return responseJson.data.metafieldDelete.deletedId;
  } catch (error) {
    console.error('Error in removeShopQuantityConfigMetafield:', error);
    throw error;
  }
}

export async function getShopQuantityConfigMetafield(
  admin: AdminApiContext,
  shopId: string,
  tag: string
): Promise<IQuantityConfig> {
  const B2B_PLUS_NAMESPACE = "b2bplus";

  const query = `
  query getShopMetafield($namespace: String!, $key: String!) {
    shop {
      metafield(namespace: $namespace, key: $key) {
        id
        value
      }
    }
  }`;

  const variables = {
    namespace: B2B_PLUS_NAMESPACE,
    key: tag
  };

  const defaultConfig: IQuantityConfig = {
    increment: '',
    minimum: '',
    maximum: ''
  };

  try {
    const response = await admin.graphql(query, { variables });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseJson = await response.json();

    if (responseJson.data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(responseJson.data.errors)}`);
    }

    const metafield = responseJson.data.shop.metafield;

    if (metafield && metafield.value) {
      try {
        const parsedValue = JSON.parse(metafield.value);
        return {
          ...defaultConfig,
          ...parsedValue
        };
      } catch (error) {
        console.error('Error parsing metafield value:', error);
        return defaultConfig;
      }
    }

    return defaultConfig;
  } catch (error) {
    console.error('Error fetching shop quantity config metafield:', error);
    throw error;
  }
}
export async function getCustomerSegments(admin: any) {

  const query = `
    query {
      segments(first: 250) {
        edges {
          node {
            id
            name
            query
          }
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(query);
    const responseJson = await response.json();

    if(responseJson.data.segments.edges && Array.isArray(responseJson.data.segments.edges)) {
      if( responseJson.data.segments.edges.length > 0) {
        return responseJson.data.segments.edges.map((edge: any) => edge.node);
      } else {
        return [];
      }
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error fetching customer segments:', error);
    throw error;
  }
}
