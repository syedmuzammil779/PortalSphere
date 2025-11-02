import { Links,  Meta, Outlet, Scripts, ScrollRestoration, useNavigation, useLocation, useLoaderData } from "@remix-run/react";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { AppProvider } from '@shopify/polaris';

import { type LinksFunction, type LoaderFunctionArgs, json } from "@remix-run/node";


import '@shopify/polaris/build/esm/styles.css';
import { authenticate } from '~/shopify.server';
import prisma from "./db.server";
import { useEffect, useState } from "react";
import Intercom from '@intercom/messenger-js-sdk';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import moment from "moment";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  if (!admin) return json({ user: null });

  const { shop } = session;
  const sessionRecord = await prisma.session.findFirst({
    where: { shop: shop },
    select: { id: true, shop: true, createdAt: true, email: true, firstName: true }
  });

  //Update email and name of the store if its null
  if(sessionRecord != null) {
    if(!sessionRecord.firstName) {
      const gQLQuery = `query { shop { id email name } }`;
      const gQLResponse = await admin.graphql(gQLQuery);
      if(gQLResponse.ok) {
        const gQLData = await gQLResponse.json();
        try {
          const shopDetails = gQLData.data?.shop || null;
          if(shopDetails != null && shopDetails.hasOwnProperty('name')) {
            await prisma.session.update({
              where: { id: sessionRecord.id },
              data: { email: shopDetails.email, firstName: shopDetails.name }
            });
          }  
        } catch (error: any) {
          console.log('error updating in session table at root');
          console.log(error.message);
        }
      }
    }
  }

  return json({ user: sessionRecord });
}

export default function App() {
  const { user } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const location = useLocation();
  const [prevPathname, setPrevPathname] = useState(location.pathname);
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    if (location.pathname !== prevPathname) {
      setPrevPathname(location.pathname);
    }
  }, [location.pathname, prevPathname]);

  const isNavigatingPages = navigation.state !== 'idle' && (location.pathname !== prevPathname || navigation.formAction === undefined);
  
  useEffect(() => { //It has to be using useEffect otherwise it would throw an error. I don't understand why.
    if (typeof window === 'undefined') return;  // Prevent SSR

    if (user != null && user.email != null && user.firstName != null) {
      try {
        Intercom({ app_id: 'j2sa3d53', user_id: user.id, name: user.firstName, email: user.email, created_at: moment(user.createdAt).unix() });
      } catch (error: any) {
        console.error('Intercom init error:', error.message);
      }
    }
  }, [user]);
  
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
       <QueryClientProvider client={queryClient}>
        <AppProvider i18n={{
          Polaris: {
            Common: {
              loading: 'Loading',
            },
          },
        }}>
          <div className="relative min-h-screen">
            {isNavigatingPages && <LoadingSpinner />}
            <Outlet />
          </div>
        </AppProvider>
        </QueryClientProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}