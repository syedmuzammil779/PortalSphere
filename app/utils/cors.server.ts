export function handleCors(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  const embedded = url.searchParams.get("embedded");

  // For debugging
  // console.log('CORS Check:', {
  //  origin,
  //  shop,
  //  host,
  //  embedded,
  //  fullUrl: request.url
  // });

  const adminShopifyURL = 'admin.shopify.com';
  const adminExtensionURL = 'extensions.shopifycdn.com';
  const allowedDomains = new Array('myshopify.com', 'portal-sphere-app.onrender.com', adminExtensionURL);
  
  // Allow requests from Shopify store domains
  if (origin && allowedDomains.includes(origin)) {
    return new Headers({
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Accept,Authorization,X-Requested-With",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin"
    });
  }

  // Special handling for embedded app requests
  if (embedded === "1") {
    return new Headers({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Accept,Authorization,X-Requested-With",
      "Access-Control-Allow-Credentials": "true",
    });
  }

  // Allow Shopify Admin requests (includes Shopify Admin Extensions)
  if (origin?.includes(adminShopifyURL) || host?.includes(adminShopifyURL) || origin?.includes(adminExtensionURL) || host?.includes(adminExtensionURL)) {
    return new Headers({
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Accept,Authorization,X-Requested-With",
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin"
    });
  }

  // If no specific conditions met, return basic headers
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Accept,Authorization,X-Requested-With",
  });
}

// Updated Shopify request validator
export function isValidShopifyRequest(request: Request): boolean {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  const embedded = url.searchParams.get("embedded");

  // Allow embedded app requests
  if (embedded === "1" && shop?.endsWith('.myshopify.com')) {
    return true;
  }

  return Boolean(
    (shop?.endsWith('.myshopify.com') || host?.includes('admin.shopify.com'))
  );
}