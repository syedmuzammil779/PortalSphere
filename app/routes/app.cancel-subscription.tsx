import { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate, STANDARD_PLAN } from "../shopify.server";
import { getActiveSubscription } from "~/services/Settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { billing, redirect } = await authenticate.admin(request);
    const activeSub = await getActiveSubscription(request);
    console.log('===============================');
    console.log('activeSub');
    console.log(activeSub);
    console.log('===============================');

    if (activeSub) {
      // Cancel the subscription
      await billing.cancel({
        subscriptionId: activeSub.id,
        isTest: true,
        prorate: true,
      });
    }

    // Check for active billing
    // const billingCheck = await billing.require({
    //   plans: [STANDARD_PLAN],
    //   onFailure: async () => billing.request({ plan: STANDARD_PLAN }),
    // });

    // Get the subscription to cancel
    

    // Redirect to pricing page after successful cancellation
    return redirect("/app/subscription");

};