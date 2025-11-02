import { json } from "@remix-run/node";
import { getGroupOverrides } from "~/services/BuyerGroupOverrides.server";

export const loader = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const segmentId = url.searchParams.get("segmentId");
  if (!segmentId) return json({ error: "Missing segmentId" }, { status: 400 });
  const { mergedProductOverrides, mergedCollectionOverrides } = await getGroupOverrides(segmentId, request);
  return json({ mergedProductOverrides, mergedCollectionOverrides });
};

export default null; 