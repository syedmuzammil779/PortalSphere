import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { getCollectionInfo } from "~/services/ComplementaryProducts.server";
import type {
  AdminApiContext,
  UnauthenticatedAdminContext,
} from "@shopify/shopify-app-remix/server";

// Optimized function to fetch only the specific variants needed
async function getProductInfoForOverrides(
  admin: AdminApiContext | UnauthenticatedAdminContext,
  variantIds: string[],
): Promise<
  Record<
    string,
    {
      title: string;
      variantTitle: string | null;
      price: string;
      image: string;
      productId: string;
    }
  >
> {
  if (!variantIds.length) {
    return {};
  }

  // Filter out invalid IDs and deduplicate
  const validVariantIds = [...new Set(variantIds.filter(id => 
    id && typeof id === 'string' && id.startsWith('gid://shopify/ProductVariant/')
  ))];

  if (!validVariantIds.length) {
    return {};
  }

  const productInfoMap: Record<string, {  
    title: string;
    variantTitle: string | null;
    price: string;
    image: string;
    productId: string;
  }> = {};

  // Shopify has a limit on the number of IDs in a single nodes query
  // Let's chunk them into smaller batches to avoid hitting limits
  const CHUNK_SIZE = 100;
  const chunks = [];
  for (let i = 0; i < validVariantIds.length; i += CHUNK_SIZE) {
    chunks.push(validVariantIds.slice(i, i + CHUNK_SIZE));
  }

  // Process each chunk
  for (const chunk of chunks) {
    const query = `
      query($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            id
            title
            price
            image {
              url
            }
            product {
              id
              title
              images(first: 1) {
                edges {
                  node {
                    url
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response =
        "graphql" in admin
          ? await admin.graphql(query, { variables: { ids: chunk } })
          : await admin.admin.graphql(query, { variables: { ids: chunk } });
      
      if (!response.ok) {
        console.error(`GraphQL query failed for chunk: ${response.statusText}`);
        continue; // Skip this chunk but continue with others
      }

      const result = await response.json() as any;
      
      if (result.errors) {
        console.error("GraphQL errors for chunk:", result.errors);
        continue; // Skip this chunk but continue with others
      }

      // Process only the variants we requested
      result.data.nodes.forEach((node: any) => {
        if (!node || !chunk.includes(node.id)) return;

        const variantImage = node.image?.url;
        const productImage = node.product.images.edges[0]?.node.url;
        const productTitle = node.product.title;
        const variantTitle = node.title;
        
        let title;
        if (variantTitle && variantTitle !== "Default Title") {
          title = `${productTitle}: ${variantTitle}`;
        } else {
          title = productTitle;
        }

        const rawPrice = node.price || "0";
        // Smart price parsing (dollars/cents)
        let parsedPrice;
        if (rawPrice.includes("$") || rawPrice.includes(".")) {
          const numericValue = parseFloat(rawPrice.replace(/[$,]/g, ""));
          parsedPrice = numericValue;
        } else {
          const numericValue = parseFloat(rawPrice);
          if (numericValue > 1000) {
            parsedPrice = numericValue / 100;
          } else {
            parsedPrice = numericValue;
          }
        }

        productInfoMap[node.id] = {
          title: title,
          variantTitle: variantTitle !== "Default Title" ? variantTitle : null,
          price: new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(parsedPrice),
          image: variantImage || productImage || "",
          productId: node.product.id,
        };
      });

    } catch (error) {
      console.error("Error fetching product info for chunk:", error);
      // Continue with other chunks instead of failing completely
      continue;
    }
  }

  return productInfoMap;
}

export const action = async ({ request }: { request: Request }) => {
  try {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    const { admin } = await authenticate.admin(request);
    if (!admin) {
      return json({ error: "Authentication failed" }, { status: 401 });
    }

    const body = await request.json();
    const { ids, type } = body;

    if (!Array.isArray(ids) || !type) {
      return json({ error: "Missing ids or type" }, { status: 400 });
    }

    if (!ids.length) {
      return json({ data: {} });
    }

    if (type === "products") {
      const productInfoMap = await getProductInfoForOverrides(admin, ids);
      return json({ data: productInfoMap });
    } else if (type === "collections") {
      const collectionInfoMap = await getCollectionInfo(admin, ids);
      return json({ data: collectionInfoMap });
    } else {
      return json({ error: "Invalid type. Must be 'products' or 'collections'" }, { status: 400 });
    }
  } catch (error) {
    console.error("Error in buyer-group fetch-shopify-info:", error);
    
    if (error instanceof Error) {
      return json({ 
        error: "Internal server error", 
        message: error.message 
      }, { status: 500 });
    }
    
    return json({ 
      error: "Internal server error", 
      message: "Unknown error occurred" 
    }, { status: 500 });
  }
};

export default null;
