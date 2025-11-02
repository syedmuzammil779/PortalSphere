import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import crypto from "crypto";
import { handleCors } from "~/utils/cors.server";

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
    //console.debug(`Missing required parameters: ${missingParams.join(", ")}`); // Log missing parameters
    return null;
  }

  return { shop, apiKey, timestamp, hmac, customerId, productVariantId, productId };
}

// Helper function to verify API key and HMAC
function verifyRequest(apiKey: string, timestamp: string, hmac: string) {
  if (apiKey !== SHOPIFY_API_KEY) {
    return {
      status: false,
      message: 'Invalid API Key'
    }
  }

  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > TIME_WINDOW) {
    return { 
      status: false,
      message: "Request expired"
    }
  }

  const message = apiKey + timestamp;
  const calculatedHmac = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET || '')
    .update(message)
    .digest("hex");

  if (calculatedHmac !== hmac) {
    return {
      status: false,
      message: "Invalid signature"
    };
  }

  return {
    status: true
  }
}

// Add action for handling non-GET requests
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
    const url = new URL(request.url);
    let validRequestParams = validateRequestParams(url);
    if(validRequestParams) {
      let { shop, apiKey, timestamp, hmac, customerId, productVariantId, productId } = validRequestParams;
      
      let requestStatus = verifyRequest(apiKey ?? '', timestamp ?? '', hmac ?? '');
      if(requestStatus.status) {
        const reqBody = await request.json();
        console.log('request received on button click');
        console.log(reqBody);
      }
    }
    return json({status: 'ok'}, {
      headers: corsResponse
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    return json({ 
      error: errorMessage, 
      trace: JSON.stringify(console.trace(error)) 
    }, { 
      status: 
        errorMessage.includes("Invalid") ? 401 :
        errorMessage.includes("Missing") ? 400 : 
        500,
      headers: corsResponse
    });
  }
}

// Loader function
export async function loader({ request }: LoaderFunctionArgs) {
  const corsResponse = handleCors(request);
  
  if (corsResponse instanceof Response) {
    return corsResponse;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsResponse });
  }

  return json({ 
    error: "Method not allowed" 
  }, { 
    status: 405,
    headers: corsResponse
  });
}