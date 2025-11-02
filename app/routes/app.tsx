import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { I18nContext, I18nManager } from "@shopify/react-i18n";
import { authenticate } from "../shopify.server";
import { DiscountProvider } from "~/components/DiscountProvider";
import { handleCors } from "~/utils/cors.server"; // Add this import
import { updateWholesalerRegistrationForm } from "~/services/WholesaleBuyers.server";
import prisma from "~/db.server";
import { videoGuides } from "~/services/DashboardFunctions.server";
import { setThemeMetafieldForStore } from "~/services/ThemeFunctions.server";
import { getAdminClient, getLiveTheme, getSchemaSettingsJSONFile, getShopIdCustom, getThemesForStore, saveUrl } from "~/services/CustomFunctions.server";
import { updateSettings } from "~/services/CustomFunctions.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Add CORS headers to response
  const corsHeaders = handleCors(request);

  try {
    const { session, admin } = await authenticate.admin(request);
    const { shop } = session;
    const requestUrl = new URL(request.url).hostname;

    //Here we update the parent app settings table.
    //Based on this one row we decide which stores need to be initialized
    const existingDbRecord = await prisma.parentAppSettings.findFirst();
    if (existingDbRecord) {
      if (existingDbRecord.appUrl != requestUrl) {
        await prisma.parentAppSettings.update({
          where: { id: existingDbRecord.id },
          data: {
            appUrl: requestUrl,
            videoGuides: JSON.stringify(videoGuides),
          },
        });
      }
    } else {
      await prisma.parentAppSettings.create({
        data: { appUrl: requestUrl, videoGuides: JSON.stringify(videoGuides) },
      });
    }

    //Check if there is a dashboard metric entry for this store.
    //If it doesn't exist (yet), then create it right here.
    const dashboardMetricsRowCount = await prisma.dashboardMetrics.count({
      where: { shop: shop },
    });

    if (dashboardMetricsRowCount <= 0) {
      await prisma.dashboardMetrics.create({
        data: { shop: shop },
      });
    }

    //Check if themes are synced. If no, sync it right here
    try {
      const sessionRecord = await prisma.session.findFirst({ where: { shop: shop } });

      if (sessionRecord != null && sessionRecord.shopId) {
        const gQLClient = await getAdminClient(sessionRecord);
        if (!sessionRecord.scriptsFlag) {

          var themesOfThisStore = await getThemesForStore(admin);
          var liveTheme = await getLiveTheme(themesOfThisStore);
          const assets = await getSchemaSettingsJSONFile(admin, session, liveTheme.id);
          await setThemeMetafieldForStore(sessionRecord, gQLClient, assets);

          await prisma.session.update({
            data: { scriptsFlag: true },
            where: { id: sessionRecord.id }
          });

          const shopGid = await getShopIdCustom(sessionRecord);
          const saveUrlResult = await saveUrl(sessionRecord, sessionRecord.shopId, requestUrl);
          await updateSettings(sessionRecord, "SHOPIFY_API_KEY", process.env.SHOPIFY_API_KEY || "", shopGid);
          await updateSettings(sessionRecord, "SHOPIFY_API_SECRET", process.env.SHOPIFY_API_SECRET || "", shopGid);
          
          if (saveUrlResult) {
            await prisma.session.update({
              data: { appUrl: requestUrl },
              where: { id: sessionRecord.id },
            });
          }
        }
      }
    } catch (error) {
      console.error(error);
    }

    try {
      await updateWholesalerRegistrationForm(session.shop, admin, requestUrl);
    } catch (error) {
      console.error("Error updating wholesaler registration form:", error);
    }

    return json(
      { apiKey: process.env.SHOPIFY_API_KEY || "" },
      { headers: corsHeaders as HeadersInit },
    );
  } catch (error) {
    console.error("Loader error:", error);
    return json(
      { error: "Authentication failed" },
      { status: 401, headers: corsHeaders as HeadersInit },
    );
  }
};

export default function App() {
  const data = useLoaderData<typeof loader>();
  const apiKey = "error" in data ? "" : data.apiKey;

  const i18nManager = new I18nManager({
    locale: "en-US",
  });

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <I18nContext.Provider value={i18nManager}>
        <DiscountProvider>
          <NavMenu>
            <Link to="/app" rel="home">
              Home
            </Link>
            {/* <Link to="/app/customergroups">Customer Groups</Link> */}
            <Link to="/app/buyer-group">Buyer Groups</Link>
            <Link to="/app/upsells">Upsells</Link>
            <Link to="/app/wholesaleportalaccess">Access Requests</Link>
            <Link to="/app/storeconfigs">Account Settings</Link>
          </NavMenu>
          <Outlet />
        </DiscountProvider>
      </I18nContext.Provider>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

/*
export const saveUrl = async (admin: AdminApiContext, shopGid: string, requestUrl: string) => {
  // Save the requestUrl to a metafield
  const metaresponse = await admin.graphql(`
    mutation {
      metafieldsSet(metafields: [
        {
          namespace: "b2bplus",
          key: "app_domain",
          value: "${requestUrl}",
          type: "single_line_text_field",
          ownerId: "${shopGid}"
        }
      ]) {
        metafields {
          id
          namespace
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `);

  const result: any = await metaresponse?.json();
  if (result?.userErrors?.length > 0) {
    console.error('Error saving URL:', result.userErrors);
  } 
}
*/
