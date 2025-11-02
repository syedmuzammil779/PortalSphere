import { uuidv7 } from 'uuidv7';
import prisma from '../db.server';
import { getShopId, getShopIdManual, getUnauthenticatedShopId } from './Settings.server';
import type { Prisma } from '@prisma/client';
import type { AdminApiContext, UnauthenticatedAdminContext } from '@shopify/shopify-app-remix/server';
import { sendSlackNotification } from './CustomFunctions.server';
import { ensureGidFormat } from './ProductVolumePriceConfig.server';

type SortOrder = 'asc' | 'desc';

export interface ProductInfo {
  image: string;
  description: string;
  previewUrl: string;
  status: string;
  title: string;
  productTitle: string;
  variantTitle: string | null;
  price: string;
  productId?: string; // <-- allow productId for grouping
}

export interface UnassignedProductVariant {
  id: string;
  productVariantId: string;
  productTitle: string;
  productInfo: ProductInfo;
}

export interface AssignedProductVariant extends UnassignedProductVariant {
  complementaryProductVariantId: string;
  complementaryProductInfo: ProductInfo;
}

export interface ComplementaryProductsCounts {
  assigned: number;
  unassigned: number;
  total: number;
}

export const isComplementaryProductsInitialized = async (
    admin: AdminApiContext,
): Promise<boolean> => {
    try {
        const query = `
            query {
                shop {
                    metafields(
                        keys: ["b2bplus.isComplementaryProductsInitialized"]
                        first: 10
                    ) {
                        edges {
                            node {
                                key
                                value
                            }
                        }
                    }
                }
            }
        `;
        const response = await admin.graphql(query);
        const result = await response.json() as any;
        const metafields = result.data.shop.metafields.edges.map(
            (edge: { node: { key: string, value: string } }) => edge.node
        );
        const hasInitialized = metafields.some(
            (m: { key: string; value: string }) => 
                m.key === "b2bplus.isComplementaryProductsInitialized" && 
                m.value.toLowerCase() === "true"
        );

        return hasInitialized;
    } catch (error) {
        console.error('Error checking complementary products initialization:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw error;
    }
};

// Add this function to check/set initialization lock
const getInitializationLock = async (admin: AdminApiContext, shopId: string): Promise<boolean> => {
  const lockKey = `complementaryProductsInitLock_${shopId}`;
  const query = `
    query {
      shop {
        metafields(
          keys: ["b2bplus.${lockKey}"]
          first: 1
        ) {
          edges {
            node {
              value
            }
          }
        }
      }
    }
  `;

  try {
    // First check if lock exists and is active
    const response = await admin.graphql(query);
    const result = await response.json();
    const lockExists = result.data.shop.metafields.edges.length > 0 && 
                      result.data.shop.metafields.edges[0].node.value === "true";

    if (lockExists) {
      return false;
    }

    // If no active lock, try to acquire it
    const mutation = `
      mutation createMetafield($input: MetafieldsSetInput!) {
        metafieldsSet(metafields: [$input]) {
          metafields {
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

    const metafieldInput = {
      namespace: "b2bplus",
      key: lockKey,
      value: "true",
      type: "boolean",
      ownerId: shopId
    };

    const lockResponse = await admin.graphql(mutation, { variables: { input: metafieldInput } });
    const lockResult = await lockResponse.json();
    return !lockResult.data.metafieldsSet.userErrors.length;
  } catch (error) {
    console.error("Error setting initialization lock:", error);
    return false;
  }
};

// Add this function to release the lock
const releaseInitializationLock = async (admin: AdminApiContext, shopId: string): Promise<void> => {
  const lockKey = `complementaryProductsInitLock_${shopId}`;
  const mutation = `
    mutation createMetafield($input: MetafieldsSetInput!) {
      metafieldsSet(metafields: [$input]) {
        metafields {
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

  const metafieldInput = {
    namespace: "b2bplus",
    key: lockKey,
    value: "false",
    type: "boolean",
    ownerId: shopId
  };

  try {
    await admin.graphql(mutation, { variables: { input: metafieldInput } });
  } catch (error) {
    console.error("Error releasing initialization lock:", error);
  }
};

// Modify the initialization function
export const initializeComplementaryProducts = async (
  admin: AdminApiContext
): Promise<void> => {
    try {
        let shopId = await getShopId(admin);
        if (!shopId.startsWith('gid://')) {
            shopId = `gid://shopify/Shop/${shopId}`;
        }

        // Try to acquire the lock with shop ID
        const lockAcquired = await getInitializationLock(admin, shopId);
        if (!lockAcquired) {
            console.log(`Another initialization process is already running for shop ${shopId}`);
            return;
        }

        try {
            // Delete existing data
            await prisma.complementaryProducts.deleteMany({
                where: { shop: shopId }
            });

            // Fetch and process products
            let hasNextPage = true;
            let cursor = null;
            const allProducts: any[] = [];

            const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

            async function fetchWithRetry(query: string, variables: any, retries = 3) {
                for (let attempt = 0; attempt < retries; attempt++) {
                    try {
                        // Random delay between 1-3 seconds between requests
                        const delay = 1000 + Math.random() * 2000;
                        await sleep(delay);

                        const response = await admin.graphql(query, { variables });
                        console.log("fetchWithRetry:", variables);
                        return await response.json();
                    } catch (error: any) {
                        // Check if it's a throttling error (status 429)
                        if (error.response?.status === 429) {
                            console.log(`Rate limited, attempt ${attempt + 1} of ${retries}`);
                            // Exponential backoff with jitter
                            const backoff = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 10000);
                            await sleep(backoff);
                            continue;
                        }
                        throw error;
                    }
                }
                throw new Error('Max retries reached');
            }

            while (hasNextPage) {
                try {
                    const query = `
                        query($cursor: String) {
                            products(first: 250, after: $cursor) {
                                pageInfo {
                                    hasNextPage
                                    endCursor
                                }
                                edges {
                                    node {
                                        id
                                        title
                                        variants(first: 250) {
                                            edges {
                                                node {
                                                    id
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    `;

                    const result = await fetchWithRetry(query, { cursor });

                    if (result.data.products.edges?.length > 0) {
                        allProducts.push(...result.data.products.edges.map((edge: any) => edge.node));
                    }

                    hasNextPage = result.data.products.pageInfo.hasNextPage;
                    cursor = result.data.products.pageInfo.endCursor;
                } catch (error) {
                    console.error('Error fetching products batch:', error);
                    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
                    break;
                }
            }

            // Process and insert data
            const seenVariantIds = new Set<string>();
            const complementaryProducts = allProducts.flatMap((product) => 
                product.variants.edges
                    .filter((variant: any) => !seenVariantIds.has(variant.node.id))
                    .map((variant: any) => {
                        seenVariantIds.add(variant.node.id);
                        return {
                            id: uuidv7(),
                            shop: shopId,
                            productVariantId: variant.node.id,
                            complementaryProductVariantId: null,
                            productTitle: product.title,
                        };
                    })
            );

            // Insert in batches
            const batchSize = 1000;
            for (let i = 0; i < complementaryProducts.length; i += batchSize) {
                const batch = complementaryProducts.slice(i, i + batchSize);
                await prisma.complementaryProducts.createMany({
                    data: batch,
                });
            }

            await setInitializationFlag(admin);
        } finally {
            await releaseInitializationLock(admin, shopId);
        }
    } catch (error) {
        console.error('Error initializing complementary products:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw error;
    }
};

const setInitializationFlagFalse = async (admin: AdminApiContext): Promise<void> => {
  const mutation = `
    mutation createMetafield($input: MetafieldsSetInput!) {
      metafieldsSet(metafields: [$input]) {
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

  const metafieldInput = {
    namespace: "b2bplus",
    key: "isComplementaryProductsInitialized",
    value: "false",
    type: "boolean",
    ownerId: await getShopId(admin)
  };

  try {
    const response = await admin.graphql(
      mutation,
      {
        variables: {
          input: metafieldInput
        }
      }
    );

    const result = await response.json();
    console.log("Metafield creation result:", JSON.stringify(result.data));

    if (result.data.metafieldsSet.userErrors.length > 0) {
      console.error("Errors creating metafield:", result.data.metafieldsSet.userErrors);
      throw new Error("Failed to create metafield");
    }
  } catch (error) {
    console.error("Error creating metafield:", error);
    throw error;
  }
};

const setInitializationFlag = async (admin: AdminApiContext): Promise<void> => {
  const mutation = `
    mutation createMetafield($input: MetafieldsSetInput!) {
      metafieldsSet(metafields: [$input]) {
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

  const metafieldInput = {
    namespace: "b2bplus",
    key: "isComplementaryProductsInitialized",
    value: "true",
    type: "boolean",
    ownerId: await getShopId(admin)
  };

  try {
    const response = await admin.graphql(
      mutation,
      {
        variables: {
          input: metafieldInput
        }
      }
    );

    const result = await response.json();
    console.log("Metafield creation result:", JSON.stringify(result.data));

    if (result.data.metafieldsSet.userErrors.length > 0) {
      console.error("Errors creating metafield:", result.data.metafieldsSet.userErrors);
      throw new Error("Failed to create metafield");
    }
  } catch (error) {
    console.error("Error creating metafield:", error);
    throw error;
  }
};

export const addComplementaryProduct = async (
  admin: any,
  shop: any,
  variantInfo: any
): Promise<boolean> => {
  var productVariantId = variantInfo.admin_graphql_api_id;

  if(!productVariantId) return true;
  if(!variantInfo.name) return true;

  productVariantId = ensureGidFormat(productVariantId, 'ProductVariant');

  const existingProduct = await prisma.complementaryProducts.findFirst({
    where: {
      shop: shop.shopId,
      productVariantId: productVariantId
    }
  });

  if (existingProduct) {
    return false;
  }

  await prisma.complementaryProducts.create({
    data: {
      id: uuidv7(),
      shop: shop.shopId,
      productVariantId: productVariantId,
      complementaryProductVariantId: null,
      productTitle: variantInfo.name
    }
  });

  return true;
};

export const deleteComplementaryProduct = async (
  admin: any,
  shop: any,
  productVariantId: string
): Promise<void> => {
  const shopId = shop.shopId;
  
  await prisma.complementaryProducts.deleteMany({
    where: {
      shop: shopId,
      productVariantId: productVariantId
    }
  });
      
  return;  
};

export const updateComplementaryProductTitle = async (
  admin: any,
  shop: any,
  variantInfo: any
): Promise<boolean> => {
  var productVariantId = variantInfo.admin_graphql_api_id;

  if(!productVariantId) return false;

  productVariantId = ensureGidFormat(productVariantId, 'ProductVariant');
  
  await prisma.complementaryProducts.updateMany({
    where: { shop: shop.shopId, productVariantId: productVariantId },
    data: { productTitle: variantInfo.title }
  });
  
  return true;
};

export const resetComplementaryProducts = async (
  admin: AdminApiContext
): Promise<void> => {
  const shopId = await getShopId(admin);
  // First delete all complementary products
  //await deleteAllComplementaryProducts(shopId); //Why delete? Let's just make the complementaryProductId null, that's it
  
  await eraseAllComplementaryProductIds(shopId);
  // Then set the initialization flag to false
  await setInitializationFlagFalse(admin);
};  

export const replaceComplementaryProductVariant = async (
  admin: AdminApiContext,
  productVariantId: string,
  newComplementaryProductVariantId: string | null
): Promise<boolean> => {
  // Get the shop ID
  const shopId = await getShopId(admin);
  console.log("Replacing complementary product variant for product variant ID:", productVariantId);
  console.log("New complementary product variant ID:", newComplementaryProductVariantId);
  // Convert variant IDs to Shopify global ID format
  const globalComplementaryProductVariantId = newComplementaryProductVariantId 
    ? (newComplementaryProductVariantId.startsWith('gid://') 
      ? newComplementaryProductVariantId 
      : `gid://shopify/ProductVariant/${newComplementaryProductVariantId}`)
    : null;

  // Update the complementary product entry
  const updatedProduct = await prisma.complementaryProducts.updateMany({
    where: {
      shop: shopId,
      id: productVariantId,
    },
    data: {
      complementaryProductVariantId: globalComplementaryProductVariantId,
    },
  });

  if (updatedProduct.count > 0) {
    return true;
  } else {
    console.log(`No complementary product found for variant ID: ${productVariantId}`);
    return false;
  }
};

export const getUnassignedProductVariants = async (
  admin: AdminApiContext,
  page: number = 1,
  pageSize: number = 20,
  searchTitle: string = '',
  sortBy: string = 'productTitle',
  sortOrder: SortOrder = 'asc'
): Promise<{ data: UnassignedProductVariant[], total: number }> => {
  const shopId = await getShopId(admin);

  // Calculate offset for pagination
  const skip = (page - 1) * pageSize;

  // Prepare the where clause
  let where: Prisma.ComplementaryProductsWhereInput = {
    shop: shopId,
    complementaryProductVariantId: null,
  };

  // Add case-insensitive title search if provided
  if (searchTitle) {
    where = {
      ...where,
      productTitle: {
        contains: searchTitle,
        mode: 'insensitive',
      },
    };
  }

  // Get total count
  const total = await prisma.complementaryProducts.count({ where });

  // Fetch paginated results
  const complementaryProducts = await prisma.complementaryProducts.findMany({
    where,
    skip,
    take: pageSize,
    orderBy: {
      [sortBy]: sortOrder,
    },
  });

  // Fetch additional product information from Shopify
  const productVariantIds = complementaryProducts.map(cp => cp.productVariantId);
  const productInfoMap = await getProductInfo(admin, productVariantIds);

  // Combine Prisma results with Shopify data
  const data: UnassignedProductVariant[] = complementaryProducts.map(cp => ({
    id: cp.id,
    productVariantId: cp.productVariantId,
    productTitle: cp.productTitle,
    productInfo: productInfoMap[cp.productVariantId] || {
      image: '',
      description: '',
      previewUrl: '',
      status: '',
    },
  }));

  return { data, total };
};

export async function getProductInfo(
  admin: AdminApiContext | UnauthenticatedAdminContext,
  variantIds: string[]
): Promise<Record<string, ProductInfo>> {
  const query = `
    query($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          id
          title
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

  const response = 'graphql' in admin 
    ? await admin.graphql(query, { variables: { ids: variantIds } }) 
    : await admin.admin.graphql(query, { variables: { ids: variantIds } });
  const result = await response.json() as any;

  const productInfoMap: Record<string, ProductInfo> = {};
  result.data.nodes.forEach((node: any) => {
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
      }).format(parseFloat(node.product.priceRange.minVariantPrice.amount || '0')),
      productId: node.product.id // <-- add parent productId for grouping
    };
  });

  return productInfoMap;
}

export const getAssignedProductVariants = async (
  admin: AdminApiContext,
  page: number = 1,
  pageSize: number = 20,
  searchTitle: string = '',
  sortBy: string = 'productTitle',
  sortOrder: SortOrder = 'asc'
): Promise<{ data: AssignedProductVariant[], total: number }> => {
  const shopId = await getShopId(admin);

  // Calculate offset for pagination
  const skip = (page - 1) * pageSize;

  // Prepare the where clause
  let where: Prisma.ComplementaryProductsWhereInput = {
    shop: shopId,
    complementaryProductVariantId: {
      not: null
    },
  };

  // Add case-insensitive title search if provided
  if (searchTitle) {
    where = {
      ...where,
      productTitle: {
        contains: searchTitle,
        mode: 'insensitive',
      },      
    };
  }

  // Get total count
  const total = await prisma.complementaryProducts.count({ where });

  // Fetch paginated results
  const complementaryProducts = await prisma.complementaryProducts.findMany({
    where,
    skip,
    take: pageSize,
    orderBy: {
      [sortBy]: sortOrder,
    },
  });

  // Fetch additional product information from Shopify
  const productVariantIds = complementaryProducts.map(cp => cp.productVariantId);
  const complementaryProductVariantIds = complementaryProducts.map(cp => cp.complementaryProductVariantId!);
  const allVariantIds = [...productVariantIds, ...complementaryProductVariantIds];
  const productInfoMap = await getProductInfo(admin, allVariantIds);  

  // Combine Prisma results with Shopify data
  const data: AssignedProductVariant[] = complementaryProducts.map(cp => ({
    id: cp.id,
    productVariantId: cp.productVariantId,
    productTitle: cp.productTitle,
    complementaryProductVariantId: cp.complementaryProductVariantId!,
    productInfo: productInfoMap[cp.productVariantId] || {
      image: '',
      description: '',
      previewUrl: '',
      status: '',
      title: null,
    },
    complementaryProductInfo: productInfoMap[cp.complementaryProductVariantId!] || {
      image: '',
      description: '',
      previewUrl: '',
      status: '',
      title: null,
    },
  }));

  return { data, total };
};

export const getComplementaryProductsCounts = async (admin: AdminApiContext): Promise<ComplementaryProductsCounts> => {
  
  const shopId = await getShopId(admin);

  const [assigned, unassigned] = await Promise.all([
    prisma.complementaryProducts.count({
      where: {
        shop: shopId,
        complementaryProductVariantId: {
          not: null
        }
      }
    }),
    prisma.complementaryProducts.count({
      where: {
        shop: shopId,
        complementaryProductVariantId: null
      }
    })
  ]);

  const total = assigned + unassigned;

  return {
    assigned,
    unassigned,
    total
  };
};

export const getComplementaryProductWithConfig = async (
  admin: UnauthenticatedAdminContext,
  productVariantId: string
): Promise<AssignedProductVariant | null> => {
  let shopId = await getUnauthenticatedShopId(admin);
  if (!shopId.startsWith('gid://')) {
    shopId = `gid://shopify/Shop/${shopId}`;
  }
  //console.debug('getComplementaryProduct');
  //console.debug('shopId', shopId);
  //console.debug('productVariantId', productVariantId);
  const complementaryProduct = await prisma.complementaryProducts.findFirst({
    where: {
      shop: shopId,
      productVariantId: productVariantId
    }
  });

  if (!complementaryProduct) {
    return null;
  }

  const volumePricingConfig = await prisma.volumePricingData.findFirst({
    where: {
      productVariantId: complementaryProduct.complementaryProductVariantId!,
    },
  });

  const productInfoMap = await getProductInfo(admin, [
    complementaryProduct.productVariantId,
    complementaryProduct.complementaryProductVariantId!
  ]);

  if (volumePricingConfig && volumePricingConfig.returnData) {
    productInfoMap[complementaryProduct.complementaryProductVariantId!]["volumePricingData"] = volumePricingConfig.returnData
  }

  return {
    id: complementaryProduct.id,
    productVariantId: complementaryProduct.productVariantId,
    productTitle: complementaryProduct.productTitle,
    complementaryProductVariantId: complementaryProduct.complementaryProductVariantId!,
    productInfo: productInfoMap[complementaryProduct.productVariantId] || {
      image: '',
      description: '',
      previewUrl: '',
      status: '',
      title: '',
      productTitle: '',
      variantTitle: null,
    },
    complementaryProductInfo: productInfoMap[complementaryProduct.complementaryProductVariantId!] || {
      image: '',
      description: '',
      previewUrl: '',
      status: '',
      title: '',
      productTitle: '',
      variantTitle: null,
    },
  };
};

export const getComplementaryProduct = async (
  admin: UnauthenticatedAdminContext,
  productVariantId: string
): Promise<AssignedProductVariant | null> => {
  let shopId = await getUnauthenticatedShopId(admin);
  shopId = ensureGidFormat(shopId, 'Shop');
  
  const complementaryProduct = await prisma.complementaryProducts.findFirst({
    where: {
      shop: shopId,
      productVariantId: productVariantId
    }
  });

  if (!complementaryProduct) {
    return null;
  }

  const productInfoMap = await getProductInfo(admin, [
    complementaryProduct.productVariantId,
    complementaryProduct.complementaryProductVariantId!
  ]);

  return {
    id: complementaryProduct.id,
    productVariantId: complementaryProduct.productVariantId,
    productTitle: complementaryProduct.productTitle,
    complementaryProductVariantId: complementaryProduct.complementaryProductVariantId!,
    productInfo: productInfoMap[complementaryProduct.productVariantId] || {
      image: '',
      description: '',
      previewUrl: '',
      status: '',
      title: '',
      productTitle: '',
      variantTitle: null,
    },
    complementaryProductInfo: productInfoMap[complementaryProduct.complementaryProductVariantId!] || {
      image: '',
      description: '',
      previewUrl: '',
      status: '',
      title: '',
      productTitle: '',
      variantTitle: null,
    },
  };
};

export const eraseAllComplementaryProductIds = async (
  shopId: string
): Promise<boolean> => {
  const formattedShopId = ensureGidFormat(shopId, 'Shop');
  await prisma.complementaryProducts.updateMany({
    where:{ shop: formattedShopId },
    data: { complementaryProductVariantId: null }
  });

  return true;
}

export const deleteAllComplementaryProducts = async (
  shopId: string
): Promise<number> => {
  // Ensure shopId is in the correct format
  const formattedShopId = shopId.startsWith('gid://') 
    ? shopId 
    : `gid://shopify/Shop/${shopId}`;

  // Delete all records for the shop
  const result = await prisma.complementaryProducts.deleteMany({
    where: {
      shop: formattedShopId
    }
  });

  //console.debug(`Deleted ${result.count} complementary products for shop: ${formattedShopId}`);
  return result.count;
};

export async function getCollectionInfo(
  admin: AdminApiContext | UnauthenticatedAdminContext,
  collectionIds: string[]
): Promise<Record<string, { title: string; image: string; description: string }>> {
  if (!collectionIds.length) return {};
  const query = `
    query($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Collection {
          id
          title
          description
          image {
            url
          }
        }
      }
    }
  `;
  const response = 'graphql' in admin
    ? await admin.graphql(query, { variables: { ids: collectionIds } })
    : await admin.admin.graphql(query, { variables: { ids: collectionIds } });
  const result = await response.json() as any;
  const collectionInfoMap: Record<string, { title: string; image: string; description: string }> = {};
  result.data.nodes.forEach((node: any) => {
    if (!node) return;
    collectionInfoMap[node.id] = {
      title: node.title || '',
      image: node.image?.url || '',
      description: node.description || '',
    };
  });
  return collectionInfoMap;
}

