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

  const requestSearchParams = new URL(request.url).searchParams;

  const { admin, session } = await authenticate.admin(request);
  try {
    const { shop } = session;
    var whereCondition: any = {
      shop: shop,
      tagID: {
        not: null,
      },
    };

    // Handle search functionality
    if (requestSearchParams.get("search")) {
      const searchTerm = requestSearchParams.get("search");
      whereCondition.OR = [
        {
          segmentName: {
            contains: searchTerm,
            mode: "insensitive",
          },
        },
        {
          tagID: {
            contains: searchTerm,
            mode: "insensitive",
          },
        },
      ];
    }

    if (requestSearchParams.get("orderBy") && requestSearchParams.get("dir")) {
      var orderByColumn = null;
      switch (requestSearchParams.get("orderBy")) {
        case "id":
          orderByColumn = "id";
          break;
        case "name":
          orderByColumn = "segmentName";
          break;
        case "buyerCount":
          orderByColumn = "memberCount";
          break;
        case "moq":
          orderByColumn = "defaultMOQ";
          break;
        case "discount":
          orderByColumn = "defaultDiscount";
          break;
        default:
          orderByColumn = "id";
      }

      var orderDir = null;
      switch (requestSearchParams.get("dir")) {
        case "asc":
          orderDir = "asc";
          break;
        default:
          orderDir = "desc";
      }

      whereCondition.orderBy = {
        [orderByColumn]: orderDir,
      };
    }

    if (requestSearchParams.get("limit")) {
      const limit = requestSearchParams.get("limit");
      if (limit) {
        whereCondition.take = parseInt(limit);
      }
    }

    if (requestSearchParams.get("offset")) {
      const offset = requestSearchParams.get("offset");
      if (offset) {
        whereCondition.skip = parseInt(offset);
      }
    }

    var data = await prisma.shopSegmentsData.findMany({
      where: whereCondition,
      select: {
        segmentName: true,
        segmentId: true,
        tagID: true,
        defaultDiscount: true,
        status: true,
        defaultMOQ: true,
        paymentMethods: true,
        buyers: {
          select: {
            customerId: true,
            customerName: true,
          },
        },
      },
    });

    var returnVal = new Array();
    if (data != null && data.length > 0) {
      for (var i in data) {
        returnVal.push({
          segmentName: data[i].segmentName,
          segmentId: data[i].segmentId,
          tagID: data[i].tagID,
          defaultDiscount: data[i].defaultDiscount,
          defaultMOQ: data[i].defaultMOQ,
          paymentMethods: data[i].paymentMethods?.split(","),
          buyerCount: data[i].buyers.length,
          status: data[i].status,
        });
      }
    }

    return json({ data: returnVal });
  } catch (err: any) {
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
      headers: corsResponse,
    },
  );
}
