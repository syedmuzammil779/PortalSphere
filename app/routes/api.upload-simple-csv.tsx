import type { ActionFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "~/db.server";
import { authenticate } from "../shopify.server";

export let action: ActionFunction = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;
  const dbShop = await prisma.session.findFirst({
    where: {
      shop: shop,
    },
  });
  const formData = await request.formData();
  const file = formData.get("csvFile");

  if (!file || typeof file !== "object" || !file.name) {
    return json({ error: "No valid file uploaded" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const csvContent = buffer.toString("utf-8");

  // Parse CSV content using csv-parser in memory
  const parsedData = [];

  const rows = csvContent.split("\n");
  const headers = rows[0].split(",").map((h) => h.trim());

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i].split(",");
    if (values.length < headers.length) continue;

    const entry: Record<string, string> = {};
    headers.forEach((header, idx) => {
      entry[header] = values[idx]?.trim() || "";
    });

    if (dbShop && entry["Discount Type"] && entry["Value"]) {
      var priceConfig = getPriceConfig(entry["Price Config"]);
      parsedData.push({
        shopId: dbShop.table_id,
        variantId: parseInt(entry["Variant ID"]),
        groupName: entry["Tag"],
        type: entry["Discount Type"],
        maximum:
          entry["maximum"] == "" || entry["maximum"] == null
            ? null
            : parseInt(entry["maximum"]),
        minimum:
          entry["minimum"] == "" || entry["minimum"] == null
            ? 1
            : parseInt(entry["minimum"]),
        increment:
          entry["increment"] == "" || entry["increment"] == null
            ? 1
            : parseInt(entry["increment"]),
        value: parseInt(entry["Value"]).toString(),
        status: false,
        priceConfig: priceConfig,
      });
    }
  }

  if (parsedData != null && parsedData.length) {
    for (var k in parsedData) {
      await prisma.shopCSVPricingConfig.create({ data: parsedData[k] });
    }
  }

  return json({ status: true, message: "Uploaded!" });
};

function getPriceConfig(configString: string): any {
  if (!configString) return {};
  var returnVal = [];
  try {
    const split = configString.trim().split(" ").join("").split("|");
    if (split != null && split.length > 0) {
      for (var i in split) {
        const oneUnit = split[i].split(":");
        const quantity = parseInt(oneUnit[0].replace("q", ""));
        const value = parseInt(oneUnit[1].replace("v", ""));
        returnVal.push({
          quantity: quantity,
          value: value,
        });
      }
    }
  } catch (error) {
    console.log("error in splitting", configString);
  }

  return returnVal;
}