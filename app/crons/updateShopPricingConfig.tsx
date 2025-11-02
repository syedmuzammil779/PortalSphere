import { Session, ShopCSVPricingConfig } from "@prisma/client";
import prisma from "~/db.server";
import { setVariantInclusionMetafield, setVariantMetafield } from "~/services/CustomerGroups.server";
import { 
    checkStoreInstallation,  
    getAdminClient, 
    sendSlackNotification 
} from "~/services/CustomFunctions.server";
import { ensureGidFormat } from "~/services/ProductVolumePriceConfig.server";

export const updateShopPricingConfig = async (): Promise<boolean> => {
    const dbRows = await prisma.session.findMany({ });

    if(!dbRows) return false;
    for(var i in dbRows) {
        const currentStore = dbRows[i];

        const checkInstall = await checkStoreInstallation(currentStore);
        if(!checkInstall) {
            continue;
        }
 
        const csvData = await prisma.shopCSVPricingConfig.findMany({
            where: { shopId: currentStore.table_id, status: false },
            take: 10
        });

        if(csvData != null && csvData.length > 0) {
            for(var j in csvData) {
                const result = await processCSVData(currentStore, csvData[j]);
                if(result) {
                    await prisma.shopCSVPricingConfig.update({
                        where: {id: csvData[j].id},
                        data: {status: true}
                    })
                } 
            }
        }
    }

    return true;
};

async function processCSVData(currentStore: Session, csvData: ShopCSVPricingConfig) {

    if(!csvData.groupName) return false;

    const admin = await getAdminClient(currentStore);
    var priceConfig = typeof(csvData.priceConfig) == 'string' ? JSON.parse(csvData.priceConfig) : csvData.priceConfig;
    var tempPriceConfig = [];
    if(priceConfig && priceConfig.length > 0) {
        for(var j in priceConfig) {
            var currentPriceConfig = priceConfig[j];
            tempPriceConfig.push({
                percentage: currentPriceConfig.value,
                quantity: currentPriceConfig.quantity,
                status: ""
            });
        }
    } else {
        tempPriceConfig.push({
            percentage: csvData.value?.toString(),
            quantity: csvData.minimum?.toString(),
            status: ""
        })
    }
    
    var metafieldObject = {
        volumeConfig: {
            maximum: csvData.maximum,
            increment: csvData.increment,
            minimum: csvData.minimum
        },
        priceConfig: tempPriceConfig,
        type: csvData.type == 'percentage' ? 'percentage':'fixedAmount'
    };

    const variantId = ensureGidFormat(csvData.variantId.toString(), 'ProductVariant');
    
    await setVariantMetafield(admin, variantId, csvData.groupName, metafieldObject);
    await setVariantInclusionMetafield(admin, variantId, csvData.groupName);  

    try {
        var currentVariantId = parseInt(variantId.replace('gid://shopify/ProductVariant/', ''));
        var segmentRecord = await prisma.shopSegmentsData.findFirst({where: {shop: currentStore.shop, tagID: csvData.groupName}});
        if(segmentRecord) {
            await prisma.shopSegmentVariants.upsert({
                where: {
                    segmentId_variantId: {
                        segmentId: segmentRecord.id,
                        variantId: currentVariantId
                    }
                },
                create: {
                    segmentId: segmentRecord.id,
                    variantId: currentVariantId,
                    discount_type: csvData.type,
                    priceConfig: priceConfig,
                    volumeConfig: {
                        maximum: csvData.maximum,
                        increment: csvData.increment,
                        minimum: csvData.minimum
                    },
                    included: true
                },
                update: {
                    discount_type: csvData.type,
                    priceConfig: priceConfig,
                    volumeConfig: {
                        maximum: csvData.maximum,
                        increment: csvData.increment,
                        minimum: csvData.minimum
                    },
                    included: true
                }
            });
    
            await prisma.volumePricingData.deleteMany({
                where: {
                    shop: currentStore.shop,
                    productVariantId: currentVariantId.toString(),
                    tag: segmentRecord.tagID
                }
            });

            let updatedProductDiscounts = new Array();
            let dbPriceConfig = new Array();

            if(priceConfig && priceConfig.length > 0) {
                for(var k in priceConfig) {
                    var currentPriceConfig = priceConfig[k];
                    dbPriceConfig.push({
                        value: currentPriceConfig.value.toString(),
                        quantity: currentPriceConfig.quantity.toString()
                    });
                }
            } else {
                dbPriceConfig.push({
                    quantity: csvData.minimum.toString(),
                    value: csvData.value.toString()
                });
            }

            var productDiscounts = typeof(segmentRecord.productDiscounts) == 'string' ? JSON.parse(segmentRecord.productDiscounts) : segmentRecord.productDiscounts; 
            var gidCurrentVariant = ensureGidFormat(currentVariantId.toString(), 'ProductVariant')
            
            const newValue = {
                id: gidCurrentVariant,
                type: "variant",
                priceConfig: dbPriceConfig,
                volumeConfig: {
                    maximum: csvData.maximum?.toString() || '',
                    minimum: csvData.minimum?.toString() || '',
                    increments: csvData.increment?.toString()
                },
                discountValue: csvData.value?.toString(),
                discount_type: csvData.type == 'fixedAmount' ? 'fixed' : 'percentage',
                processed: true
            };

            if(segmentRecord.tagID) {
                if (Array.isArray(productDiscounts) && productDiscounts.length > 0) {
                    const existingIndex = productDiscounts.findIndex((item: any) => item.id === newValue.id); 
                    if(existingIndex !== -1){
                        productDiscounts[existingIndex] = newValue;
                        updatedProductDiscounts = productDiscounts;
                    } else {
                        updatedProductDiscounts = [...productDiscounts, newValue];
                    }
                } else {
                    updatedProductDiscounts = [newValue];
                }
                await prisma.shopSegmentsData.update({
                    data: { productDiscounts: updatedProductDiscounts },
                    where: { id: segmentRecord.id }
                })
            }
        }
        
    } catch (error: any) {
        console.log(error.message);
        return false;  
    }

    return true;
}