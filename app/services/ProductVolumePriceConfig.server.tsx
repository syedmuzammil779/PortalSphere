import type { ProductVolumePriceConfig } from "@prisma/client";
import db from "../db.server";
import { uuidv7 } from "uuidv7";
import type { AdminApiContext, UnauthenticatedAdminContext } from '@shopify/shopify-app-remix/server';
import { B2B_PLUS_NAMESPACE, COLLECTION_DISCOUNTS_KEY, getShopMetafield, VOLUME_DISCOUNTS_KEY } from "./CustomerGroups.server";

// New types
interface VolumeConfig {
    minimum: number | string;
    increment: number | string;
    maximum: number | string;
}

interface PriceConfigItem {
    quantity: number;
    percentage: number;
    price: number | string;
    maxQuantity: number;
    currencyCode: string;
    originalPrice: number | string;
    wholesalePrice: number | string;
    currencySymbol: string;
    discountAmount: number;
}

interface DefaultVolumeDiscounts {
    tag: string;
    discount: number;
    tiers: any|null|undefined;
}

interface ProductVariantVolumePriceConfig {
    tag: string;
    handle: string;
    volumeConfig: VolumeConfig;
    priceConfig: PriceConfigItem[];
    type?: string;
}

interface ProductVariantNormalPriceConfig {
    amount: number | string;
    currencyCode: string;
    currencySymbol: string;
}

interface IProductVolumePriceConfig {
    quantity: number;
    price: string;
    currencyCode: string;
    currencySymbol: string;
}

export const ensureGidFormat = function (id: string, type: string): string {
    if (!id.startsWith(`gid://shopify/${type}/`)) {
        return `gid://shopify/${type}/${id}`;
    }
    return id;
}

interface Variant {
    variantId: string;
    variantDisplayName: string;
    productStatus: string;
    productImageUrl: string | null;
    metafield: {
      id: string;
      value: string;
    } | null;
}
  
interface ProductVariantsResult {
variants: Variant[];
totalCount: number;
}

export const createProductVolumePriceConfig = async (shop: string, inputDetails: Partial<ProductVolumePriceConfig>) => {
    try {
        // Check for existing record with the same discountId and productId
        const existingRecord = await db.productVolumePriceConfig.findFirst({
            where: {
                shop,
                discountId: String(inputDetails.discountId),
                productId: String(inputDetails.productId)
            }
        });

        if (existingRecord) {
            console.log('A record with the same discountId and productId already exists.');
            return null;
        }

        //Create the record
        await db.productVolumePriceConfig.create({
            data: {
                id: `${shop}/${uuidv7()}`,
                shop,
                discountId: String(inputDetails.discountId),
                productId: String(inputDetails.productId),
                volume_config: String(inputDetails.volume_config),
                price_config: String(inputDetails.price_config),
            }
        });
        console.log('Product Volume Price Configuration Created');
    } catch (error) {
        console.error('Error creating product volume price config:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw error;
    }
}

export const getProductVolumePriceConfig = async (shop: string, discountId: string, productId: string): Promise<ProductVolumePriceConfig | null> => {
    try {
        const volumePriceConfigs = await db.productVolumePriceConfig.findFirst({
            where: { 
                shop,
                discountId,
                productId
            },
            orderBy: { createdAt: 'desc' }
        });

        return volumePriceConfigs;
    } catch (error) {
        console.error('Error getting product volume price config:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw error;
    }
}   

export const getProductVolumePriceConfigs = async (shop: string, discountId?: string, productId?: string, ): Promise<(ProductVolumePriceConfig)[]> => {
    try {
        const whereStatement: any = {shop};
        productId && (whereStatement.productId = productId);
        discountId && (whereStatement.discountId = discountId);

        const volumePriceConfigs = await db.productVolumePriceConfig.findMany({
            where: whereStatement,
            orderBy: { id: "asc" },
        });
        if (volumePriceConfigs.length === 0) return [];

        return volumePriceConfigs;
    } catch (error) {
        console.error('Error getting product volume price configs:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw error;
    }
}

export const updateProductVolumePriceConfig = async (discountId: string, productId: string, data: Partial<ProductVolumePriceConfig>) => {
    try {
        await db.productVolumePriceConfig.update({
            where: { productId_discountId: {
                productId,
                discountId
              } 
            },
            data: {
                ...data,
                modifiedAt: new Date(),
            }
        });
    } catch (error) {
        console.error('Error updating product volume price config:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw error;
    }
}

export const deleteProductVolumePriceConfig = async (shop: string, discountId: string, productId: string) => {
    try {
        await db.productVolumePriceConfig.delete({
            where: { shop, productId_discountId: {
                productId,
                discountId
              }
            }
        });
    } catch (error) {
        console.error('Error deleting product volume price config:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw error;
    }
}

export const deleteProductVolumePriceConfigs = async (shop: string, discountId: string) => {
    try {
        await db.productVolumePriceConfig.deleteMany({
            where: { shop, discountId }
        });
    } catch (error) {
        console.error('Error deleting product volume price configs:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw new Error('Failed to delete product volume price configurations');
    }
}

export const getVolumePriceConfiguration = async (
    shop: string,
    customerId: string,
    productVariantId: string,
    admin: AdminApiContext | UnauthenticatedAdminContext
): Promise<IProductVolumePriceConfig[]> => {
    const b2bTag = String(process.env.B2B_PREFIX);
    try {
        // Ensure IDs are in GID format
        const formattedCustomerId = ensureGidFormat(customerId, 'Customer');
        const formattedProductVariantId = ensureGidFormat(productVariantId, 'ProductVariant');

        const query = `
            query {
                customer(id: "${formattedCustomerId}") {
                    tags
                }
            }
        `;
        // Fetch customer tags
        const customerData = 'graphql' in admin ? await admin.graphql(query) : await admin.admin.graphql(query);
       
        let customerTags: string[] = [];

        if (customerData.ok) {
            const customerDataJson = await customerData.json();
            customerTags = customerDataJson.data.customer.tags;
        } else {
            throw new Error('Failed to fetch customer data');
        }

        const b2bTagValue = (Array.isArray(customerTags) && customerTags.length > 0) ? customerTags.find((tag: string) => tag.startsWith(b2bTag)) : null;

        const productVariantQuery = `
            query {
                productVariant(id: "${formattedProductVariantId}") {
                    price
                    product {
                        priceRangeV2 {
                            minVariantPrice {
                                currencyCode
                            }
                        }
                    }
                    metafields(first: 100, namespace: "b2bplus") {
                        nodes {
                            key
                            value
                        }
                    }
                }
            }
        `;

        const productVariantData = 'graphql' in admin ? await admin.graphql(productVariantQuery) : await admin.admin.graphql(productVariantQuery);
        
        if (!productVariantData.ok) {
            throw new Error('Failed to fetch product variant data');
        }

        const productVariantDataJson = await productVariantData.json();

        //console.debug("productVariantDataJson", productVariantDataJson);
        const defaultPrice = productVariantDataJson.data.productVariant.price;
        const currencyCode = productVariantDataJson.data.productVariant.product.priceRangeV2.minVariantPrice.currencyCode;

        if(b2bTagValue && productVariantDataJson.data.productVariant.metafields && Array.isArray(productVariantDataJson.data.productVariant.metafields.nodes) && productVariantDataJson.data.productVariant.metafields.nodes.length > 0){
            const config = productVariantDataJson.data.productVariant.metafields.nodes.find((configNode: { key: string }) => configNode.key === b2bTagValue);
            const configValue = config ? JSON.parse(config.value) : null;

            if(configValue && Object.hasOwn(configValue, "priceConfig") && Array.isArray(configValue.priceConfig) && configValue.priceConfig.length > 0){
                let priceConfigs: IProductVolumePriceConfig[] = [];

                for(const priceConfig of configValue.priceConfig){
                    priceConfigs.push({
                        quantity: Number(priceConfig.quantity),
                        price: fixDecimals(Number(defaultPrice)?(Number(defaultPrice) - ((Number(priceConfig.percentage) * Number(defaultPrice))/100)).toFixed(2).toString():defaultPrice),
                        currencyCode,
                        currencySymbol: getCurrencySymbol(currencyCode)
                    });
                }
                return priceConfigs;
            }

            const discountResponse = await getShopMetafield(admin, b2bTagValue, "b2bplus");
            
            if(discountResponse && Object.hasOwn(discountResponse, "value")){
                const discountConfig = JSON.parse(discountResponse.value);
                if(discountConfig && Object.hasOwn(discountConfig, "discount")){
                    return [
                        { 
                            quantity: 1, 
                            price: fixDecimals(Number(defaultPrice)?(Number(defaultPrice) + ((Number(discountConfig.discount) * Number(defaultPrice))/100)).toFixed(2).toString():defaultPrice), 
                            currencyCode, 
                            currencySymbol: getCurrencySymbol(currencyCode) 
                        }
                    ];
                }    
            }
        }
        return [
            { 
                quantity: 1, 
                price: fixDecimals(defaultPrice), 
                currencyCode, 
                currencySymbol: getCurrencySymbol(currencyCode) 
            }
        ];
    } catch (error) {
        console.error('Error in getVolumePriceConfiguration:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw new Error('Failed to get volume price configuration');
    }
}

export async function getDefaultDiscount(
    admin: AdminApiContext | UnauthenticatedAdminContext,
    tag: string,
    responseJson: any
): Promise<ProductVariantVolumePriceConfig> {
    // no volume pricing found, return default
    const productVariantPrice = responseJson.data.productVariant.price
    const currencyCode = responseJson.data.productVariant.product.priceRange.minVariantPrice.currencyCode
    const defaultQuery = `
        query {
            shop {
                metafield(namespace: "${B2B_PLUS_NAMESPACE}", key: "${VOLUME_DISCOUNTS_KEY}") {
                    value
                }
            }
        }
    `;
    const defaultResponse = 'graphql' in admin ? await admin.graphql(defaultQuery) : await admin.admin.graphql(defaultQuery);
    const defaultResponseJson = await defaultResponse.json();
    const defaultMetafieldValue = defaultResponseJson.data.shop?.metafield?.value;
    let discount = 0;
    let tiersBreakdown:any = null;
    try {
        if (defaultMetafieldValue) {
            const defaultDiscounts = JSON.parse(defaultMetafieldValue) as DefaultVolumeDiscounts[];
            const matchingDiscount = defaultDiscounts.find((item: DefaultVolumeDiscounts) => item.tag === tag);
            if (matchingDiscount) {
                if(matchingDiscount.hasOwnProperty('tiers') && matchingDiscount.tiers != null && matchingDiscount.tiers.length > 0) {
                    tiersBreakdown = matchingDiscount.tiers;
                }
                discount = Math.abs(Number.parseFloat(matchingDiscount.discount.toString()));
            }
        }    
    } catch (error: any) {
        console.log('Error in default discount function line 347 '+error.message);    
    }

    const defaultVolumeQuery = `
        query {
            shop {
                metafield(namespace: "${B2B_PLUS_NAMESPACE}", key: "${tag}") {
                    value
                }
            }
        }
    `;
    const defaultVolumeResponse = 'graphql' in admin ? await admin.graphql(defaultVolumeQuery) : await admin.admin.graphql(defaultVolumeQuery);
    const defaultVolumeResponseJson = await defaultVolumeResponse.json();
    const defaultVolumeMetafieldValue = defaultVolumeResponseJson.data.shop?.metafield?.value;
    const volumeconfig = defaultVolumeMetafieldValue ? JSON.parse(defaultVolumeMetafieldValue) : null
    if (volumeconfig) {
        if (!volumeconfig.maximum || volumeconfig.maximum === '') {
            volumeconfig.maximum = Number.MAX_SAFE_INTEGER;
        }
        if (!volumeconfig.increment) {
            volumeconfig.increment = 1;
        }
        if (!volumeconfig.minimum) {
            volumeconfig.minimum = 1;
        }
    }

    try {
        if(tiersBreakdown) {
            var breakdownArray = {
                tag: tag,
                volumeConfig: volumeconfig,
                handle: responseJson.data.productVariant.product.handle,
                priceConfig: new Array()
            }

            for(var i in tiersBreakdown) {
                breakdownArray.priceConfig.push({
                    quantity: tiersBreakdown[i].quantity,
                    percentage: tiersBreakdown[i].value,
                    price: fixDecimals(Number(productVariantPrice * (1 - (tiersBreakdown[i].value / 100))).toFixed(2).toString()),
                    wholesalePrice: fixDecimals(Number(productVariantPrice * (1 - (tiersBreakdown[i].value / 100))).toFixed(2).toString()),
                    maxQuantity: parseInt(tiersBreakdown[i].quantity) + parseInt(volumeconfig.increment) - 1,
                    currencyCode: currencyCode,
                    originalPrice: fixDecimals(Number(productVariantPrice).toFixed(2).toString()),
                    currencySymbol: getCurrencySymbol(currencyCode),
                    discountAmount: 0
                })
            }

            return breakdownArray;
        }    
    } catch (error: any) {
        console.log('error in default discount function line 401 '+error.message);
    }

    return {
        tag: tag,
        volumeConfig: volumeconfig,
        handle: responseJson.data.productVariant.product.handle,
        priceConfig: [{
            quantity: 0,
            percentage: discount,
            price: fixDecimals(Number(productVariantPrice * (1 - (discount / 100))).toFixed(2).toString()),
            wholesalePrice: fixDecimals(Number(productVariantPrice * (1 - (discount / 100))).toFixed(2).toString()),
            maxQuantity: Number.MAX_SAFE_INTEGER,
            currencyCode: currencyCode,
            originalPrice: fixDecimals(Number(productVariantPrice).toFixed(2).toString()),
            currencySymbol: getCurrencySymbol(currencyCode),
            discountAmount: 0
        }]
    };
}

export async function getVariantFromProduct(
    admin: AdminApiContext | UnauthenticatedAdminContext,
    productId: string
): Promise<string | null> {
    try {
        const formattedProductId = ensureGidFormat(productId, 'Product');
        const query = `
            query {
                product(id: "${formattedProductId}") {  
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
        const response = 'graphql' in admin ? await admin.graphql(query) : await admin.admin.graphql(query);
        const responseJson = await response.json();
        return responseJson?.data?.product?.variants?.edges[0]?.node?.id ?? null;
    } catch (error) {
        console.error('Error getting variant from product:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        throw error;
    }
}

export async function getProductVariantNormalPriceConfig(
    admin: AdminApiContext | UnauthenticatedAdminContext,
    productVariantId: string
): Promise<ProductVariantNormalPriceConfig | null> {
    const formattedProductVariantId = ensureGidFormat(productVariantId, 'ProductVariant');
    //console.log('formattedProductVariantId', formattedProductVariantId);
    const query = `
        query {
            productVariant(id: "${formattedProductVariantId}") {
                product {
                    priceRangeV2 {
                        minVariantPrice {
                            amount
                            currencyCode
                        }
                    }
                }
            }
        }
    `;

    const response = 'graphql' in admin ? await admin.graphql(query) : await admin.admin.graphql(query);
    const responseJson = await response.json();

    let data: ProductVariantNormalPriceConfig = {
        amount: Number(responseJson.data.productVariant.product.priceRangeV2.minVariantPrice.amount || 0).toFixed(2).toString(),
        currencyCode: responseJson.data.productVariant.product.priceRangeV2.minVariantPrice.currencyCode || 'USD',
        currencySymbol: getCurrencySymbol(responseJson.data.productVariant.product.priceRangeV2.minVariantPrice.currencyCode || 'USD')
    }
    return data;
}

export async function getProductVariantVolumePriceConfig(
    admin: AdminApiContext | UnauthenticatedAdminContext,
    productVariantId: string,
    tag: string
): Promise<ProductVariantVolumePriceConfig | null> {
    const formattedProductVariantId = ensureGidFormat(productVariantId, 'ProductVariant');
    const query = `
        query {
            productVariant(id: "${formattedProductVariantId}") {
                metafield(namespace: "${B2B_PLUS_NAMESPACE}", key: "${VOLUME_DISCOUNTS_KEY}") {
                    value
                }
                price
                product {
                    handle
                    priceRange {
                        minVariantPrice {
                            currencyCode
                        }
                    }
                    metafield(namespace: "${B2B_PLUS_NAMESPACE}", key: "${COLLECTION_DISCOUNTS_KEY}") {
                        value
                    }
                }
            }
        }
    `;

    const response = 'graphql' in admin ? await admin.graphql(query) : await admin.admin.graphql(query);
    const responseJson = await response.json();
    const defaultDiscount = await getDefaultDiscount(admin, tag, responseJson);  
    const metafieldValue = responseJson.data.productVariant?.metafield?.value;
    const collectionMetafieldValue = responseJson.data.productVariant?.product?.metafield?.value;
    var dataarray, data;
    if (metafieldValue) {
        try {
            dataarray = JSON.parse(metafieldValue) as ProductVariantVolumePriceConfig[];
            data = dataarray.find(data => data.tag === tag);
            
            if(data && data.volumeConfig && data.volumeConfig.increment){
                if (!data.volumeConfig.maximum || data.volumeConfig.maximum === '') {
                    data.volumeConfig.maximum = Number.MAX_SAFE_INTEGER;
                }
                if(data.priceConfig.length > 0){
                    for(let j = 0; j < data.priceConfig.length; j++){
                        if (data.type === 'fixedAmount') {
                            data.priceConfig[j].discountAmount = Number(responseJson.data.productVariant.price) - Number(data.priceConfig[j].percentage); 
                            data.priceConfig[j].price = fixDecimals(data.priceConfig[j].percentage);
                            data.priceConfig[j].originalPrice = fixDecimals(Number(responseJson.data.productVariant.price).toFixed(2).toString());
                            data.priceConfig[j].wholesalePrice = fixDecimals(Number((responseJson.data.productVariant.price * (1 - (defaultDiscount.priceConfig[0].percentage / 100))).toFixed(2)).toString());
                            
                        } else {
                            data.priceConfig[j].price = fixDecimals(Number((responseJson.data.productVariant.price * (1 - (data.priceConfig[j].percentage / 100))).toFixed(2)).toString());
                            data.priceConfig[j].originalPrice =  fixDecimals(Number(responseJson.data.productVariant.price).toFixed(2).toString());
                            data.priceConfig[j].wholesalePrice = fixDecimals(Number((responseJson.data.productVariant.price * (1 - (defaultDiscount.priceConfig[0].percentage / 100))).toFixed(2)).toString());
                            data.priceConfig[j].discountAmount = 0;
                        }
                        
                        data.priceConfig[j].currencyCode = responseJson.data.productVariant.product.priceRange.minVariantPrice.currencyCode ?? 'USD';
                        data.priceConfig[j].currencySymbol = getCurrencySymbol(data.priceConfig[j].currencyCode);
                        if (j+1 < data.priceConfig.length){
                            data.priceConfig[j].maxQuantity = data.priceConfig[j+1].quantity - 1;
                        } else {
                            data.priceConfig[j].maxQuantity = Number.MAX_SAFE_INTEGER;
                        }
                    }
                } else {
                    data.priceConfig = defaultDiscount.priceConfig;
                    data.type = 'percentage';
                }    
                return data;
            }
        } catch (error) {
            console.error('Error parsing metafield value:', error);
            console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
        }
    }

    //Variant level checked, now check collection level
    //First check collection level metafield
    if(collectionMetafieldValue) {
        try {
            dataarray = JSON.parse(collectionMetafieldValue);
            data = dataarray.find((index) => index.tag === tag);
            
            if(data && data.volumeConfig && data.volumeConfig.increments){
                if (!data.volumeConfig.maximum || data.volumeConfig.maximum === '') {
                    data.volumeConfig.maximum = Number.MAX_SAFE_INTEGER;
                }
                data.volumeConfig.increment = data.volumeConfig.increments;
                //data.volumeConfig.minimum = data.volumeConfig.increments + data.volumeConfig.minimum;
                delete(data.volumeConfig.increments);

                if(data.priceConfig.length > 0){
                    for(let j = 0; j < data.priceConfig.length; j++){
                        if (['fixedAmount', 'fixed'].includes(data.type)) {
                            data.priceConfig[j].discountAmount = Number(responseJson.data.productVariant.price) - Number(data.priceConfig[j].value); 
                            data.priceConfig[j].price = fixDecimals(data.priceConfig[j].value);
                            data.priceConfig[j].originalPrice = fixDecimals(Number(responseJson.data.productVariant.price).toFixed(2).toString());
                            data.priceConfig[j].wholesalePrice = fixDecimals(Number((responseJson.data.productVariant.price * (1 - (defaultDiscount.priceConfig[0].percentage / 100))).toFixed(2)).toString());
                        } else {
                            data.priceConfig[j].price = fixDecimals(Number((responseJson.data.productVariant.price * (1 - (data.priceConfig[j].value / 100))).toFixed(2)).toString());
                            data.priceConfig[j].originalPrice =  fixDecimals(Number(responseJson.data.productVariant.price).toFixed(2).toString());
                            data.priceConfig[j].wholesalePrice = fixDecimals(Number((responseJson.data.productVariant.price * (1 - (defaultDiscount.priceConfig[0].percentage / 100))).toFixed(2)).toString());
                            data.priceConfig[j].discountAmount = 0;
                            data.priceConfig[j].percentage = data.priceConfig[j].value;
                        }
                        
                        data.priceConfig[j].currencyCode = responseJson.data.productVariant.product.priceRange.minVariantPrice.currencyCode ?? 'USD';
                        data.priceConfig[j].currencySymbol = getCurrencySymbol(data.priceConfig[j].currencyCode);
                        if (j+1 < data.priceConfig.length){
                            data.priceConfig[j].maxQuantity = data.priceConfig[j+1].quantity - 1;
                        } else {
                            data.priceConfig[j].maxQuantity = Number.MAX_SAFE_INTEGER;
                        }
                    }
                } else {
                    data.priceConfig = defaultDiscount.priceConfig;
                    data.type = 'percentage';
                }

                return data;
            }
        } catch (error: any) {
            console.log('error in calculating collection level discount', error.message);
        }
    }
    //console.debug('defaultDiscount', defaultDiscount);
    return defaultDiscount;
}

export async function getCustomerGroupTag(
    admin: AdminApiContext | UnauthenticatedAdminContext,
    customerId: string,
    shop: string
): Promise<string | null> {
    var returnVal = null;
 
    //First check in DB
    var custSegmentId = ensureGidFormat(customerId, 'CustomerSegmentMember');
    const result = await db.shopSegmentsData.findFirst({
        where: {
            shop: shop,
            buyers: {
                some: {
                    customerId: custSegmentId
                }
            }
        },
        select: {
            tagID: true
        }
    });

    if(result && result.hasOwnProperty('tagID') && result.tagID != null) {
        return result.tagID
    } 

    const formattedCustomerId = ensureGidFormat(customerId, 'Customer');
    const query = `
        query {
            customer(id: "${formattedCustomerId}") {
                tags
            }
        }
    `;
    const response = 'graphql' in admin ? await admin.graphql(query) : await admin.admin.graphql(query);
    const responseJson = await response.json();
    const allTags = responseJson.data.customer.tags;

    const b2bPrefix = process.env.B2B_PREFIX;
    if (!b2bPrefix) {
        return null;
    }

    return allTags.find((tag: string) => tag.startsWith(b2bPrefix)) || null;
}

export async function getPaginatedProductVariantMetafields(
    admin: AdminApiContext,
    namespace: string,
    groupTag: string,
    tab: string,
    page: number,
    perPage: number
  ): Promise<ProductVariantsResult> {
    const offset = (page - 1) * perPage;
    
    const query = `
      query getProductVariants($first: Int!, $offset: Int!) {
        products(first: $first, offset: $offset) {
          edges {
            node {
              id
              title
              status
              featuredImage {
                url
              }
              variants(first: 1) {
                edges {
                  node {
                    id
                    title
                    metafields(first: 1, namespace: "${namespace}", keys: ["${groupTag}"]) {
                      edges {
                        node {
                          id
                          key
                          value
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          totalCount
        }
      }
    `;
  
    const variables = {
      first: perPage,
      offset: offset,
    };
  
    const response = await admin.graphql(query, { variables });
    const responseJson = await response.json();
  
    const variants = responseJson.data.products.edges.map((edge: { node: any }) => {
      const product = edge.node;
      const variant = product.variants.edges[0].node;
      const metafield = variant.metafields.edges[0]?.node;
  
      return {
        variantId: variant.id,
        variantDisplayName: `${product.title} - ${variant.title}`,
        productStatus: product.status,
        productImageUrl: product.featuredImage?.url,
        metafield: metafield ? { id: metafield.id, value: metafield.value } : null
      };
    });
  
    const filteredVariants = tab === 'included'
      ? variants.filter((v: any) => v.metafield && v.metafield.key === groupTag)
      : variants.filter((v: any) => !v.metafield || v.metafield.key !== groupTag);
  
    return {
      variants: filteredVariants,
      totalCount: responseJson.data.products.totalCount
    };
  }

export function getCurrencySymbol(currencyCode: string): string {
    const currencySymbols: { [key: string]: string } = {
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'JPY': '¥',
        'CNY': '¥',
        'CAD': 'C$',
        'AUD': 'A$',
        'INR': '₹',
        'BRL': 'R$',
        'CHF': 'Fr',
        'NZD': 'NZ$',
        'ZAR': 'R',
        'HKD': 'HK$',
        'SGD': 'S$',
        'SEK': 'kr',
        'NOK': 'kr',
        'DKK': 'kr',
        'RUB': '₽',
        'MXN': '$',
        'PLN': 'zł',
        'PHP': '₱'
    };

    return currencySymbols[currencyCode] || '$';
}

function fixDecimals(input: string | number): string {
  // If input is string, convert to number first
  const num = typeof input === 'string' ? Number(input) : input;
  // Convert to string with exactly 2 decimal places
  return num.toFixed(2).toString();
}
