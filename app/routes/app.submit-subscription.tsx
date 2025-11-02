import { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate, PORTALSPHERE_SUBSCRIPTION } from "../shopify.server";
import { sendSlackNotification } from "~/services/CustomFunctions.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session, admin, redirect } = await authenticate.admin(request);
    const { shop } = session;
    //console.log('shop', shop);
    const myShop = shop.replace(".myshopify.com", "");
    const isTest = (process.env.BILLING_IS_TEST ?? "false") === "true";
    const USAGE_PLAN = {
        name: PORTALSPHERE_SUBSCRIPTION,
        price: 0.0, 
        trialDays: 30, 
        currencyCode: 'USD',
        cappedAmount: 5000.00, 
        terms: `30 day free trial. All features are always included. Plans start as low as $49/month and
                automatically adjusts up and down based on your revenue and additional sales generated from
                PortalSphere upsell features. Detailed pricing can be found here: https://www.portalsphere.io/pricing`, 
        returnUrl: `https://admin.shopify.com/store/${myShop}/apps/${process.env.APP_NAME}/app/complete-info-form`
    };

    //console.log('usage pricing obj', USAGE_PLAN);
    
    const subscriptionMutation = `
        mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean!) {
            appSubscriptionCreate(name: $name, returnUrl: $returnUrl, lineItems: $lineItems, test: $test) {
                userErrors {
                    field
                    message
                }
                appSubscription {
                    id
                }
                confirmationUrl
            }
        }
    `;

    // console.log('Shop mutation for subscription');
    // console.log(subscriptionMutation);

    const createSubResponse = await admin.graphql(subscriptionMutation, {
        variables: {
            name: USAGE_PLAN['name'],
            returnUrl: USAGE_PLAN['returnUrl'],
            test: isTest,
            lineItems: [{
                plan: {
                    appUsagePricingDetails: {
                        terms: USAGE_PLAN['terms'],
                        cappedAmount: {
                            amount: USAGE_PLAN['cappedAmount'],
                            currencyCode: USAGE_PLAN['currencyCode']
                        }
                    }
                }
            }]
        },
    });

    const respBody = await createSubResponse.json();
    if(createSubResponse.ok) {
        const confirmationUrl = respBody.data.appSubscriptionCreate.confirmationUrl;
        await sendSlackNotification('Shop '+shop+' initiated the charge. Waiting for approval....');
        return redirect(confirmationUrl, { target: "_parent" });
    }

    await sendSlackNotification('Response for shop '+shop+' is not ok. Response - '+JSON.stringify(respBody));
    return null;
};