import {
  Page,
  BlockStack,
  Card,
  Button,
  InlineGrid,
  Badge,
  ChoiceList,
  Text,
  Collapsible,
  Bleed,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useCallback, useState } from "react";
import { ChevronUpIcon, ChevronDownIcon } from "@shopify/polaris-icons";
import {
  Link,
  useLoaderData,
  useSubmit,
  useNavigation,
  useNavigate,
} from "@remix-run/react";
import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { getCountUnsetTopProducts } from "~/services/TopProducts.server";
import { getActiveSubscription, getShopId } from "~/services/Settings.server";
import { hasApprovedOrRejectedWholesaleBuyer } from "~/services/WholesaleBuyers.server";
import { ComplementaryProductsCounts } from "~/services/ComplementaryProducts.server";
import { StoreTypeCard } from "~/components/StoreTypeCard";
import { CollapsibleOnboardingStep } from "~/components/CollapsibleOnboardingStep";
import { OnboardingStepGroup } from "~/components/OnboardingStepGroup";
import adminHeader from "~/assets/hero.png";
import { MoneyIcon } from "~/components/MoneyIcon";
import PlusIcon from "~/components/PlusIcon";
import SettingsIcon from "~/components/SettingsIcon";
import VideoCard from "~/components/VideoCard";
import VideoGuide from "~/components/VideoGuide";
import prisma from "~/db.server";
import { B2B_PLUS_NAMESPACE } from "~/services/CustomerGroups.server";

import {
  getCustomerCountForStore,
  getComplementaryProductsCounts,
  getUpsellTopProductsEnabled,
  getUpsellComplementaryProductsEnabled,
  getOnlineStoreSetupStatus,
  getCustomerSegmentsForStore,
  getCustomerGroupMemberCount,
  hasCustomerGroupIncludedProducts,
  getStoreType,
  checkIfUnixTimeStampExpired,
} from "~/services/DashboardFunctions.server";
import moment from "moment";
import { sendSlackNotification } from "~/services/CustomFunctions.server";

interface IOnboardingStatus {
  groupCount: number;
  customerCount: number;
  taggedCustomersCount: number;
  topSellerCount: number;
  updatedCounts: ComplementaryProductsCounts;
  volumePriceConfigCount: number;
  hasWholesalePortalAccessCount: number;
}

export const loader: LoaderFunction = async ({ request }) => {
  const { admin, session, redirect } = await authenticate.admin(request);
  const { shop } = session;
  const onboardingVideoUrl = process.env.ONBOARDING_VIDEO_URL || "https://player.vimeo.com/video/1040199513";

  const dbShopRecord = await prisma.session.findFirst({
    where: { shop: shop }
  });

  const dbDashboardMetricsRow = await prisma.dashboardMetrics.findFirst({
    where: { shop: shop }
  });

  const dbParentRecord = await prisma.parentAppSettings.findFirst(); //Later this can be moved to store specific guides
  const videoGuides =
    dbParentRecord != null && dbParentRecord.videoGuides
      ? JSON.parse(dbParentRecord.videoGuides)
      : [];

  const activeSubscription = await getActiveSubscription(request);
  if (!activeSubscription) {
    return redirect("/app/subscription");
  }

  let storeType = null;
  let upsellTopProductsEnabled = null;
  let isSetUpsell = false;
  let upsellComplementaryProductsEnabled = null;
  let onlineStoreSetupStatus = { appEmbed: "false", appBlock: "false" };

  const shopId = await getShopId(admin, shop);

  const onboardingStatus: IOnboardingStatus = {
    groupCount: 0,
    customerCount: 0,
    taggedCustomersCount: 0,
    topSellerCount: 0,
    updatedCounts: { assigned: 0, unassigned: 0, total: 0 },
    volumePriceConfigCount: 0,
    hasWholesalePortalAccessCount: 0
  };

  try {
    // Check and create B2B volume discount (Moved to backend)
    onboardingStatus.customerCount = await getCustomerCountForStore(
      admin, dbShopRecord, dbDashboardMetricsRow
    );
    onboardingStatus.updatedCounts = await getComplementaryProductsCounts(
      admin, shopId, dbShopRecord, dbDashboardMetricsRow
    );

    let customerGroups = await getCustomerSegmentsForStore(admin, dbShopRecord);
    let volumePriceConfigCount = 0;
    if (customerGroups.length > 0) {
      onboardingStatus.groupCount = customerGroups.length;

      let memberCount = 0;
      try {
        for (let i = 0; i < customerGroups.length; i++) {
          let groupMemberCount = await getCustomerGroupMemberCount(admin, dbShopRecord, customerGroups[i]);
          memberCount = memberCount + groupMemberCount;

          const groupQuery: string[] = customerGroups[i].query.split(" ");
          let groupTag = groupQuery[groupQuery.length - 1];
          groupTag = groupTag.replace(/^'|'$/g, "");
          
          let customerGroupHasProducts = await hasCustomerGroupIncludedProducts(
            admin, dbShopRecord, customerGroups[i], groupTag
          );

          volumePriceConfigCount = volumePriceConfigCount + (customerGroupHasProducts ? 1 : 0);
        }
      } catch (error: any) {
        console.log("error in app index", error.message);
      }

      onboardingStatus.taggedCustomersCount = memberCount;
      onboardingStatus.volumePriceConfigCount = volumePriceConfigCount;
    }

    var now = moment().unix();

    storeType = await getStoreType(admin, dbShopRecord, dbDashboardMetricsRow);

    onlineStoreSetupStatus = await getOnlineStoreSetupStatus(
      admin, dbShopRecord, dbDashboardMetricsRow
    );
    upsellTopProductsEnabled = await getUpsellTopProductsEnabled(
      admin, dbShopRecord, dbDashboardMetricsRow
    );
    upsellComplementaryProductsEnabled =
      await getUpsellComplementaryProductsEnabled(admin, dbShopRecord, dbDashboardMetricsRow);

    isSetUpsell =
      (upsellTopProductsEnabled && upsellTopProductsEnabled === "true") ||
      (upsellComplementaryProductsEnabled && upsellComplementaryProductsEnabled === "true");

    /** * This is the only part of dashboard that doesn't get updated automatically in cron */
    let unsetTopProducts = 0;
    if (dbDashboardMetricsRow != null && dbDashboardMetricsRow.unsetTopProductsCount) {
      var infoExpired = checkIfUnixTimeStampExpired(now, Number(dbDashboardMetricsRow.unsetTopProductsCountLastChecked));
      if (!infoExpired) {
        unsetTopProducts = Number(dbDashboardMetricsRow.unsetTopProductsCount); //We have to return right here itself
      } else {
        unsetTopProducts = Number(await getCountUnsetTopProducts(admin));
      }
    } else {
      unsetTopProducts = Number(await getCountUnsetTopProducts(admin));
    }

    //When you get the value finally, update in the db
    if (dbDashboardMetricsRow) {
      await prisma.dashboardMetrics.update({
        where: { id: dbDashboardMetricsRow.id },
        data: {
          unsetTopProductsCount: unsetTopProducts,
          unsetTopProductsCountLastChecked: moment().add(dbDashboardMetricsRow?.unsetTopProductsCountFrequency, "hours").unix()
        }
      });
    }
    /** If you can take the snippet above, and use it as a re-usable module, feel free to refactor */

    onboardingStatus.topSellerCount = 10 - unsetTopProducts;
    onboardingStatus.hasWholesalePortalAccessCount = (await hasApprovedOrRejectedWholesaleBuyer(shop)) ? 1 : 0;

    return {
      onboardingStatus,
      storeType,
      isSetUpsell,
      onlineStoreSetupStatus,
      onboardingVideoUrl,
      videoGuides
    };
  } catch (err) {
    console.log(err);
    return {
      onboardingStatus,
      storeType,
      isSetUpsell,
      onlineStoreSetupStatus,
      onboardingVideoUrl,
      videoGuides
    };
  }
};

export const action: ActionFunction = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const { shop } = session;

  const formData = await request.formData();
  const submitType = String(formData.get("submitType"));

  let metafields: {
    namespace: string;
    key: string;
    value: string;
    type: string;
    ownerId: string;
  }[] = [];

  const shopId = await getShopId(admin, shop);

  if (submitType === "store-type-setup") {
    const storeType = String(formData.get("storeType"));
    metafields = [
      {
        namespace: B2B_PLUS_NAMESPACE,
        key: "storeType",
        value: storeType,
        type: "single_line_text_field",
        ownerId: shopId,
      },
    ];
  }

  if (submitType === "online-store-setup") {
    const appEmbed = String(formData.get("appEmbed"));
    const appBlock = String(formData.get("appBlock"));
    metafields = [
      {
        namespace: B2B_PLUS_NAMESPACE,
        key: "onlineStoreSetupStatus",
        value: JSON.stringify({ appEmbed, appBlock }),
        type: "json",
        ownerId: shopId,
      },
    ];
  }

  const mutation = `
    mutation createMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          key
          namespace
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(mutation, {
      variables: {
        metafields,
      },
    });

    if (response.ok) {
      const respData = await response.json();
      if (respData.data != null) {
        if (submitType == "store-type-setup") {
          await prisma.dashboardMetrics.updateMany({
            where: { shop: shop },
            data: { storeType: String(formData.get("storeType")) },
          });
        }
      }

      return null;
    } else {
      throw new Error(`Error updating customer tags`);
    }
  } catch (error) {
    //console.error("Error creating metafields:", error);
    throw error;
  }
};

interface PlaceholderProps {
  label: string;
  height?: string;
  width?: string;
  children?: React.ReactNode;
}

const Placeholder = ({
  label,
  height = "auto",
  width = "auto",
  children,
}: PlaceholderProps) => {
  return (
    <div
      style={{
        background: "#f6f6f7",
        padding: "14px var(--p-space-200)",
        height: height,
        width: width,
        margin: "0 -20px",
      }}
    >
      <InlineGrid columns="1fr auto">
        <div
          style={{
            color: "var(--p-color-text)",
            marginLeft: "15px",
          }}
        >
          <Text as="h2" variant="headingMd">
            {label}
          </Text>
        </div>
        <div style={{ marginRight: "15px" }}>{children}</div>
      </InlineGrid>
    </div>
  );
};

export default function Index() {
  const {
    onboardingStatus,
    storeType,
    isSetUpsell,
    onlineStoreSetupStatus,
    onboardingVideoUrl,
    videoGuides,
  }: any = useLoaderData();

  const navigate = useNavigate();
  const indexData = onboardingStatus as IOnboardingStatus;
  const [selected, setSelected] = useState<string[]>([
    String(storeType || "B2B"),
  ]);
  const b2bCompletionCount =
    Number(!!indexData.groupCount) +
    Number(!!indexData.volumePriceConfigCount) +
    Number(!!indexData.taggedCustomersCount) +
    (storeType ? 1 : 0) +
    Number(!!indexData.hasWholesalePortalAccessCount);
  const upsellCompletionCount =
    Number(!!indexData.topSellerCount) +
    Number(!!indexData.updatedCounts.assigned) +
    (isSetUpsell ? 1 : 0);
  const [open, setOpen] = useState(false);
  const [openSetupGuide, setOpenSetupGuide] = useState(false);
  const [enableAppEmbeds, setEnableAppEmbeds] = useState(
    onlineStoreSetupStatus.appEmbed === "true",
  );
  const [enableUpsellBlock, setEnableUpsellBlock] = useState(
    onlineStoreSetupStatus.appBlock === "true",
  );

  const [openUpsell, setOpenUpsell] = useState(false);
  const [openB2b, setOpenB2b] = useState(false);
  const [openOnlineStoreSetup, setOpenOnlineStoreSetup] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  const handleToggle = () => setOpen((open) => !open);
  const handleToggleB2b = () => setOpenB2b((openB2b) => !openB2b);
  const handleToggleSetupGuide = () =>
    setOpenSetupGuide((openSetupGuide) => !openSetupGuide);
  const handleToggleUpsell = () => setOpenUpsell((openUpsell) => !openUpsell);
  const handleToggleOnlineStoreSetup = () =>
    setOpenOnlineStoreSetup((openOnlineStoreSetup) => !openOnlineStoreSetup);
  const submit = useSubmit();
  const handleChange = useCallback((value: string[]) => setSelected(value), []);
  const b2bSteps = 5;
  const upsellSteps = 3;
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  const handleSubmit = (type: string | null) => {
    if (!type) {
      console.warn("No submission type provided");
      return;
    }

    const formData = new FormData();
    if (type === "store-type-setup") {
      formData.append("storeType", String(selected));
    } else if (type === "online-store-setup") {
      formData.append("appEmbed", String(enableAppEmbeds));
      formData.append("appBlock", String(enableUpsellBlock));
    }
    formData.append("submitType", type);

    submit(formData, { method: "post" });
  };

  const handleAppEmbedsChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setEnableAppEmbeds(event.target.checked);
  };

  const handleUpsellBlockChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setEnableUpsellBlock(event.target.checked);
  };

  return (
    <Page>
      <TitleBar title="PortalSphere"></TitleBar>
      <BlockStack gap="500">
        <Card padding="0">
          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="0">
            <div
              style={{
                height: "100%",
                minHeight: "80px",
                maxWidth: "100%",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                cursor: "pointer",
              }}
              onClick={() => setShowVideo(true)}
            >
              <img
                alt=""
                style={{
                  width: "100%",
                  height: "375px",
                  objectFit: "cover",
                  objectPosition: "center",
                  display: "block",
                }}
                src={adminHeader}
              />
              {/* Play Icon Overlay */}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: "80px",
                  height: "80px",
                  backgroundColor: "rgba(0, 0, 0, 0.7)",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.3s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
                  e.currentTarget.style.transform = "translate(-50%, -50%) scale(1.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
                  e.currentTarget.style.transform = "translate(-50%, -50%) scale(1)";
                }}
              >
                <div
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: "20px solid white",
                    borderTop: "12px solid transparent",
                    borderBottom: "12px solid transparent",
                    marginLeft: "4px",
                  }}
                />
              </div>
            </div>
            <div
              style={{
                padding: "var(--p-space-500)",
                marginLeft: "30px",
              }}
            >
              <BlockStack gap="500" align="start">
                <Text variant="heading3xl" as="h1">
                  Welcome to Your B2B Competitive Edge
                </Text>
                <Text as="p">
                  Run a wholesale site with the only all-in-one solution that's
                  packed with robust B2B features and powerful upsells tailored
                  to B2B.
                </Text>
                <BlockStack gap="200">
                  <InlineStack gap="200" align="start">
                    <MoneyIcon />
                    <Text as="p">
                      <b>20% revenue increase</b>
                    </Text>
                  </InlineStack>
                  <InlineStack gap="200" align="start">
                    <PlusIcon />
                    <Text as="p">
                      <b>Greater product adoption</b>
                    </Text>
                  </InlineStack>
                  <InlineStack gap="200" align="start">
                    <SettingsIcon />
                    <Text as="p">
                      <b>Streamlined operations</b>
                    </Text>
                  </InlineStack>
                </BlockStack>
                <Text as="p">
                  Get started by following the <b>Setup Guide</b> below.
                </Text>
                <div style={{ opacity: 0.75, fontSize: "14px", color: "#6b7280" }}>
                  <Text as="p">
                    Need help? Email us at support@portalsphere.io
                  </Text>
                </div>
              </BlockStack>
            </div>
          </InlineGrid>
        </Card>
        <Card>
          <InlineGrid columns="1fr auto">
            <Text as="h2" variant="headingMd">
              {" "}
              Setup Guide{" "}
            </Text>
            <Button
              onClick={handleToggleSetupGuide}
              ariaExpanded={openSetupGuide}
              ariaControls="setup-guide-content"
              variant="plain"
              icon={openSetupGuide ? ChevronUpIcon : ChevronDownIcon}
            ></Button>
          </InlineGrid>
          <Text as="p">
            {" "}
            Whether you're migrating from another B2B app or starting fresh,
            follow these steps to launch without affecting your live site until
            you're ready to go live.
          </Text>
          <br />
          <Text
            as="span"
            tone={
              b2bCompletionCount + upsellCompletionCount <
              b2bSteps + upsellSteps
                ? "caution"
                : "success"
            }
          >
            <Badge>{`${b2bCompletionCount + upsellCompletionCount + (enableAppEmbeds && enableUpsellBlock ? 1 : 0)}/${b2bSteps + upsellSteps + 1} Completed`}</Badge>
          </Text>
          <Collapsible
            open={openSetupGuide}
            id="setup-guide-content"
            transition={{ duration: "500ms", timingFunction: "ease-in-out" }}
            expandOnPrint
          >
            <BlockStack gap="100">
              <br />
              <Bleed>
                <Placeholder label="B2B Functionality">
                  <Text
                    as="span"
                    tone={
                      b2bCompletionCount < b2bSteps ? "critical" : "success"
                    }
                  >
                    {`${b2bCompletionCount}/${b2bSteps} Completed`}
                  </Text>
                  &nbsp;&nbsp;
                  <Button
                    onClick={handleToggleB2b}
                    ariaExpanded={openB2b}
                    ariaControls="b2b-content"
                    variant="plain"
                    icon={openB2b ? ChevronUpIcon : ChevronDownIcon}
                  />
                </Placeholder>
              </Bleed>
              <Collapsible
                open={openB2b}
                id="b2b-content"
                transition={{
                  duration: "500ms",
                  timingFunction: "ease-in-out",
                }}
                expandOnPrint
              >
                <br />
                <BlockStack gap="300">
                  <BlockStack gap="100">
                    <OnboardingStepGroup>
                      {(expandedIndex, setExpandedIndex) => (
                        <>
                          <CollapsibleOnboardingStep
                            title="Choose your store type"
                            isCompleted={Boolean(storeType)}
                            isExpanded={expandedIndex === 0}
                            onToggle={() =>
                              setExpandedIndex(expandedIndex === 0 ? -1 : 0)
                            }
                          >
                            <div style={{ paddingLeft: "30px" }}>
                              <Text as="p">
                                Launch a dedicated B2B portal or add B2B
                                features to your consumer site.
                              </Text>
                            </div>

                            <ChoiceList
                              title=""
                              choices={[
                                {
                                  label: (
                                    <StoreTypeCard
                                      title="B2B"
                                      subtitle="B2B Portal"
                                      description="For approved B2B buyers only. Checkout and wholesale prices are hidden until login."
                                      isSelected={selected.includes("B2B")}
                                    />
                                  ),
                                  value: "B2B",
                                },
                                {
                                  label: (
                                    <StoreTypeCard
                                      title="B2B & B2C"
                                      subtitle="Hybrid"
                                      description="Add B2B features to your B2C site. Regular shoppers see full prices, B2B buyers see wholesale prices & quantity rules."
                                      isSelected={selected.includes("Hybrid")}
                                    />
                                  ),
                                  value: "Hybrid",
                                },
                              ]}
                              selected={selected}
                              onChange={handleChange}
                            />
                            <br />
                            <div style={{ paddingLeft: "30px" }}>
                              <Button
                                variant="primary"
                                onClick={() => handleSubmit("store-type-setup")}
                                size="large"
                                disabled={isLoading || !selected.length}
                                loading={isLoading}
                              >
                                {isLoading ? "Saving..." : "Save"}
                              </Button>
                            </div>
                          </CollapsibleOnboardingStep>
                          <CollapsibleOnboardingStep
                            title="Create your first buyer group"
                            isCompleted={Number(!!indexData.groupCount) > 0}
                            isExpanded={expandedIndex === 1}
                            onToggle={() =>
                              setExpandedIndex(expandedIndex === 1 ? -1 : 1)
                            }
                          >
                            <div style={{ paddingLeft: "30px" }}>
                              <Text as="p">
                                Group wholesale buyers into "Buyer Groups" to
                                streamline your B2B operations. Each{" "}
                                <em>Buyer Group</em> can have its own pricing,
                                quantity rules, and payment options.
                              </Text>
                              <br />
                              <Link to="/app/buyer-group/add">
                                <Button variant="primary" size="large">
                                  Create Group
                                </Button>
                              </Link>
                            </div>
                          </CollapsibleOnboardingStep>
                          <CollapsibleOnboardingStep
                            title="Adjust individual SKUs: tiered discounts & price/quantity override"
                            isCompleted={
                              Number(!!indexData.volumePriceConfigCount) > 0
                            }
                            isExpanded={expandedIndex === 2}
                            onToggle={() =>
                              setExpandedIndex(expandedIndex === 2 ? -1 : 2)
                            }
                          >
                            <div style={{ paddingLeft: "30px" }}>
                              <Text as="p">
                                Optional: Create tiered price breaks to
                                incentivize larger orders, and manually adjust
                                pricing & quantity rules for specific products
                                within a Buyer Group.
                              </Text>
                            </div>
                            <div style={{ paddingLeft: "50px" }}>
                              <ol>
                                <li>
                                  Select the{" "}
                                  <Link to="/app/buyer-group">Buyer Group</Link>{" "}
                                  that you would like to adjust
                                </li>
                                <li>
                                  Select{" "}
                                  <b>"Tiered Discounts and Rule Overrides"</b>
                                </li>
                              </ol>
                            </div>
                          </CollapsibleOnboardingStep>
                          <CollapsibleOnboardingStep
                            title="Assign buyers to your buyer group"
                            isCompleted={
                              Number(!!indexData.taggedCustomersCount) > 0
                            }
                            isExpanded={expandedIndex === 3}
                            onToggle={() =>
                              setExpandedIndex(expandedIndex === 3 ? -1 : 3)
                            }
                          >
                            <div style={{ paddingLeft: "30px" }}>
                              <Text as="p">
                                Add wholesale buyers to specific Buyer Groups to
                                provide them with relevant pricing, quantity
                                rules, and payment options.
                              </Text>
                            </div>
                            <div style={{ paddingLeft: "50px" }}>
                              <ol>
                                <li>
                                  Select the{" "}
                                  <Link to="/app/buyer-group">Buyer Group</Link>{" "}
                                  that you would like to add buyers to.
                                </li>
                                <li>
                                  Select <b>"Assign Buyers"</b> button
                                </li>
                              </ol>
                            </div>
                          </CollapsibleOnboardingStep>
                          <CollapsibleOnboardingStep
                            title="Setup Wholesale Registration Form"
                            isCompleted={
                              Number(
                                !!indexData.hasWholesalePortalAccessCount,
                              ) > 0
                            }
                            isExpanded={expandedIndex === 4}
                            onToggle={() =>
                              setExpandedIndex(expandedIndex === 4 ? -1 : 4)
                            }
                          >
                            <div style={{ paddingLeft: "30px" }}>
                              <Text as="p">
                                Add the wholesale registration page to your
                                store for new buyers to fill out their account
                                info.
                              </Text>
                            </div>
                            <div style={{ paddingLeft: "50px" }}>
                              <ol>
                                <li>
                                  Select the{" "}
                                  <Link to="/app/wholesaleportalaccess">
                                    Wholesale Portal Access
                                  </Link>{" "}
                                  page.
                                </li>
                                <li>
                                  Follow the instructions from the Video
                                  Tutorial at the bottom of the page.
                                </li>
                              </ol>
                            </div>
                          </CollapsibleOnboardingStep>
                        </>
                      )}
                    </OnboardingStepGroup>
                  </BlockStack>
                </BlockStack>
                <br />
              </Collapsible>
              <Bleed>
                <Placeholder label="Increase revenue with upsells">
                  <Text
                    as="span"
                    tone={
                      upsellCompletionCount < upsellSteps
                        ? "critical"
                        : "success"
                    }
                  >
                    {`${upsellCompletionCount}/${upsellSteps} Completed`}
                  </Text>
                  &nbsp;&nbsp;
                  <Button
                    onClick={handleToggleUpsell}
                    ariaExpanded={openUpsell}
                    ariaControls="upsell-onboarding-content"
                    variant="plain"
                    icon={openUpsell ? ChevronUpIcon : ChevronDownIcon}
                  ></Button>
                </Placeholder>
              </Bleed>
              <Collapsible
                open={openUpsell}
                id="upsell-onboarding-content"
                transition={{
                  duration: "500ms",
                  timingFunction: "ease-in-out",
                }}
                expandOnPrint
              >
                <br />
                <BlockStack gap="100">
                  <OnboardingStepGroup>
                    {(expandedIndex, setExpandedIndex) => (
                      <>
                        <CollapsibleOnboardingStep
                          title="Buy More Save More"
                          isCompleted={isSetUpsell}
                          isExpanded={expandedIndex === 0}
                          onToggle={() =>
                            setExpandedIndex(expandedIndex === 0 ? -1 : 0)
                          }
                        >
                          <div style={{ paddingLeft: "30px" }}>
                            <Text as="p">
                              Encourage buyers to increase their order size to
                              unlock the next discount tier. If tiered price
                              breaks are set, an in-cart upsell prompts buyers
                              to add the exact number of units needed for the
                              next discount level—and can be accepted with a
                              single click.
                            </Text>
                            <br />
                            <Text as="p">
                              <b>Benefits:</b> Boosts order volume and average
                              order value while maximizing buyer savings.
                            </Text>
                            <br />
                            <Link to="/app/storeconfigs">
                              <Button variant="primary" size="large">
                                Configure Settings
                              </Button>
                            </Link>
                          </div>
                        </CollapsibleOnboardingStep>
                        <CollapsibleOnboardingStep
                          title="Top Sellers"
                          isCompleted={Number(!!indexData.topSellerCount) > 0}
                          isExpanded={expandedIndex === 1}
                          onToggle={() =>
                            setExpandedIndex(expandedIndex === 1 ? -1 : 1)
                          }
                        >
                          <div style={{ paddingLeft: "30px" }}>
                            <Text as="p">
                              Introduce buyers to best-selling products they
                              haven't yet purchased, encouraging them to expand
                              their selection and discover new favorites. Upsell
                              appears as a pop-up and in their cart.
                            </Text>
                            <br />
                            <Text as="p">
                              <b>Benefits:</b> Improves product adoption and
                              increases order size.
                            </Text>
                            <br />
                            <Link to="/app/upsells/upsell-top-products">
                              <Button variant="primary" size="large">
                                {" "}
                                Set up{" "}
                              </Button>
                            </Link>
                          </div>
                        </CollapsibleOnboardingStep>
                        <CollapsibleOnboardingStep
                          title="Complementary Products"
                          isCompleted={
                            Number(!!indexData.updatedCounts.assigned) > 0
                          }
                          isExpanded={expandedIndex === 2}
                          onToggle={() =>
                            setExpandedIndex(expandedIndex === 2 ? -1 : 2)
                          }
                        >
                          <div style={{ paddingLeft: "30px" }}>
                            <Text as="p">
                              Introduce buyers to best-selling products they
                              haven't yet purchased, encouraging them to expand
                              their selection and discover new favorites. Upsell
                              appears as a pop-up and in their cart.
                            </Text>
                            <br />
                            <Text as="p">
                              <b>Benefits:</b> Encourages product adoption,
                              increases order value, and helps buyers boost
                              order size when selling to end consumers.
                            </Text>
                            <br />
                            <Link to="/app/upsells/upsell-complementary-products">
                              <Button variant="primary" size="large">
                                {" "}
                                Set up{" "}
                              </Button>
                            </Link>
                          </div>
                        </CollapsibleOnboardingStep>
                      </>
                    )}
                  </OnboardingStepGroup>
                </BlockStack>
                <br />
              </Collapsible>
              <Bleed>
                <Placeholder label="Online store integration">
                  <Text
                    as="span"
                    tone={
                      enableAppEmbeds && enableUpsellBlock
                        ? "success"
                        : "critical"
                    }
                  >
                    {`${enableAppEmbeds && enableUpsellBlock ? 1 : 0}/${1} Completed`}
                  </Text>
                  &nbsp;&nbsp;
                  <Button
                    onClick={handleToggleOnlineStoreSetup}
                    ariaExpanded={openOnlineStoreSetup}
                    ariaControls="online-store-setup-content"
                    variant="plain"
                    icon={
                      openOnlineStoreSetup ? ChevronUpIcon : ChevronDownIcon
                    }
                  />
                </Placeholder>
              </Bleed>
              <Collapsible
                open={openOnlineStoreSetup}
                id="online-store-setup-content"
                transition={{
                  duration: "500ms",
                  timingFunction: "ease-in-out",
                }}
                expandOnPrint
              >
                <br />
                <BlockStack gap="300">
                  <BlockStack gap="100">
                    <OnboardingStepGroup>
                      {(expandedIndex, setExpandedIndex) => (
                        <>
                          <CollapsibleOnboardingStep
                            title="Configure your theme to enable B2B and Upsell features in your online store."
                            isCompleted={Boolean(
                              enableAppEmbeds && enableUpsellBlock,
                            )}
                            isExpanded={expandedIndex === 0}
                            onToggle={() =>
                              setExpandedIndex(expandedIndex === 0 ? -1 : 0)
                            }
                          >
                            <br />
                            <BlockStack gap="300">
                              <Text as="h3">
                                <b>
                                  1. Migrating? Set up in "Test Mode"{" "}
                                  <Badge tone="info">Optional</Badge>
                                </b>
                              </Text>
                              <Text as="p">
                                If you are migrating from a different B2B App or
                                just wanted to test out PortalSphere, you can
                                set up in "Test Mode" to ensure everything works
                                before going live.
                              </Text>
                              <div
                                id="floik-iframe-container-m840ig94"
                                style={{
                                  overflow: "hidden",
                                  borderRadius: "16px",
                                  position: "relative",
                                  width: "100%",
                                  maxHeight: "100%",
                                  aspectRatio: "1.7777777777777777",
                                  border: "2px solid #ddd",
                                }}
                              >
                                <iframe
                                  id="floik-iframe-m840ig94"
                                  allow="autoplay; fullscreen; clipboard-read; clipboard-write"
                                  allowFullScreen
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    border: "none",
                                    position: "absolute",
                                    top: "0",
                                    left: "0",
                                  }}
                                  src="https://www.floik.com/embed/f5085237-905a-461b-b209-c8c7d86b5e2f/57720235-ceb2-4684-b25a-dae59904fe54-flo.html?show-author=true"
                                ></iframe>
                              </div>
                            </BlockStack>
                            <br />
                            <BlockStack gap="300">
                              <Text as="h3">
                                <b>2. Enabling PortalSphere on Theme Editor</b>
                              </Text>
                              <Text as="p">
                                Configure App Embed and App Blocks in the theme
                                editor to enable PortalSphere.
                              </Text>
                              <div
                                id="floik-iframe-container-m840ig94"
                                style={{
                                  overflow: "hidden",
                                  borderRadius: "16px",
                                  position: "relative",
                                  width: "100%",
                                  maxHeight: "100%",
                                  aspectRatio: "1.7777777777777777",
                                  border: "2px solid #ddd",
                                }}
                              >
                                <iframe
                                  id="floik-iframe-m840ig94"
                                  allow="autoplay; fullscreen; clipboard-read; clipboard-write"
                                  allowFullScreen
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    border: "none",
                                    position: "absolute",
                                    top: "0",
                                    left: "0",
                                  }}
                                  src="https://www.floik.com/embed/f5085237-905a-461b-b209-c8c7d86b5e2f/c0032c85-ac5c-4473-9aee-2a029170babd-flo.html?show-author=true"
                                ></iframe>
                              </div>
                              <br />
                            </BlockStack>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                paddingLeft: "30px",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={enableUpsellBlock}
                                onChange={handleUpsellBlockChange}
                                style={{ marginRight: "8px" }}
                              />
                              <Text as="p">
                                <b>
                                  Add App Block for Complementary Upsell and
                                  Product Pricing Table:
                                </b>
                              </Text>
                            </div>
                            <div style={{ paddingLeft: "50px" }}>
                              <ol>
                                <li>
                                  Select <b>Online Store</b> in Sales channels
                                  section of the Admin side panel
                                </li>
                                <li>
                                  Click <b>"Customize"</b> button
                                </li>
                                <li>
                                  Click <b>"Sections"</b> on the left vertical
                                  tab icons
                                </li>
                                <li>
                                  Navigate your Theme viewer to product
                                  information page (<i> click any product</i>)
                                </li>
                                <li>
                                  Select the position to add the block (
                                  <i>
                                    {" "}
                                    click "Add block" in any space in between
                                    components
                                  </i>
                                  )
                                </li>
                                <li>
                                  Select <b>"Apps"</b> tab
                                </li>
                                <li>
                                  Click <b>"Complementary Products"</b>
                                </li>
                                <li>
                                  Do the same steps for{" "}
                                  <b>"Product Pricing Table"</b>
                                </li>
                                <li>
                                  Click <b>Save</b>
                                </li>
                              </ol>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                paddingLeft: "30px",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={enableAppEmbeds}
                                onChange={handleAppEmbedsChange}
                                style={{ marginRight: "8px" }}
                              />
                              <Text as="p">
                                <b>Enable App Embeds:</b>
                              </Text>
                            </div>
                            <div style={{ paddingLeft: "50px" }}>
                              <ol>
                                <li>
                                  Select <b>Online Store</b> in Sales channels
                                  section of the Admin side panel
                                </li>
                                <li>
                                  Click <b>"Customize"</b> button
                                </li>
                                <li>
                                  Click <b>"App embeds"</b> on the left vertical
                                  tab icons
                                </li>
                                <li>
                                  Turn-on the toggle switch for the following:
                                </li>
                                <ul>
                                  <li>
                                    <b>Product Pricing</b>
                                  </li>
                                  <li>
                                    <b>Top Sellers Cart</b>
                                  </li>
                                  <li>
                                    <b>Top Sellers Popup</b>
                                  </li>
                                </ul>
                                <li>
                                  Click <b>Save</b>
                                </li>
                              </ol>
                            </div>
                            <br />
                            <div style={{ paddingLeft: "30px" }}>
                              <Button
                                variant="primary"
                                onClick={() =>
                                  handleSubmit("online-store-setup")
                                }
                                size="large"
                                disabled={isLoading || !selected.length}
                                loading={isLoading}
                              >
                                {isLoading ? "Saving..." : "Save Status"}
                              </Button>
                            </div>
                          </CollapsibleOnboardingStep>
                        </>
                      )}
                    </OnboardingStepGroup>
                  </BlockStack>
                </BlockStack>
                <br />
              </Collapsible>
            </BlockStack>
          </Collapsible>
        </Card>
        {/* New Video Guide Component */}
        <div style={{ marginBottom: '32px' }}>
          <Card>
            <VideoGuide 
              videos={[
                              {
                title: "Setup in Test Mode",
                description: "Duplicate your current store theme to safely set up PortalSphere without affecting your live site.",
                videoUrl: "https://www.floik.com/embed/f5085237-905a-461b-b209-c8c7d86b5e2f/57720235-ceb2-4684-b25a-dae59904fe54-flo.html?show-author=true",
                thumbnailUrl: "/assets/setup-test-CalBETY2.png",
                videoLength: 63
              },
              {
                title: "Enable App In The Theme Editor",
                description: "Enable PortalSphere in your test store's theme editor. If switching from another B2B app, disable it.",
                videoUrl: "https://www.floik.com/embed/f5085237-905a-461b-b209-c8c7d86b5e2f/c0032c85-ac5c-4473-9aee-2a029170babd-flo.html?show-author=true",
                thumbnailUrl: "/assets/enable-app-BhVzys-o.png",
                videoLength: 166
              },
              {
                title: "Setup Pricing & Buyer Groups",
                description: "Create buyer groups based on pricing, quantitylimits, and payment terms. Assign buyers to groups.",
                videoUrl: "https://www.floik.com/embed/f5085237-905a-461b-b209-c8c7d86b5e2f/945da644-42b3-4796-8afa-cf97ba4821cf-flo.html",
                thumbnailUrl: "/assets/setup-price-DJYcB6Vx.png",
                videoLength: 247
              },
              {
                title: "Setup Wholesale Registration Form",
                description: "Add the wholesale registration page to your store for new buyers to fill out their account info.",
                videoUrl: "https://www.floik.com/embed/f5085237-905a-461b-b209-c8c7d86b5e2f/5a723daa-3d67-4d75-8dfe-a896acee9d9d-flo.html?show-author=true",
                thumbnailUrl: "/assets/setup-wholesaler-registration-DIhsWs-J.jpeg",
                videoLength: 200
              },
              {
                title: "Setup Top-Seller Upsell",
                description: "Boost product adoption with personalized recommendations based on top-sellers a buyer hasn't purchased yet.",
                videoUrl: "https://www.floik.com/embed/f5085237-905a-461b-b209-c8c7d86b5e2f/a3d65cc4-8983-4e6a-b638-8f55f0d760ec-flo.html",
                thumbnailUrl: "/assets/top-seller-upsell-CKNeAkfR.jpeg",
                videoLength: 108
              },
              {
                title: "Manually Create A Wholesale Order",
                description: "Explore on how to manually create a wholesale order from your shopify store's admin panel.",
                videoUrl: "https://www.floik.com/embed/f5085237-905a-461b-b209-c8c7d86b5e2f/c5e4644c-7f12-453a-8b35-eb34468a80bf-flo.html",
                thumbnailUrl: "/assets/create-wholesale-order-B0oI3R5s.png",
                videoLength: 100
              }
              ]} 
            />
          </Card>
        </div>
      </BlockStack>
      
      {/* Video Modal */}
      {showVideo && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setShowVideo(false)}
        >
          <div
            style={{
              position: "relative",
              width: "90%",
              maxWidth: "1200px",
              maxHeight: "90vh",
              backgroundColor: "white",
              borderRadius: "16px",
              overflow: "hidden",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowVideo(false)}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                width: "32px",
                height: "32px",
                backgroundColor: "rgba(0, 0, 0, 0.7)",
                border: "none",
                borderRadius: "50%",
                color: "white",
                fontSize: "18px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}
            >
              ×
            </button>
            
            {/* Video Content */}
            <div id='floik-iframe-container-melocitt'
              style={{
                overflow: "hidden",
                borderRadius: "16px",
                position: "relative",
                width: "100%",
                maxHeight: "100%",
                aspectRatio: "1.6",
              }}
            >
              <iframe id='floik-iframe-melocitt'
                frameBorder='0'
                allowFullScreen={true}
                mozallowfullscreen='true'
                webkitallowfullscreen='true'
                style={{
                  width: '100%', 
                  height: '100%', 
                  border: 'none', 
                  position: 'absolute', 
                  top: 0, 
                  left: 0
                }}
                width='1920px'
                height='1200px'
                src='https://www.floik.com/embed/f5085237-905a-461b-b209-c8c7d86b5e2f/5089912b-1fad-4ab4-83d6-b2dd6f2ff530-flo.html'
                allow="clipboard-read; clipboard-write"
              />
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
