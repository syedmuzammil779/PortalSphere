import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getShopId } from "~/services/Settings.server";
import { createSegment, setShopPaymentMethodsMetafield, setShopQuantityConfigMetafield, setShopVolumeDiscountMetafield } from "~/services/CustomerGroups.server";

export async function action({ request }: ActionFunctionArgs) {
    if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, { status: 405 });
    }

    const { admin, session } = await authenticate.admin(request);
    const { shop } = session;
    const shopId = await getShopId(admin, shop);
    const b2bPrefix = process.env.B2B_PREFIX;

    const requestBody = await request.json();
    const { groupId, name } = requestBody;

    //check existing group in db by ID
    const existingGroup = await prisma.shopSegmentsData.findFirst({
        where: { id: groupId, shop: shop }
    });

    if(!existingGroup) {
        return json({
            status: false,
            message: 'Invalid Group!'
        }, {
            status: 400
        })
    }

    //now check if name passed isn't already existing in the db
    const nameCheck = await prisma.shopSegmentsData.findFirst({
        where: { segmentName: name, shop: shop }
    });

    if(nameCheck) {
        return json({
            status: false,
            message: 'Name already in use!'
        }, {
            status: 400
        })
    }

    try {
        const tag = `${b2bPrefix}${name.toString().replaceAll(" ", "_")}`;
        const segmentId = await createSegment(admin, name as string, tag);
        var segmentRecord = await prisma.shopSegmentsData.create({
            data: {
                shop: shop,
                segmentId: segmentId,
                description: existingGroup.description,
                segmentName: name,
                query: `customer_tags CONTAINS '${tag}'`,
                defaultDiscount: existingGroup.defaultDiscount,
                storeDiscounts: existingGroup.storeDiscounts || {},
                collectionDiscounts: existingGroup.collectionDiscounts || {},
                productDiscounts: existingGroup.productDiscounts || {},
                defaultMOQ: existingGroup.defaultMOQ,
                paymentMethods: existingGroup.paymentMethods,
                tagID: tag,
                memberCount: existingGroup.memberCount,
                hasIncludedProducts: existingGroup.hasIncludedProducts,
                status: false
            }
        });

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

        return json({
            success: true,
            message: "Successful! Processing new buyer group now..."
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