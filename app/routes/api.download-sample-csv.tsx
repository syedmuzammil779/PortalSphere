import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import Papa from "papaparse";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    // Authenticate and get current shop
    const { session } = await authenticate.admin(request);
    const { shop } = session;

    // Fetch DB record for the shop
    const dbRecord = await prisma.session.findFirst({ where: { shop } });
    if (!dbRecord) {
      return json({ error: "Shop session not found." }, { status: 404 });
    }

    var parsedVariants = new Array();
    var limit = 5 as number;
    var offset = 0 as number;
    var dbRows;

    do {
      dbRows = await prisma.shopVariants.findMany({
        where: { storeId: dbRecord.table_id },
        take: limit,
        skip: offset
      });

      if(dbRows) {
        for(var i in dbRows) {
          parsedVariants.push({
            variantId: dbRows[i].variantId.toString(),
            name: dbRows[i].displayName,
            price: dbRows[i].price
          })
        }

        offset = offset + limit;
      }

    } while(dbRows != null && dbRows.length > 0);

    const segmentedArr = new Array();
    const segments = await prisma.shopSegmentsData.findMany({ where: { shop: shop } });
    if(segments) {
      for(var i in segments) {
        for(var j in parsedVariants) {
          segmentedArr.push({
            "Variant ID": parsedVariants[j].variantId,
            "Variant Name": parsedVariants[j].name,
            "Variant Price": parsedVariants[j].price,
            "Tag": segments[i].tagID,
            "maximum": null,
            "minimum": null,
            "increment": null,
            "Value": null,
            "Discount Type": null,
            "Price Config": null
          })
        }
      }
    }
  
    // Format as CSV
    const csv = Papa.unparse(segmentedArr);

    // Return CSV response
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="export_${new Date().toLocaleDateString()}_${dbRecord.shop}.csv"`,
      },
    });
  } catch (err) {
    console.error("CSV Export Error:", err);
    return json({ error: "Failed to export data." }, { status: 500 });
  }
}
