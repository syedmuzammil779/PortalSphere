import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import crypto from "crypto";
import { handleCors } from "~/utils/cors.server";
import prisma from "~/db.server";
import { unauthenticated } from "~/shopify.server";
import { getCustomerGroupTag } from "~/services/ProductVolumePriceConfig.server";
import { getConfigFromProductHandle } from "~/services/CustomerGroups.server";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const TIME_WINDOW = 3600 * 3; // 1 hour

// Helper function to validate request parameters
function validateRequestParams(body: any) {
  const shop = body.shop
  const apiKey = body.api_key
  const timestamp = body.timestamp
  const hmac = body.hmac
  const customerId = body.customer
  const handleArr = body.handleArr

  const missingParams: string[] = [];
  if (!shop) missingParams.push("shop");
  if (!apiKey) missingParams.push("api_key");
  if (!timestamp) missingParams.push("timestamp");
  if (!hmac) missingParams.push("hmac");
  if (!customerId) missingParams.push("customer");
  if (!handleArr || handleArr.length < 1) missingParams.push('handle array is empty or null');
  
  if (missingParams.length > 0) {
    return {
      status: false,
      data: null,
      message: `Missing required parameters: ${missingParams.join(", ")}`
    }
  }

  return {
    status: true, 
    data: { shop, apiKey, timestamp, hmac, customerId, handleArr}, 
    message: 'Passed!'
  };
}

// Helper function to verify API key and HMAC
function verifyRequest(apiKey: string, timestamp: string, hmac: string) {
  if (apiKey !== SHOPIFY_API_KEY) {
    return {status: false, message: "Invalid API key"}
  }

  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > TIME_WINDOW) {
    return {status: false, message: "Request expired"}
  }

  const message = apiKey + timestamp;
  const calculatedHmac = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET || '')
    .update(message)
    .digest("hex");

  if (calculatedHmac !== hmac) {
    return {status: false, message: "Invalid signature"}
  }

  return {status: true, message: 'Passed!'}
}

export async function loader({ request }: LoaderFunctionArgs) {
  const corsResponse = handleCors(request);
  if (corsResponse instanceof Response) return corsResponse;
  if (request.method === "OPTIONS") return new Response(null, { headers: corsResponse });

  return json({ message: "Use POST method." }, { headers: corsResponse });
}

// --- ACTION: Handles POST requests ---
export async function action({ request }: LoaderFunctionArgs) {
  const corsResponse = handleCors(request);
  if (corsResponse instanceof Response) return corsResponse;
  if (request.method === "OPTIONS") return new Response(null, { headers: corsResponse });

  try {
    const reqBody = await request.json();

    var validRequest = validateRequestParams(reqBody);
    if(!validRequest.status) {
      return json({error: validRequest.message}, {
        headers: corsResponse 
      })
    } 
    
    if(validRequest.data) {
      const { shop, apiKey, timestamp, hmac, customerId, handleArr } = validRequest.data ;
      const { status, message } = verifyRequest(apiKey ?? '', timestamp ?? '', hmac ?? '');
      
      if(!status) {
        return json({error: message}, {
          headers: corsResponse
        });
      }
      
      const { admin } = await unauthenticated.admin(shop);
      var tag = await getCustomerGroupTag(admin, customerId, shop);

      if(!tag) return json(null, { headers: corsResponse });

      const dbRows = await prisma.volumePricingData.findMany({
        where: {
          shop: shop,
          tag: tag,
          productVariantHandle: {
            in: handleArr
          }
        },
        select: {
          productVariantHandle: true,
          returnData: true
        }
      });

      let arrangedData = {};
      if(dbRows && dbRows.length > 0) {
        for(var i in dbRows) {
          arrangedData[dbRows[i].productVariantHandle] = dbRows[i];
        }
      }

      //Now check if all product handles have given data.

      let returnData = new Array();
      for(var i in handleArr) {
        if(arrangedData.hasOwnProperty(handleArr[i])) {
          returnData.push(arrangedData[handleArr[i]]);
        } else {
          var calculatedData = await getConfigFromProductHandle(admin, handleArr[i], tag, shop);
          returnData.push(calculatedData);
        }
      }

      return json({ 
        data: returnData, 
        count: returnData.length 
      }, { 
        headers: corsResponse 
      });
    }
    
    return json({
      error: 'No data'
    }, { 
      headers: corsResponse 
    })
  } catch (error) {
    const message = (error as Error).message;
    return json({ error: message }, {
      status:
        message.includes("Invalid") ? 401 :
        message.includes("Missing") ? 400 :
        500,
      headers: corsResponse,
    });
  }
}
