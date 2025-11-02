import { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session, admin, redirect } = await authenticate.admin(request);
    const { shop } = session;
    const url = new URL(request.url);
    const searchParams = new URLSearchParams(url.search);

    var liveThemeId = searchParams.get('liveThemeId');
    if(liveThemeId != null) {
        liveThemeId = liveThemeId.replace('gid://shopify/OnlineStoreTheme', '');
        return redirect(`https://${shop}/admin/themes/${liveThemeId}/editor?context=apps&activateAppId=${searchParams.get('activateAppId')}`, { target: "_parent" });
    }

    return null;
};