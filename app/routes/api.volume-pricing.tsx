import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import crypto from "crypto";
import { B2B_PLUS_NAMESPACE } from "~/services/CustomerGroups.server";
import { 
  ensureGidFormat, getCustomerGroupTag, 
  getProductVariantVolumePriceConfig, getVariantFromProduct 
} from "~/services/ProductVolumePriceConfig.server";
import { unauthenticated } from "~/shopify.server";
import { handleCors } from "~/utils/cors.server";
import prisma from "~/db.server";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const TIME_WINDOW = 3600 * 3; // 1 hour

// Helper function to validate request parameters
function validateRequestParams(url: URL) {
  const shop = url.searchParams.get("shop");
  const apiKey = url.searchParams.get("api_key");
  const timestamp = url.searchParams.get("timestamp");
  const hmac = url.searchParams.get("hmac");
  const customerId = url.searchParams.get("customer");
  const productVariantId = url.searchParams.get("productVariantId");
  const productId = url.searchParams.get("productId");

  const missingParams: string[] = [];
  if (!shop) missingParams.push("shop");
  if (!apiKey) missingParams.push("api_key");
  if (!timestamp) missingParams.push("timestamp");
  if (!hmac) missingParams.push("hmac");
  if (!customerId) missingParams.push("customer");
  if (!productVariantId && !productId) missingParams.push("product / variant id");

  if (missingParams.length > 0) {
    return { status: false, data: null, message: `Missing required parameters: ${missingParams.join(", ")}` }
  }

  return { 
    status: true, 
    data: {
      shop: shop, 
      apiKey: apiKey, 
      timestamp: timestamp, 
      hmac: hmac, 
      customerId: customerId, 
      productVariantId: productVariantId, 
      productId: productId
    } 
  };
}

// Helper function to verify API key and HMAC
function verifyRequest(apiKey: string, timestamp: string, hmac: string) {
  if (apiKey !== SHOPIFY_API_KEY) {
    return {status: false, message: 'Invalid API Key'};
  }

  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > TIME_WINDOW) {
    return {status: false, message: "Request expired"};
  }

  const message = apiKey + timestamp;
  const calculatedHmac = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET || '')
    .update(message)
    .digest("hex");

  // console.log('calculatedHmac', calculatedHmac);
  // console.log('hmac', hmac);
  if (calculatedHmac !== hmac) {
    return {status: false, message: "Invalid signature"};
  }

  return {status: true, message: 'Passed!'};
}

// Function to fetch volume pricing data
async function fetchVolumePricingData(shop: string, customerId: string, productVariantId: string) {
  const { admin } = await unauthenticated.admin(shop);
  var tag = await getCustomerGroupTag(admin, customerId, shop);
  if (!tag) {
    return null;
  }
  
  const dbRow = await prisma.volumePricingData.findFirst({
    where: {
      shop: shop,
      tag: tag,
      productVariantId: productVariantId
    },
    select: {
      returnData: true
    }
  });

  if(dbRow && tag) {
    return dbRow.returnData;
  }
  
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
  }
  
  return retval;
}

async function fetchVariantFromProduct(shop: string, productId: string): Promise<string | null> {
  const { admin } = await unauthenticated.admin(shop);
  return getVariantFromProduct(admin, productId);
}

// Loader function
export async function loader({ request }: LoaderFunctionArgs) {
  // Handle CORS first
  const corsResponse = handleCors(request);
  
  if (corsResponse instanceof Response) {
    return corsResponse;
  }

  // Handle OPTIONS request
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsResponse });
  }

  try {
    const url = new URL(request.url);

    let validRequest = validateRequestParams(url);
    if(!validRequest.status) {
      return json({error: validRequest.message}, {
        headers: corsResponse
      });
    }

    if(validRequest.data) {
      let { shop, apiKey, timestamp, hmac, customerId, productVariantId, productId } = validRequest.data;
    
      const {status, message} = verifyRequest(apiKey ?? '', timestamp ?? '', hmac ?? '');

      if(!status) {
        return json({error: message}, {
          headers: corsResponse
        });
      }

      if (!productVariantId && productId) {
        productVariantId = await fetchVariantFromProduct(shop ?? '', productId);
      }

      const volumePricing = await fetchVolumePricingData(shop ?? '', customerId ?? '', productVariantId ?? '');
      
      return json(volumePricing, {
        headers: corsResponse
      });
    }

    return json({error: 'No data found!'}, {
      headers: corsResponse
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    //console.debug(`Loader: Error occurred - ${errorMessage}`);
    
    return json(
      { error: errorMessage, trace: JSON.stringify(console.trace(error)) }, 
      { 
        status: 
          errorMessage.includes("Invalid") ? 401 :
          errorMessage.includes("Missing") ? 400 : 
          500,
        headers: corsResponse
      }
    );
  }
}

// Add action for handling non-GET requests
export async function action({ request }: LoaderFunctionArgs) {
  const corsResponse = handleCors(request);
  
  if (corsResponse instanceof Response) {
    return corsResponse;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsResponse });
  }

  return json(
    { error: "Method not allowed" },
    { 
      status: 405,
      headers: corsResponse
    }
  );
}