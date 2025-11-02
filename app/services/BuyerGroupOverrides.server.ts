import prisma from "../db.server";
import { authenticate } from "~/shopify.server";
import { getCollectionInfo, type ProductInfo } from "~/services/ComplementaryProducts.server";

import type {
  AdminApiContext,
  UnauthenticatedAdminContext,
} from "@shopify/shopify-app-remix/server";

// Dedicated function for BuyerGroup to get correct variant prices
async function getProductInfoForBuyerGroup(
  admin: AdminApiContext | UnauthenticatedAdminContext,
  variantIds: string[]
): Promise<Record<string, ProductInfo>> {
  if (!variantIds.length) {
    return {};
  }

  // Filter out invalid IDs and deduplicate
  const validVariantIds = [...new Set(variantIds.filter(id => 
    id && typeof id === 'string' && id.startsWith('gid://shopify/ProductVariant/')
  ))];

  if (!validVariantIds.length) {
    return {};
  }

  const productInfoMap: Record<string, ProductInfo> = {};

  // Shopify has a limit on the number of IDs in a single nodes query
  // Let's chunk them into smaller batches to avoid hitting limits
  const CHUNK_SIZE = 100;
  const chunks = [];
  for (let i = 0; i < validVariantIds.length; i += CHUNK_SIZE) {
    chunks.push(validVariantIds.slice(i, i + CHUNK_SIZE));
  }

  // Process each chunk
  for (const chunk of chunks) {
    const query = `
      query($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            id
            title
            price
            image {
              url
            }
            product {
              id
              title
              description
              onlineStorePreviewUrl
              status
              priceRange {
                minVariantPrice {
                  amount,
                  currencyCode
                }
              }
              images(first: 1) {
                edges {
                  node {
                    url
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response = 'graphql' in admin 
        ? await admin.graphql(query, { variables: { ids: chunk } }) 
        : await admin.admin.graphql(query, { variables: { ids: chunk } });
      
      if (!response.ok) {
        console.error(`GraphQL query failed for chunk: ${response.statusText}`);
        continue; // Skip this chunk but continue with others
      }

      const result = await response.json() as any;
      
      if (result.errors) {
        console.error("GraphQL errors for chunk:", result.errors);
        continue; // Skip this chunk but continue with others
      }

      // Process only the variants we requested
      result.data.nodes.forEach((node: any) => {
        if (!node || !chunk.includes(node.id)) return;

        const variantImage = node.image?.url;
        const productImage = node.product.images.edges[0]?.node.url;
        
        const productTitle = node.product.title;
        const variantTitle = node.title;
        
        let title;
        if (variantTitle && variantTitle !== "Default Title") {
          title = `${productTitle}: ${variantTitle}`;
        } else {
          title = productTitle;
        }
        
        const rawPrice = node.price || '0';
        
        // Smart price parsing (dollars/cents)
        let parsedPrice;
        if (rawPrice.includes('$') || rawPrice.includes('.')) {
          const numericValue = parseFloat(rawPrice.replace(/[$,]/g, ''));
          parsedPrice = numericValue;
        } else {
          const numericValue = parseFloat(rawPrice);
          if (numericValue > 1000) {
            parsedPrice = numericValue / 100;
          } else {
            parsedPrice = numericValue;
          }
        }
        
        productInfoMap[node.id] = {
          image: variantImage || productImage || '',
          description: node.product.description || '',
          previewUrl: node.product.onlineStorePreviewUrl || '',
          status: node.product.status || '',
          title: title,
          productTitle: productTitle,
          variantTitle: variantTitle !== "Default Title" ? variantTitle : null,
          price: new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: node.product.priceRange.minVariantPrice.currencyCode || 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }).format(parsedPrice),
          productId: node.product.id
        };
      });

    } catch (error) {
      console.error("Error fetching product info for buyer group chunk:", error);
      // Continue with other chunks instead of failing completely
      continue;
    }
  }

  return productInfoMap;
}

export async function getGroupOverrides(segmentId: string, request: Request) {
  let mergedProductOverrides: any[] = [];
  let mergedCollectionOverrides: any[] = [];
  let groupData = null;
  if (segmentId) {
    const data = await prisma.shopSegmentsData.findMany({
      where: {
        segmentId,
        tagID: { not: null },
      },
      select: {
        id: true,
        segmentName: true,
        segmentId: true,
        tagID: true,
        description: true,
        defaultDiscount: true,
        defaultMOQ: true,
        paymentMethods: true,
        productDiscounts: true,
        collectionDiscounts: true,
        storeDiscounts: true,
        buyers: {
          select: {
            customerId: true,
            customerName: true,
          },
        },
      },
    });
    groupData = data[0] || null;
    let productOverrides: any[] = Array.isArray(groupData?.productDiscounts)
      ? groupData.productDiscounts
      : [];
    let collectionOverrides: any[] = Array.isArray(
      groupData?.collectionDiscounts,
    )
      ? groupData.collectionDiscounts
      : [];
    const productIds = productOverrides
      .map((o: any) => o.variantId || o.productId || o.id)
      .filter(
        (id: string) =>
          id && typeof id === "string" && id.startsWith("gid://shopify/"),
      );
    const collectionIds = collectionOverrides
      .map((o: any) => {
        if (typeof o.id === "string" && o.id.startsWith("override_")) {
          const lastUnderscore = o.id.lastIndexOf("_gid://shopify/");
          if (lastUnderscore !== -1) {
            return o.id.substring(lastUnderscore + 1);
          }
        }
        return o.id;
      })
      .filter(
        (id: string) =>
          id && typeof id === "string" && id.startsWith("gid://shopify/"),
      );
    //console.log('collectionIds:', collectionIds);
    const admin = await authenticate.admin(request);
    const productInfoMap = await getProductInfoForBuyerGroup(admin, productIds);
    const collectionInfoMap = await getCollectionInfo(admin, collectionIds);
    //console.log('collectionInfoMap:', collectionInfoMap);
    mergedProductOverrides = productOverrides.map((override: any) => {
      const productInfo = productInfoMap[override.id] || {};
      return {
        ...override,
        ...productInfo,
        productId: productInfo.productId || override.productId || override.id,
        appliesTo: "products",
      };
    });
    mergedCollectionOverrides = collectionOverrides.map((override: any) => {
      // Extract the Shopify GID from the id if it is prefixed (e.g., 'override_..._gid://shopify/Collection/123')
      let shopifyId = override.id;
      if (typeof shopifyId === "string" && shopifyId.startsWith("override_")) {
        const lastUnderscore = shopifyId.lastIndexOf("_gid://shopify/");
        if (lastUnderscore !== -1) {
          shopifyId = shopifyId.substring(lastUnderscore + 1);
        }
      }
      const enrichment = collectionInfoMap[shopifyId];
      //console.log('Enriching collection override:', { id: override.id, shopifyId, enrichment });
      return {
        ...override,
        ...enrichment,
        appliesTo: "collections",
        type: "collection",
      };
    });
  }
  return { mergedProductOverrides, mergedCollectionOverrides };
}
