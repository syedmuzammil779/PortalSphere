import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { Page, Layout, Card, Text, BlockStack } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { TrendingUp, Link } from "lucide-react";
import PageHeader from "~/components/PageHeader";

export const loader = async ({ request }: { request: Request }) => {
  const { session } = await authenticate.admin(request);
  return json({ shop: session.shop });
};

export default function UpsellIndexPage() {
  const navigate = useNavigate();

  const handleCardClick = (route: string) => {
    navigate(route);
  };

  return (
    <Page fullWidth={true}>
      <Layout>
        <Layout.Section>
          <div
            style={{
              marginLeft: 160,
              marginRight: 160,
              background: "rgb(241,242,244)",
              minHeight: "100vh",
              padding: 24,
            }}
          >
            <div className="flex items-center mb-4">
              <PageHeader
                title="Upsell"
                subtitle="Manage your upsell strategies and product recommendations"
              />
            </div>

            {/* Descriptive text */}
            <div style={{ marginTop: "24px", marginBottom: "24px" }}>
              <Text variant="bodyLg" tone="subdued" as="p">
                Add upsells to highlight top-selling products in the cart drawer or show complementary items on product pages to increase order value.
              </Text>
            </div>

            <div style={{ margin: "8px 0 4px 0" }}></div>

            <div className="mt-16"></div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {/* Top Products Card */}
              <Card>
                <div
                  style={{ cursor: "pointer" }}
                  className="p-6 border-2 border-transparent rounded-lg"
                  onClick={() =>
                    handleCardClick("/app/upsells/upsell-top-products")
                  }
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handleCardClick("/app/upsells/upsell-top-products");
                    }
                  }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <TrendingUp className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <Text variant="headingMd" as="h3" fontWeight="bold">
                          Top Products
                        </Text>
                        <Text variant="bodyMd" tone="subdued" as="p">
                          Manage top-selling products
                        </Text>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Feature:</span>
                      <span className="text-gray-900 font-medium">
                        Product Ranking
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Status:</span>
                      <span className="text-green-600 font-medium">Active</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <Text variant="bodySm" tone="subdued" as="p">
                      Configure and reorder your top-performing products to
                      boost sales
                    </Text>
                  </div>
                </div>
              </Card>

              {/* Complementary Products Card */}
              <Card>
                <div
                  style={{ cursor: "pointer" }}
                  className="p-6 border-2 border-transparent rounded-lg"
                  onClick={() =>
                    handleCardClick(
                      "/app/upsells/upsell-complementary-products",
                    )
                  }
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handleCardClick(
                        "/app/upsells/upsell-complementary-products",
                      );
                    }
                  }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <Link className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <Text variant="headingMd" as="h3" fontWeight="bold">
                          Complementary Products
                        </Text>
                        <Text variant="bodyMd" tone="subdued" as="p">
                          Cross-sell recommendations
                        </Text>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Feature:</span>
                      <span className="text-gray-900 font-medium">
                        Cross-selling
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Status:</span>
                      <span className="text-green-600 font-medium">Active</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <Text variant="bodySm" tone="subdued" as="p">
                      Set up product recommendations to increase average order
                      value
                    </Text>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 