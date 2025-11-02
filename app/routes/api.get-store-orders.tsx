import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { handleCors } from "~/utils/cors.server";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import { getOrdersForStore, saveGraphQLOrderDetailsInDB } from "~/services/CustomFunctions.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const corsResponse = handleCors(request);

    if (corsResponse instanceof Response) {
        return corsResponse;
    }

    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsResponse });
    }

    const { admin, session } = await authenticate.admin(request);
    const { shop } = session;
    const requestSearchParams = new URL(request.url).searchParams;
    const store = await prisma.session.findFirst({ where: { shop: shop } });

    var orders;
    if(store) {
        orders = await getOrdersForStore(store, admin, {
            val: requestSearchParams.get('val'), 
            type: requestSearchParams.get('type'), 
            status: requestSearchParams.get('status')
        });

        if(orders != null && orders.length > 0) {
            for(var i in orders) {
                await saveGraphQLOrderDetailsInDB(store, orders[i]);
                console.log('Order '+orders[i].id+' saved!');
            }
        }
    }
    
    return json(orders);
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
      headers: corsResponse,
    },
  );
}

