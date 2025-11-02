import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { type AdminApiContext } from "@shopify/shopify-app-remix/server";
import { getShopId } from "~/services/Settings.server";
import {
  createSegment,
  setShopVolumeDiscountMetafield,
  setShopPaymentMethodsMetafield,
  setShopQuantityConfigMetafield,
  deleteVariantMetafield,
  deleteCollectionMetafield,
} from "~/services/CustomerGroups.server";
import { ensureGidFormat } from "~/services/ProductVolumePriceConfig.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const { admin, session } = await authenticate.admin(request);
  const { shop } = session;
  const shopId = await getShopId(admin, shop);
  const b2bPrefix = process.env.B2B_PREFIX;

  const dbRecord = await prisma.session.findFirst({
    where: { shop: shop }
  });

  try {
    //------Refactor this later------//
    const data = await request.formData();
    const parsedData: Record<string, string> = {};
    for (const [key, value] of data.entries()) {
      if (typeof value === "string") {
        parsedData[key] = value;
      }
    }
    const formFields = JSON.parse(parsedData.stateData);
    //------Till here------//

    const input = formFields.input;
    
    let isUpdate = input.hasOwnProperty('id') && input.id; 
    let existingSegData;

    const validationChecks = await validateRequest(input, dbRecord, admin);
    if (validationChecks != null && validationChecks.hasOwnProperty("status") && validationChecks.status === false) {
      return json(validationChecks, { status: 400 });
    }

    const tag = `${b2bPrefix}${input.name.toString().replaceAll(" ", "_")}`;
    const overAllDiscount =
      input.defaultStoreWideProductDiscounts.discount.toString();

    var selectedPayments = ["CreditCard"];
    if (input.netTerms) {
      selectedPayments.push("NetTerms");
    }

    const quantityConfigs = {
      increment: input.defaultStoreWideProductDiscounts.volumeConfig.increments?.toString() ?? "",
      minimum: input.defaultStoreWideProductDiscounts.volumeConfig.minimum?.toString() ?? "",
      maximum: input.defaultStoreWideProductDiscounts.volumeConfig.maximum?.toString() ?? "",
    };

    let groupId: string;
    let segmentRecord;
    if (isUpdate) {
      existingSegData = await prisma.shopSegmentsData.findFirst({
        where: {
          id: Number(input.id),
          shop: shop
        }
      });
      // Edit mode: update existing group
      segmentRecord = await prisma.shopSegmentsData.update({
        where: { id: Number(input.id), shop: shop },
        data: {
          description: input.description,
          segmentName: input.name as string,
          defaultDiscount: overAllDiscount as string,
          storeDiscounts: input.defaultStoreWideProductDiscounts,
          collectionDiscounts: input.collectionOverrides,
          productDiscounts: input.productOverrides,
          defaultMOQ: quantityConfigs.minimum != "" ? quantityConfigs.minimum : "0",
          paymentMethods: selectedPayments.join(", "),
          status: false
        }
      });
      groupId = segmentRecord.segmentId;
    } else {
      // Create mode
      groupId = await createSegment(admin, input.name as string, tag);
      segmentRecord = await prisma.shopSegmentsData.create({
        data: {
          shop: shop,
          segmentId: groupId,
          description: input.description,
          segmentName: input.name as string,
          query: `customer_tags CONTAINS '${tag}'`,
          defaultDiscount: overAllDiscount as string,
          storeDiscounts: input.defaultStoreWideProductDiscounts,
          collectionDiscounts: input.collectionOverrides,
          productDiscounts: input.productOverrides,
          defaultMOQ: quantityConfigs.minimum != "" ? quantityConfigs.minimum : "0",
          paymentMethods: selectedPayments.join(", "),
          tagID: tag,
          memberCount: 0,
          hasIncludedProducts: false,
          status: false
        },
      });
    }

    await prisma.volumePricingData.deleteMany({
      where: { shop: shop, tag: tag }
    })

    if(isUpdate && existingSegData && segmentRecord.tagID) {
      //console.log('updated input', JSON.stringify(input));
      //Now check if some product is deleted or some collection is deleted
      var existingProductDiscounts = typeof(existingSegData.productDiscounts) == 'string' ? JSON.parse(existingSegData.productDiscounts) : existingSegData.productDiscounts;
      var existingCollectionDiscounts = typeof(existingSegData.collectionDiscounts) == 'string' ? JSON.parse(existingSegData.collectionDiscounts) : existingSegData.collectionDiscounts;
      
      var checkDeletedProductDiscounts = checkDeletedEntries(input.productOverrides, existingProductDiscounts);
      var checkDeletedCollectionDiscounts = checkDeletedEntries(input.collectionOverrides, existingCollectionDiscounts);

      // console.log('checking deleted product discounts', checkDeletedProductDiscounts);
      // console.log('checking deleted collection discounts', checkDeletedCollectionDiscounts);

      if(checkDeletedProductDiscounts != null && checkDeletedProductDiscounts.length > 0) {
        for(var i in checkDeletedProductDiscounts) {
          var currentProductDiscount = checkDeletedProductDiscounts[i];
          var currentVariantId = currentProductDiscount.id.replace('gid://shopify/ProductVariant/', '');
          currentVariantId = parseInt(currentVariantId);
          await deleteVariantMetafield(admin, currentProductDiscount.id, segmentRecord.tagID);
          await prisma.shopSegmentVariants.deleteMany({
            where: {
              variantId: currentVariantId,
              segmentId: segmentRecord.id
            }
          })
        }
      }

      for(var j in checkDeletedCollectionDiscounts) {
        var currentCollection = checkDeletedCollectionDiscounts[j];
        var collectionId = currentCollection.id;
        collectionId = collectionId.split('gid://shopify/Collection/');
        var dbCollectionId = parseInt(collectionId[1]);
        collectionId = ensureGidFormat(collectionId[1], 'Collection');
        await deleteCollectionMetafield(admin, collectionId, segmentRecord.tagID);
        await prisma.shopSegmentCollections.deleteMany({
          where: {
            collectionId: dbCollectionId,
            segmentId: segmentRecord.id
          }
        })
      }
    }

    if(segmentRecord.storeDiscounts) {
      var storeDiscounts = typeof(segmentRecord.storeDiscounts) == 'string' ? JSON.parse(segmentRecord.storeDiscounts) : segmentRecord.storeDiscounts;
      if(segmentRecord.paymentMethods && segmentRecord.tagID) {
        var parsedSelectedPayments = segmentRecord.paymentMethods.split(', ');
        await setShopPaymentMethodsMetafield(admin, shopId, segmentRecord.tagID, parsedSelectedPayments);
      }

      if(segmentRecord.tagID && segmentRecord.defaultDiscount) {
        await setShopVolumeDiscountMetafield(admin, shopId, segmentRecord.tagID, segmentRecord.defaultDiscount.toString(), storeDiscounts.priceConfig);
        await setShopQuantityConfigMetafield(admin, shopId, segmentRecord.tagID, {
          increment: storeDiscounts.volumeConfig.increments,
          maximum: storeDiscounts.volumeConfig.maximum,
          minimum: storeDiscounts.volumeConfig.minimum,
          breakdowns: storeDiscounts.priceConfig
        })
      }
    }

    // Patch productDiscounts and collectionDiscounts before saving
    const isObjWithId = (o: any): o is { id: any; volumeConfig?: any } => o && typeof o === 'object' && 'id' in o;
    let previousProductDiscounts = Array.isArray(segmentRecord?.productDiscounts) ? segmentRecord.productDiscounts.filter(isObjWithId) : [];
    let previousCollectionDiscounts = Array.isArray(segmentRecord?.collectionDiscounts) ? segmentRecord.collectionDiscounts.filter(isObjWithId) : [];
    if (input.productOverrides) {
      input.productOverrides = input.productOverrides.map((override: any) => {
        const prev = previousProductDiscounts.find((o: any) => isObjWithId(o) && o.id === override.id);
        return patchVolumeConfig(override, prev);
      });
    }
    if (input.collectionOverrides) {
      input.collectionOverrides = input.collectionOverrides.map((override: any) => {
        const prev = previousCollectionDiscounts.find((o: any) => isObjWithId(o) && o.id === override.id);
        return patchVolumeConfig(override, prev);
      });
    }

    const groupIdStr = String(groupId);
    const itemsPerPage = 10;
    const groupName = input.name as string;
    const recordsBeforeCount = await prisma.shopSegmentsData.count({
      where: {
        shop: shop,
        tagID: { not: null },
        segmentName: { lt: groupName }, // Less than current group name
      },
    });
    // Calculate the page number (1-based)
    const pageNumber = Math.floor(recordsBeforeCount / itemsPerPage) + 1;

    const processedData = {
      ...data,
      validationChecks,
      timestamp: new Date().toISOString(),
      status: "processed",
    };

    return json({
      success: true,
      message: "Data received and processed successfully",
      groupId: groupIdStr,
      pageNumber: pageNumber,
      data: processedData
    }, {
      status: 200
    });
  } catch (error) {
    console.error("Error processing data:", error);

    return json({
      success: false,
      error: "Failed to process data",
      message: error instanceof Error ? error.message : "Unknown error"
    }, {
      status: 400
    });
  }
}

// --- PATCH: Ensure all volumeConfig fields are present before saving ---
function patchVolumeConfig(override: any, previousOverride: any) {
  return {
    ...override,
    volumeConfig: {
      minimum: override.volumeConfig?.minimum != null ? override.volumeConfig.minimum : (previousOverride && previousOverride.volumeConfig?.minimum != null ? previousOverride.volumeConfig.minimum : 1),
      maximum: override.volumeConfig?.maximum != null ? override.volumeConfig.maximum : (previousOverride && previousOverride.volumeConfig?.maximum !== undefined ? previousOverride.volumeConfig.maximum : null),
      increments: override.volumeConfig?.increments != null ? override.volumeConfig.increments : (previousOverride && previousOverride.volumeConfig?.increments != null ? previousOverride.volumeConfig.increments : 1),
    },
  };
}

function checkDeletedEntries(inputDiscounts: any, existingProductDiscounts: any) {
  if(!inputDiscounts) {
    return existingProductDiscounts;  
  } 
  
  var returnVal = new Array();
  for(var i in existingProductDiscounts) {
    var found = false;
    var currentExistingDiscount = existingProductDiscounts[i];
    for(var j in inputDiscounts) {
      if(inputDiscounts[j].hasOwnProperty('id')) {
        if(inputDiscounts[j].id == currentExistingDiscount.id) {
          found = true;
        }
      } 
    }

    if(!found) {
      returnVal.push(existingProductDiscounts[i]);
    }
  }

  return returnVal;
}

export async function loader() {
  return json({
    message: "This is a POST endpoint. Send POST requests with JSON data.",
    endpoint: "/api/data",
    method: "POST",
  });
}

async function validateRequest(input: any, dbRecord: any, admin: AdminApiContext): Promise<any> {
  try {
    let returnVal = {
      status: true,
      message: "",
      errors: new Array()
    };

    //First check for form fields key presence.
    const requiredFields = ["name", "description", "netTerms", "defaultStoreWideProductDiscounts"];
    for (var i in requiredFields) {
      const key = requiredFields[i];
      if (
        !input.hasOwnProperty(key) || input[key] === undefined || input[key] === null || 
        (typeof input[key] === "string" && input[key].trim() === "") || (typeof input[key] === "object" &&
        input[key] !== null && !Array.isArray(input[key]) && Object.keys(input[key]).length === 0)
      ) {
        returnVal.status = false;
        returnVal.message = "Invalid form inputs";
        returnVal.errors.push({
          key: "Invalid/empty value",
        });
      }
    }

    //Now fields are verified, now verify in db
    if(input.id) {
      const anotherSegmentWithSameName = await prisma.shopSegmentsData.findFirst({
        where: {
          shop: dbRecord.shop,
          segmentName: input.name,
          id: {
            not: input.id
          }
        }
      });
      
      if (anotherSegmentWithSameName != null && Object.keys(anotherSegmentWithSameName).length > 0) {
        returnVal.status = false;
        returnVal.message = "Duplicate group name found. Please use another name.";
        returnVal.errors.push({
          name: "Duplicate group name found. Please use another name.",
        });
      }
    } else {
      const existingDbRecord = await prisma.shopSegmentsData.findFirst({
        where: {
          shop: dbRecord.shop,
          segmentName: input.name
        }
      });
      
      if (existingDbRecord != null && Object.keys(existingDbRecord).length > 0) {
        returnVal.status = false;
        returnVal.message = "Duplicate group name";
        returnVal.errors.push({
          name: "Duplicate group found. Please use another name.",
        });
      }
    }

    return returnVal;
  } catch (error: any) {
    return {
      status: false,
      message: "Invalid values found. Check the breakdowns.",
      errors: [{
        global: error.message 
      }]
    };
  }
}
