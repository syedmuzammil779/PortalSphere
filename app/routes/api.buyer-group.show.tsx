import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { handleCors } from "~/utils/cors.server";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const corsResponse = handleCors(request);

  if (corsResponse instanceof Response) {
    return corsResponse;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsResponse });
  }

  const url = new URL(request.url);
  const {admin, session} = await authenticate.admin(request);
  try {
    const {shop} = session;
    const searchParams = url.searchParams;
    const id = searchParams.get('id');
    var data;
    if(id) {
      data = await prisma.shopSegmentsData.findMany({
        where: {
          shop: shop,
          segmentId: id,
          tagID: {
            not: null
          }
        },
        select:{ 
          segmentName: true,
          segmentId: true,
          tagID: true,
          description: true,
          status: true,
          defaultDiscount: true,
          defaultMOQ: true,
          paymentMethods: true,
          buyers: {
            select: {
              customerId: true,
              customerName: true
            }
          }
        }
      });
    }
    
    return json({data: data});
  }catch(err: any) {
    console.error(err.message);
  }

  return null;
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