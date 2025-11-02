import { json } from "@remix-run/node";
import { useNavigate, Outlet } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { 
  initializeComplementaryProducts, initializeSettings, 
  initializeTopProducts 
} from "~/services/CustomFunctions.server";

export const loader = async ({ request }: { request: Request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  const store = await prisma.session.findFirst({ where: { shop: shop } });
  if(store) {
    if(!store.appSettingsFlag) {
      await initializeSettings(store);
      await prisma.session.update({
        data: {appSettingsFlag: true},
        where: {id: store.id}
      });
    }

    if(!store.topProductsFlag) {
      await initializeTopProducts(store);
      await prisma.session.update({
        data: {topProductsFlag: true},
        where: {id: store.id}
      });
    }

    if(!store.compProductsFlag) {
      await initializeComplementaryProducts(store);
      await prisma.session.update({
        data: {compProductsFlag: true},
        where: {id: store.id}
      });
    }
  }
  
  return json({ shop: shop });
};

export default function UpsellPage() {
  const navigate = useNavigate();

  const handleCardClick = (route: string) => {
    navigate(route);
  };

  return <Outlet />;
}
