import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import crypto from "crypto";
import { getCustomerGroupTag } from "~/services/ProductVolumePriceConfig.server";
import { isSubscriptionActive } from "~/services/Settings.server";
import { unauthenticated } from "~/shopify.server";
import { handleCors } from "~/utils/cors.server";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const TIME_WINDOW = 3600; // 1 hour

// Helper function to validate request parameters
function validateRequestParams(body: any) {
  const shop = body.shopDomain;
  const apiKey = body.apiKey;
  const timestamp = body.timestamp;
  const hmac = body.hmac;
  const customerId = body.customerId;

  const missingParams: string[] = [];
  if (!shop) missingParams.push("shop");
  if (!apiKey) missingParams.push("apiKey");
  if (!timestamp) missingParams.push("timestamp");
  if (!hmac) missingParams.push("hmac");
  if (!customerId) missingParams.push("customerId");

  if (missingParams.length > 0) {
    return false;
  }

  return { shop, apiKey, timestamp, hmac, customerId };
}

// Helper function to verify API key and HMAC
function verifyRequest(apiKey: string, timestamp: string, hmac: string) {
  if (apiKey !== SHOPIFY_API_KEY) {
    return json({ error: "Invalid API key" }, { status: 401 });
  }

  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > TIME_WINDOW) {
    return json({ error: "Request expired" }, { status: 401 });
  }

  const message = apiKey + timestamp;
  const calculatedHmac = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET || '')
    .update(message)
    .digest("hex");

  if (calculatedHmac !== hmac) {
    return json({ error: "Invalid signature" }, { status: 401 });
  }
}

// Loader function
export async function action({ request }: LoaderFunctionArgs) {
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
    const jsonReq = await request.json();
    var validRequestBody = validateRequestParams(jsonReq);
    if(!validRequestBody) {
        return json({
            status: false,
            message: 'Invalid request sent'
        })
    }
    
    let { apiKey, timestamp, hmac } = validRequestBody;
    //console.debug(`Loader: Validated parameters for shop: ${shop}, customerId: ${customerId}`);
    
    verifyRequest(apiKey ?? '', timestamp ?? '', hmac ?? '');

    const shopRecord = await prisma.session.findFirst({where: { shop: jsonReq.shopDomain }});

    if(shopRecord) {
        await prisma.buttonClicks.create({
            data: {
                shopId: shopRecord.table_id,
                customerId: jsonReq.customerId,
                tag: jsonReq.tag,
                buttonType: jsonReq.buttonType,
                operation: jsonReq.operation
            }
        })

    }
    
    return json({status: true}, {
      headers: corsResponse
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    //console.debug(`Loader: Error occurred - ${errorMessage}`);
    
    // Return error with CORS headers
    return json(
      { error: errorMessage }, 
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

// Add action for handling other HTTP methods
export async function loader({ request }: LoaderFunctionArgs) {
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