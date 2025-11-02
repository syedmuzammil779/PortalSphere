import { uuidv7 } from "uuidv7";
import type { AdminApiContext, UnauthenticatedAdminContext } from "@shopify/shopify-app-remix/server";
import { getSettings, getShopId } from "./Settings.server";
import { GraphqlClient } from "@shopify/shopify-api";
import { getProductVariantVolumePriceConfig } from "./ProductVolumePriceConfig.server";
export interface ProductInfo {
    title: string;
    description: string;
    url: string;
    image: string;
    amount: number;
    currency: string;
    tracksInventory: Boolean|null|undefined;
    inventory: number|null|undefined;
    variants: {
        id: string;
        title: string;
    }[];
    variantTitle: string;
    price: string;
}
interface MetafieldNode {
    id: string;
    key: string;
    value: string;
    namespace: string;
}
export interface TopProduct {
    id: string,
    productId: string | null,
    productVariantId: string | null,
    rank: number,
    productInfo: ProductInfo | null,
    variantIds: (any)[],
    variantsConfiguration: any|null
}
  
interface GraphQLResponse {
    data: {
        shop: {
        metafields: {
            edges: Array<{
            node: MetafieldNode;
            }>;
        };
        };
    };
}

export const getVariantAndPriceConfig = async (admin: AdminApiContext|UnauthenticatedAdminContext, variantId: string, tag: string) => {
    const query = `
        query getVariantWithProduct($id: ID!) {
            productVariant(id: $id) {
                id
                title
                sku
                price
                compareAtPrice
                availableForSale
                selectedOptions {
                    name
                    value
                }
                product {
                    id
                    title
                    handle
                    descriptionHtml
                    featuredImage {
                        url
                        altText
                    }
                }
            }
        }
    `;   

    const response = 'graphql' in admin ? await admin.graphql(query, {variables: {id: variantId}}) : await admin.admin.graphql(query, {variables: {id: variantId}});
    const responseJson = await response.json();

    const variantLevelPriceConfig = await getProductVariantVolumePriceConfig(admin, variantId, tag);
    return {
        variantInfo: responseJson.data.productVariant,
        priceConfig: variantLevelPriceConfig
    }
}

export const isTopProductsInitialized = async (
    admin: AdminApiContext,
): Promise<boolean> => {
    try {
        const query = `query {
            shop {
                metafields(
                    keys: ["b2bplus.topProductsList"]
                    first: 10
                ) { edges { node { key } } }
            }
        }`;

        const response = await admin.graphql(query);
        const result = await response.json() as GraphQLResponse;
        const metafields: MetafieldNode[] = result.data.shop.metafields.edges.map(
            (edge) => edge.node
        );
        
        const hasTopProductsList = metafields.some(
            (m) => m.key === "b2bplus.topProductsList"
        );

        return hasTopProductsList;
    } catch (error) {
        console.error('Error checking top products initialization:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw error;
    }
};

export const initializeTopProducts = async (admin: AdminApiContext) => {
    try {
        const topProductsArray = Array.from({ length: 10 }, (_, i) => ({
            id: uuidv7(),
            productId: null,
            variantId: null,
            rank: i + 1
        }));
        const shopId = await getShopId(admin);

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
    
        const metafields = [{
            namespace: "b2bplus",
            key: "topProductsList",
            value: JSON.stringify(topProductsArray),
            type: "json",
            ownerId: shopId
        }];
    
        const response = await admin.graphql(
            mutation,
            {
                variables: {
                    metafields: metafields
                }
            }
        );
    
        const result = await response.json();
    
        if (result.data.metafieldsSet.userErrors.length > 0) {
            throw new Error(`Failed to create metafields: ${JSON.stringify(result.data.metafieldsSet.userErrors)}`);
        }
    } catch (error) {
        console.error('Error initializing top products:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw error;
    }
};

export const resequenceTopProducts = async (admin: AdminApiContext, data: TopProduct[]) => {
    try {
        const tosave = data.map((x: TopProduct, index: number) => ({ 
            id: x.id,
            rank: index + 1,
            productId: x.productId,
            productVariantId: x.productVariantId
        }));

        const mutation = `
            mutation updateMetafield($input: MetafieldsSetInput!) {
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
            key: "topProductsList",
            value: JSON.stringify(tosave),
            type: "json",
            ownerId: await getShopId(admin)
        };

        const response = await admin.graphql(
            mutation,
            {
                variables: {
                    input: metafieldInput
                }
            }
        );

        const result = await response.json();

        if (result.data.metafieldsSet.userErrors.length > 0) {
            throw new Error(`Failed to update metafield: ${JSON.stringify(result.data.metafieldsSet.userErrors)}`);
        }
    } catch (error) {
        console.error('Error resequencing top products:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw error;
    }
};

export const updateTopProduct = async (admin: AdminApiContext, data: TopProduct) => {
    try {
        const topProducts = await getTopProducts(admin);
        const topProduct = topProducts.find(x => x.id === data.id);
        if (!topProduct) {
            throw new Error('Top product not found');
        }

        topProduct.rank = data.rank;
        topProduct.productId = data.productId;
        topProduct.productVariantId = data.productVariantId;
        topProduct.variantIds = data.variantIds;

        const mutation = `
            mutation updateMetafield($input: MetafieldsSetInput!) {
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
            key: "topProductsList",
            value: JSON.stringify(topProducts),
            type: "json",
            ownerId: await getShopId(admin)
        };

        const response = await admin.graphql(mutation, {
            variables: {
                input: metafieldInput
            }
        });

        const result = await response.json();

        if (result.data.metafieldsSet.userErrors.length > 0) {
            throw new Error(`Failed to update metafield: ${JSON.stringify(result.data.metafieldsSet.userErrors)}`);
        }
    } catch (error) {
        console.error('Error updating top product:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw error;
    }
};

export const getTopProducts = async (admin: AdminApiContext, withProductInfo: boolean = false): Promise<(TopProduct & Partial<ProductInfo>)[]> => {
    try {
        const topProducts = await getSettings(admin, "topProductsList");
        if (!topProducts) return [];

        let parsedTopProducts = JSON.parse(topProducts) as TopProduct[];

        if (withProductInfo && parsedTopProducts.length > 0) {
            const productInfo = await getProductInfo(admin, parsedTopProducts);            
            parsedTopProducts = parsedTopProducts.map(p => {
                const productOriginal = productInfo[p.productId || ''];
                if (!productOriginal) return p;
                const product = JSON.parse(JSON.stringify(productOriginal));                
                //console.log('product here ', product);
                if (product.variants) {
                    const variant = product.variants.find((v: any) => v.id === p.productVariantId);
                    if (variant) {
                        product.variantTitle = variant.title;
                        product.inventory = variant.inventory
                    }
                }               

                delete (product as any).variants;
                
                return {
                    ...p,
                    productInfo: product,
                };
            });
        }
        return parsedTopProducts;
    } catch (error) {
        console.error('Error getting top products:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw error;
    }
};

async function getProductInfo(admin: AdminApiContext, topProducts: TopProduct[]): Promise<Record<string, ProductInfo>> {
    try {
        const query = `
            query getProductsInfo($ids: [ID!]!) {
                nodes(ids: $ids) {
                    ... on Product {
                        id
                        title
                        description
                        onlineStorePreviewUrl
                        tracksInventory
                        featuredImage {
                            url
                        }
                        priceRangeV2 {
                            minVariantPrice {
                                amount
                                currencyCode
                            }
                        }
                        variants(first: 250) {
                            edges {
                                node {
                                    id
                                    title
                                    inventoryQuantity
                                }
                            }
                        }
                    }
                }
            }
        `;

        const response = await admin.graphql(query, {
            variables: { ids: topProducts.filter(product => product && product.productId).map(product => product.productId) }
        });
        const result = await response.json();

        const productInfo: Record<string, ProductInfo> = {};
        result.data.nodes.forEach((node: any) => {
            productInfo[node.id] = {
                title: node.title,
                description: node.description,
                url: node.onlineStorePreviewUrl || '',
                tracksInventory: node.tracksInventory,
                image: node.featuredImage?.url || '',
                amount: node.priceRangeV2.minVariantPrice.amount,
                currency: node.priceRangeV2.minVariantPrice.currencyCode,
                price: new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: node.priceRangeV2.minVariantPrice.currencyCode || 'USD',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }).format(parseFloat(node.priceRangeV2.minVariantPrice.amount || '0')),
                variants: node.variants.edges.map((v: any) => ({
                    id: v.node.id,
                    title: v.node.title,
                    inventory: node.tracksInventory ? v.node.inventoryQuantity : Number.MAX_SAFE_INTEGER
                })),
                variantTitle: ''
            };
        });
        return productInfo;
    } catch (error) {
        console.error('Error getting product info:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw error;
    }
}

export const getCountUnsetTopProducts = async (admin: AdminApiContext): Promise<Number> => {
    try {
        const topProducts = await getTopProducts(admin);
        return topProducts.filter(x => !x.productId).length;
    } catch (error) {
        console.error('Error getting count of unset top products:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw error;
    }
};

export const removeTopProductsList = async (admin: AdminApiContext) => {
    try {
        const mutation = `
            mutation metafieldDelete($input: MetafieldDeleteInput!) {
                metafieldDelete(input: $input) {
                    deletedId
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;

        const shopId = await getShopId(admin);
        
        const response = await admin.graphql(
            mutation,
            {
                variables: {
                    input: {
                        ownerId: shopId,
                        namespace: "b2bplus",
                        key: "topProductsList"
                    }
                }
            }
        );

        const result = await response.json();

        if (result.data.metafieldDelete.userErrors.length > 0) {
            throw new Error(`Failed to delete metafield: ${JSON.stringify(result.data.metafieldDelete.userErrors)}`);
        }
        return true;
    } catch (error) {
        console.error('Error removing top products list:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw error;
    }
};

