import React, { useState, useEffect, useRef } from "react";
import { Button, Layout, Page, Text } from "@shopify/polaris";
import PageHeader from "~/components/PageHeader";
import tailwindStyle from "../styles/app.css?url";
import type { ActionFunctionArgs, LinksFunction } from "@remix-run/node";
import BuyGroupGeneralInfo from "~/components/BuyGroupGeneralInfo";
import { type BuyerGroupForm } from "~/models/BuyerGroup";
import BuyerDefaultDiscounts from "~/components/BuyerGroupDefaultDiscounts";
import BuyerGroupOverrides from "~/components/BuyerGroupOverrides";
import BuyerGroupNetTerms from "~/components/BuyerGroupNetTerms";
import { Trash } from "lucide-react";
import { json, useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
//import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

import { getGroupOverrides } from "~/services/BuyerGroupOverrides.server";
import PortalModal from "../components/PortalModal";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useDuplicateBuyerGroup } from "~/hooks/useDuplicateBuyerGroup";
import { BuyerGroupCsvModal } from "~/components/BuyerGroupCsvModal";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: tailwindStyle },
];

export const loader = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const prisma = (await import("~/db.server")).default;
  const segmentId = url.searchParams.get("segmentId");
  let groupData = null;
  if (segmentId) {
    const data = await prisma.shopSegmentsData.findMany({
      where: {
        segmentId,
        tagID: { not: null },
      },
      select: {
        id: true,
        segmentName: true,
        segmentId: true,
        tagID: true,
        status: true,
        description: true,
        defaultDiscount: true,
        defaultMOQ: true,
        paymentMethods: true,
        productDiscounts: true,
        collectionDiscounts: true,
        storeDiscounts: true,
        buyers: {
          select: {
            customerId: true,
            customerName: true,
          },
        },
      },
    });
    groupData = data[0] || null;
  }
  const { mergedProductOverrides, mergedCollectionOverrides } = segmentId
    ? await getGroupOverrides(segmentId, request)
    : { mergedProductOverrides: [], mergedCollectionOverrides: [] };
  if (groupData && typeof groupData.id === "bigint") {
    (groupData as any).id = groupData.id.toString();
  }
  return json({ groupData, mergedProductOverrides, mergedCollectionOverrides });
};

const DuplicateBuyerGroupModal = ({
  setPopupOpen,
  selectedGroup,
}: {
  setPopupOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedGroup: any;
}) => {
  const [buyerGroupName, setBuyerGroupName] = useState("");
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const duplicateBuyerGroup = useDuplicateBuyerGroup();

  const handleGroupNameChange = (value: string) => {
    setBuyerGroupName(value);

    // Clear error when user starts typing
    if (value.trim() && errors.groupName) {
      setErrors((prev) => ({ ...prev, groupName: "" }));
    }
  };
  const validateGroupName = () => {
    if (!buyerGroupName.trim()) {
      setErrors((prev) => ({ ...prev, groupName: "Group name is required" }));
      return false;
    }
    return true;
  };

  const handleDirectSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    // Validate required fields before submission
    if (!validateGroupName()) {
      return;
    }

    duplicateBuyerGroup.mutate({
      groupId: selectedGroup.id,
      name: buyerGroupName,
    });
  };

  useEffect(() => {
    if (duplicateBuyerGroup.isError) {
      setErrors((prev) => ({
        ...prev,
        groupName: duplicateBuyerGroup.error.message,
      }));
    }
  }, [duplicateBuyerGroup.isError]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
        zIndex: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={() => {
        setPopupOpen(false);
      }}
    >
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "30vw",
          maxWidth: "1200px",
          maxHeight: "90vh",
          backgroundColor: "white",
          borderRadius: "12px",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
          zIndex: 1000,
          overflow: "hidden",
          animation: "slideIn 0.3s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #e3e4e8",
            backgroundColor: "#f9fafb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "start",
          }}
        >
          <h2 className="font-bold text-xl">Duplicate Buyer Group</h2>
        </div>
        <div
          style={{
            padding: "20px 24px",
            backgroundColor: "#f9fafb",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            alignItems: "start",
          }}
        >
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Duplicate Group name <span className="text-red-500">*</span>{" "}
            <span className="text-xs text-gray-500">(Required)</span>
          </label>
          <input
            name="groupName"
            type="text"
            value={buyerGroupName}
            onChange={(e) => handleGroupNameChange(e.target.value)}
            onBlur={validateGroupName}
            className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors.groupName
                ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                : "border-gray-300"
            }`}
          />
          {errors.groupName && (
            <p className="mt-1 text-sm text-red-600">{errors.groupName}</p>
          )}
        </div>
        <div
          style={{
            padding: "20px 24px",
            backgroundColor: "#f9fafb",
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            width: "100%",
          }}
        >
          <Button
            variant="primary"
            onClick={handleDirectSubmit}
            disabled={duplicateBuyerGroup.isPending}
          >
            Save & Continue
          </Button>
        </div>
      </div>
    </div>
  );
};

export default function BuyerGroupForm() {
  const {
    groupData,
    mergedProductOverrides: initialMergedProductOverrides,
    mergedCollectionOverrides: initialMergedCollectionOverrides,
  } = useLoaderData<typeof loader>();
  const [duplicatePopupOpen, setDuplicatePopupOpen] = useState(false);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [formData, setFormData] = useState<ExtendedBuyerGroupForm>(
    groupData
      ? (() => {
          // Use type guards to avoid linter errors for missing properties
          let storeDiscounts: any = {};
          if ("storeDiscounts" in groupData && groupData.storeDiscounts) {
            try {
              storeDiscounts =
                typeof groupData.storeDiscounts === "string"
                  ? JSON.parse(groupData.storeDiscounts)
                  : groupData.storeDiscounts;
            } catch {
              storeDiscounts = {};
            }
          }
          const volumeConfig =
            storeDiscounts &&
            typeof storeDiscounts === "object" &&
            "volumeConfig" in storeDiscounts &&
            storeDiscounts.volumeConfig
              ? storeDiscounts.volumeConfig
              : {};
          function coerceMaxQty(val: any): number | "" {
            if (val === "" || val === undefined || val === null) return "";
            const num = Number(val);
            return isNaN(num) ? "" : num;
          }
          // Always set the default discount from storeDiscounts.discount and volumeConfig
          const discountPercent = storeDiscounts.discount
            ? storeDiscounts.discount.toString()
            : "";
          const minQty =
            volumeConfig.minimum !== undefined && volumeConfig.minimum !== null
              ? Number(volumeConfig.minimum)
              : 1;
          const maxQty = coerceMaxQty(volumeConfig.maximum);
          const increments =
            volumeConfig.increments !== undefined &&
            volumeConfig.increments !== null
              ? Number(volumeConfig.increments)
              : 1;
          // Set priceConfig from storeDiscounts.priceConfig if present
          const priceConfig = Array.isArray(storeDiscounts.priceConfig)
            ? storeDiscounts.priceConfig
            : [];
          // Fix: Set netTermsEnabled based on paymentMethods
          const netTermsEnabled =
            typeof groupData.paymentMethods === "string" &&
            groupData.paymentMethods
              .split(",")
              .map((s) => s.trim())
              .includes("NetTerms");
          return {
            groupName: groupData.segmentName,
            shortDescription:
              typeof groupData.description === "string"
                ? groupData.description
                : "",
            tiers: [
              {
                discountPercent,
                minQty,
                maxQty,
                increments,
              },
            ],
            priceConfig,
            netTermsEnabled,
            overrides: JSON.stringify([
              ...(initialMergedProductOverrides || []),
              ...(initialMergedCollectionOverrides || []),
            ]),
          };
        })()
      : {
          groupName: "",
          shortDescription: "",
          tiers: [],
          priceConfig: [],
          netTermsEnabled: false,
          overrides: "[]",
        },
  );
  const [mergedProductOverrides, setMergedProductOverrides] = useState<any[]>(
    Array.isArray(initialMergedProductOverrides)
      ? initialMergedProductOverrides
      : [],
  );
  const [mergedCollectionOverrides, setMergedCollectionOverrides] = useState<
    any[]
  >(
    Array.isArray(initialMergedCollectionOverrides)
      ? initialMergedCollectionOverrides
      : [],
  );
  const [isGeneralInfoValid, setIsGeneralInfoValid] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [pendingBack, setPendingBack] = useState(false);

  const fetcher = useFetcher();
  const navigate = useNavigate();
  useEffect(() => {
    if (fetcher.data && (fetcher.data as any).success) {
      // For both edit mode and create mode: redirect to buyergroup page with expanded row
      const segmentId = groupData?.segmentId || (fetcher.data as any).groupId;
      const pageNumber = (fetcher.data as any).pageNumber || 1;
      navigate(`/app/buyer-group?expanded=${segmentId}&page=${pageNumber}`);
    }
  }, [fetcher.data, navigate, groupData]);

  // Track initial form state for unsaved changes detection
  const [initialFormData, setInitialFormData] = useState(() =>
    JSON.stringify(formData),
  );

  const buyerGroupOverridesRef = useRef<any>(null);

  const handleDirectSubmit = (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    // Validate required fields before submission
    if (!formData.groupName.trim()) {
      setShowValidationErrors(true);
      return;
    }

    // Validate discount field from BuyerDefaultDiscounts
    let tiers: any[] = [];
    if (formData.tiers) {
      try {
        if (typeof formData.tiers === "string") {
          tiers = JSON.parse(formData.tiers);
        } else if (Array.isArray(formData.tiers)) {
          tiers = formData.tiers;
        }
      } catch (error) {
        console.error("Error parsing tiers:", error);
        setShowValidationErrors(true);
        return;
      }
    }

    if (tiers && Array.isArray(tiers) && tiers.length > 0) {
      const firstTier = tiers[0];
      if (
        !firstTier ||
        !firstTier.discountPercent ||
        firstTier.discountPercent.trim() === ""
      ) {
        setShowValidationErrors(true);
        return;
      }
    } else {
      // No tiers defined, discount is required
      setShowValidationErrors(true);
      return;
    }
    // --- Use ref to get correct overrides from BuyerGroupOverrides ---
    const productOverrides =
      buyerGroupOverridesRef.current?.getOverridesForSubmit(
        mergedProductOverrides,
        "products",
      ) ?? [];
    const collectionOverrides =
      buyerGroupOverridesRef.current?.getOverridesForSubmit(
        mergedCollectionOverrides,
        "collections",
      ) ?? [];
    // Use these in your payload:
    const latestOverrides = JSON.stringify([
      ...productOverrides,
      ...collectionOverrides,
    ]);
    const apiData = transformFormDataToApiFormat({
      ...formData,
      overrides: latestOverrides,
    });
    // If editing, include segmentId in the payload
    if (groupData && groupData.id) {
      (apiData.input as any).id = groupData.id;
    }
    console.log("Data to be submitted:", apiData);
    fetcher.submit(
      { stateData: JSON.stringify(apiData) },
      {
        method: "post",
        action: "/api/buyer-group/add",
        encType: "application/x-www-form-urlencoded",
      },
    );
  };

  const updateFormData = (
    field: keyof ExtendedBuyerGroupForm,
    value: string,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    // If updating overrides, also update mergedProductOverrides and mergedCollectionOverrides
    if (field === "overrides") {
      try {
        const parsedOverrides = JSON.parse(value);
        // Separate product and collection overrides
        setMergedProductOverrides(
          parsedOverrides
            .filter((item: any) => item.appliesTo === "products")
            .map((item: any) => ({
              ...item,
              discountType:
                item.discountType || item.discount_type || "percentage",
              discount_type:
                item.discountType || item.discount_type || "percentage",
            }))
            .map(ensureTieredBreaksAndPriceConfig),
        );
        setMergedCollectionOverrides(
          parsedOverrides
            .filter((item: any) => item.appliesTo === "collections")
            .map((item: any) => ({
              ...item,
              discountType:
                item.discountType || item.discount_type || "percentage",
              discount_type:
                item.discountType || item.discount_type || "percentage",
            }))
            .map(ensureTieredBreaksAndPriceConfig),
        );
        console.log("Parent mapped overrides:", parsedOverrides);
      } catch {}
    }
  };

  // Helper to check for unsaved changes
  const hasUnsavedChanges = () => JSON.stringify(formData) !== initialFormData;

  // Helper to check if form is valid (all required fields filled)
  const isFormValid = () => {
    try {
      const hasGroupName = formData.groupName.trim();
      const hasDiscount = (() => {
        if (typeof formData.tiers === "string") {
          const tiers = JSON.parse(formData.tiers);
          return (
            tiers &&
            Array.isArray(tiers) &&
            tiers.length > 0 &&
            tiers[0] &&
            tiers[0].discountPercent &&
            tiers[0].discountPercent.trim() !== ""
          );
        } else if (Array.isArray(formData.tiers)) {
          return (
            formData.tiers.length > 0 &&
            formData.tiers[0] &&
            formData.tiers[0].discountPercent &&
            formData.tiers[0].discountPercent.trim() !== ""
          );
        }
        return false;
      })();

      // Debug logging
      console.log("Form validation:", {
        hasGroupName,
        hasDiscount,
        groupName: formData.groupName,
        tiers: formData.tiers,
      });

      return hasGroupName && hasDiscount;
    } catch (error) {
      console.error("Form validation error:", error);
      return false;
    }
  };

  // After successful submit, update initialFormData
  useEffect(() => {
    if (fetcher.data && (fetcher.data as any).success) {
      setInitialFormData(JSON.stringify(formData));
    }
  }, [fetcher.data]);
  return (
    <Page fullWidth={true}>
      <Layout>
        <Layout.Section>
          <fetcher.Form
            onSubmit={handleDirectSubmit}
            method="post"
            data-save-bar
            action="/api/buyer-group/add"
          >
            <div
              style={{
                marginLeft: 160,
                marginRight: 160,
                background: "rgb(241,242,244)",
                minHeight: "100vh",
                padding: 24,
              }}
            >
              <div className=" mb-4 w-full">
                <PageHeader title="Create" subtitle="Buyer Group" />
                {groupData && (
                  <div className="flex justify-end mt-6 gap-3 pb-6 pr-5">
                    <Button
                      variant="primary"
                      size="large"
                      onClick={() => {
                        setDuplicatePopupOpen(true);
                      }}
                    >
                      Duplicate
                    </Button>
                    {groupData && (
                      <Button
                        variant="primary"
                        size="large"
                        onClick={() => {
                          setCsvModalOpen(true);
                        }}
                      >
                        Import / Export CSV
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div style={{ margin: "8px 0 4px 0" }}></div>

              {/* Spinner overlay when submitting */}
              {fetcher.state === "submitting" && <LoadingSpinner />}

              <div className="mt-6"></div>

              <BuyGroupGeneralInfo
                formData={formData}
                updateFormData={updateFormData}
                onValidationChange={setIsGeneralInfoValid}
                showValidationErrors={showValidationErrors}
              />

              <div className="mb-8"></div>

              <BuyerDefaultDiscounts
                formData={formData}
                updateFormData={updateFormData}
                showValidationErrors={showValidationErrors}
              />

              <div className="mb-8"></div>

              <BuyerGroupOverrides
                ref={buyerGroupOverridesRef}
                formData={formData}
                productOverrides={mergedProductOverrides}
                collectionOverrides={mergedCollectionOverrides}
                updateFormData={updateFormData}
                onOverridesChange={() => {}}
              />

              <div className="mb-8"></div>

              <BuyerGroupNetTerms
                formData={formData}
                updateFormData={updateFormData}
              />

              <div className="flex justify-end mt-6 gap-3 pb-6 pr-5">
                <button
                  type="button"
                  className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300"
                  onClick={() => {
                    if (hasUnsavedChanges()) {
                      setShowUnsavedModal(true);
                      setPendingBack(true);
                    } else {
                      navigate("/app/buyer-group");
                    }
                  }}
                >
                  ← Back
                </button>
                {showUnsavedModal && (
                  <PortalModal>
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                      <div className="bg-white rounded-lg max-w-md w-full p-6">
                        <h2 className="text-lg font-semibold mb-4 text-gray-900">
                          Unsaved Changes
                        </h2>
                        <p className="mb-6 text-gray-700">
                          You have unsaved changes. Are you sure you want to
                          leave this page?
                        </p>
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300"
                            onClick={() => {
                              setShowUnsavedModal(false);
                              setPendingBack(false);
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="px-4 py-2 rounded-md bg-red-500 text-white hover:bg-red-700"
                            onClick={() => {
                              setShowUnsavedModal(false);
                              setPendingBack(false);
                              navigate("/app/buyer-group");
                            }}
                          >
                            Leave Page
                          </button>
                        </div>
                      </div>
                    </div>
                  </PortalModal>
                )}
                {groupData && (
                  <>
                    <button
                      type="button"
                      className=" flex gap-2 px-4 py-2 font-[600] text-[.75rem] bg-red-500 shadow-2xs text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                      onClick={() => setShowDeleteModal(true)}
                    >
                      <Trash size={16}></Trash>Delete Group
                    </button>
                    {showDeleteModal && (
                      <PortalModal>
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                          <div className="bg-white rounded-lg max-w-md w-full p-6">
                            <h2 className="text-lg font-semibold mb-4 text-gray-900">
                              Delete Buyer Group
                            </h2>
                            <p className="mb-6 text-gray-700">
                              Are you sure you want to delete this group? This
                              action cannot be undone.
                            </p>
                            <div className="flex justify-end gap-3">
                              <button
                                type="button"
                                className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300"
                                onClick={() => setShowDeleteModal(false)}
                                disabled={deleting}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="px-4 py-2 rounded-md bg-red-500 text-white hover:bg-red-700"
                                onClick={async () => {
                                  if (!groupData.segmentId) return;
                                  setDeleting(true);
                                  try {
                                    const res = await fetch(
                                      `/api/buyer-group/delete?segmentId=${encodeURIComponent(groupData.segmentId)}`,
                                    );
                                    const data = await res.json();
                                    if (data.status) {
                                      navigate("/app/buyer-group");
                                    } else {
                                      alert(
                                        data.message ||
                                          "Failed to delete group.",
                                      );
                                    }
                                  } catch (err) {
                                    alert("Failed to delete group.");
                                  } finally {
                                    setDeleting(false);
                                    setShowDeleteModal(false);
                                  }
                                }}
                                disabled={deleting}
                              >
                                {deleting ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </PortalModal>
                    )}
                  </>
                )}
                <button
                  type="submit"
                  onClick={() => console.log("Save & Continue button clicked")}
                  disabled={!isFormValid()}
                  className={`px-4 py-2 font-[600] text-[.75rem] rounded-md focus:outline-none focus:ring-2 ${
                    isFormValid()
                      ? "bg-gray-800 text-white hover:bg-gray-800 focus:ring-gray-800"
                      : "bg-gray-300 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  Save & Continue
                </button>
              </div>
            </div>
          </fetcher.Form>
        </Layout.Section>
      </Layout>
      {duplicatePopupOpen && (
        <DuplicateBuyerGroupModal
          setPopupOpen={setDuplicatePopupOpen}
          selectedGroup={groupData}
        />
      )}
      {csvModalOpen && (
        <BuyerGroupCsvModal
          setCsvModalOpen={setCsvModalOpen}
          selectedGroup={groupData}
        />
      )}
    </Page>
  );
}

// Extended interface to include overrides and priceConfig
interface ExtendedBuyerGroupForm extends BuyerGroupForm {
  overrides?: string; // JSON string of overrides from BuyerGroupOverrides component
  priceConfig?: string; // JSON string of price breaks from BuyerGroupDefaultDiscounts
}

// Function to transform existing form data to API format
function transformFormDataToApiFormat(formData: ExtendedBuyerGroupForm) {
  // Parse overrides if they exist
  let productOverrides: any[] = [];
  let collectionOverrides: any[] = [];

  if (formData.overrides) {
    try {
      const parsedOverrides = JSON.parse(formData.overrides);
      // Separate product and collection overrides
      productOverrides = Array.isArray(parsedOverrides)
        ? parsedOverrides
            .filter((item: any) => item.appliesTo === "products")
            .map((item: any) => ({
              type: item.type === "variant" ? "variant" : "product",
              id: item.variantId || item.id,
              discount_type:
                item.discountType || item.discount_type || "percentage",
              discountValue:
                item.tieredBreaks && item.tieredBreaks.length > 0
                  ? item.tieredBreaks[0].discountValue
                  : typeof item.discountValue === "number"
                    ? item.discountValue
                    : undefined,
              volumeConfig: {
                increments: item.increments === "" ? null : item.increments,
                maximum:
                  item.maxQuantity === ""
                    ? null
                    : item.maxQuantity !== undefined
                      ? item.maxQuantity
                      : null,
                minimum: item.minQuantity === "" ? null : item.minQuantity,
              },
              priceConfig: (item.tieredBreaks && item.tieredBreaks.length > 0
                ? item.tieredBreaks
                : item.priceConfig && item.priceConfig.length > 0
                  ? item.priceConfig
                  : []
              ).map((break_: any) => ({
                quantity: break_.quantity,
                value: break_.discountValue ?? break_.value,
              })),
            }))
        : [];
      collectionOverrides = Array.isArray(parsedOverrides)
        ? parsedOverrides
            .filter((item: any) => item.appliesTo === "collections")
            .map((item: any) => ({
              type:
                item.appliesTo === "collections"
                  ? "collection"
                  : item.type === "variant"
                    ? "variant"
                    : "product",
              id:
                typeof item.id === "string" && item.id.startsWith("override_")
                  ? item.id.substring(
                      item.id.lastIndexOf("_gid://shopify/") + 1,
                    )
                  : item.variantId || item.id,
              discount_type:
                item.discountType || item.discount_type || "percentage",
              discountValue:
                item.tieredBreaks && item.tieredBreaks.length > 0
                  ? item.tieredBreaks[0].discountValue
                  : typeof item.discountValue === "number"
                    ? item.discountValue
                    : undefined,
              volumeConfig: {
                increments: item.increments === "" ? null : item.increments,
                maximum:
                  item.maxQuantity === ""
                    ? null
                    : item.maxQuantity !== undefined
                      ? item.maxQuantity
                      : null,
                minimum: item.minQuantity === "" ? null : item.minQuantity,
              },
              priceConfig: (item.tieredBreaks && item.tieredBreaks.length > 0
                ? item.tieredBreaks
                : item.priceConfig && item.priceConfig.length > 0
                  ? item.priceConfig
                  : []
              ).map((break_: any) => ({
                quantity: break_.quantity,
                value: break_.discountValue ?? break_.value,
              })),
            }))
        : [];
    } catch (error) {
      productOverrides = [];
      collectionOverrides = [];
    }
  }

  // Parse default discounts as array if it's a string
  type DefaultDiscount = {
    discountPercent: string;
    minQty: number;
    maxQty: number | "";
    increments: number;
  };
  let defaultDiscountsArr: DefaultDiscount[] = [];
  if (Array.isArray(formData.tiers)) {
    defaultDiscountsArr = formData.tiers;
  } else if (typeof formData.tiers === "string") {
    try {
      defaultDiscountsArr = JSON.parse(formData.tiers);
    } catch {
      defaultDiscountsArr = [];
    }
  } else {
    defaultDiscountsArr = [];
  }
  // If no discountPercent, default to 20
  if (defaultDiscountsArr.length === 0) {
    defaultDiscountsArr = [
      { discountPercent: "20", minQty: 1, maxQty: "", increments: 1 },
    ];
  } else if (!defaultDiscountsArr[0].discountPercent) {
    defaultDiscountsArr[0].discountPercent = "20";
  }

  // Parse priceConfig as array if it's a string
  type PriceBreak = { quantity: number; value: number };
  let priceConfigArr: PriceBreak[] = [];
  if (formData.priceConfig) {
    try {
      priceConfigArr = JSON.parse(formData.priceConfig);
    } catch {
      priceConfigArr = [];
    }
  }

  // Ensure all required fields are present and not empty
  const name = formData.groupName || "Untitled Group";
  const description = formData.shortDescription || "No description provided.";
  const netTerms =
    typeof formData.netTermsEnabled === "boolean"
      ? formData.netTermsEnabled
      : false;
  const defaultStoreWideProductDiscounts = {
    discount:
      defaultDiscountsArr.length > 0 &&
      !isNaN(parseInt(defaultDiscountsArr[0].discountPercent))
        ? parseInt(defaultDiscountsArr[0].discountPercent)
        : 0,
    discount_type: "percentage",
    volumeConfig:
      defaultDiscountsArr.length > 0
        ? {
            increments: defaultDiscountsArr[0].increments ?? 1,
            maximum:
              defaultDiscountsArr[0].maxQty === ""
                ? null
                : (defaultDiscountsArr[0].maxQty ?? null),
            minimum: defaultDiscountsArr[0].minQty ?? 1,
          }
        : {
            increments: 1,
            maximum: null,
            minimum: 1,
          },
    priceConfig: Array.isArray(priceConfigArr)
      ? priceConfigArr.map((breakObj) => ({
          quantity: Number(breakObj.quantity),
          value: Number(breakObj.value),
        }))
      : [],
  };

  return {
    input: {
      name,
      description,
      defaultStoreWideProductDiscounts,
      productOverrides,
      collectionOverrides,
      customers: [], // Empty array as requested
      netTerms,
    },
  };
}

function ensureTieredBreaksAndPriceConfig(override: any) {
  // If priceConfig exists but tieredBreaks does not, add tieredBreaks
  if (
    Array.isArray(override.priceConfig) &&
    (!Array.isArray(override.tieredBreaks) ||
      override.tieredBreaks.length === 0)
  ) {
    override.tieredBreaks = override.priceConfig.map((pc: any) => ({
      quantity: pc.quantity,
      discountValue: pc.value,
    }));
  }
  // If tieredBreaks exists but priceConfig does not, add priceConfig
  if (
    Array.isArray(override.tieredBreaks) &&
    (!Array.isArray(override.priceConfig) || override.priceConfig.length === 0)
  ) {
    override.priceConfig = override.tieredBreaks.map((tb: any) => ({
      quantity: tb.quantity,
      value: tb.discountValue,
    }));
  }
  return override;
}

async function validateRequest(
  input: any,
  dbRecord: any,
  admin: AdminApiContext,
): Promise<any> {
  try {
    let returnVal = {
      status: true,
      message: "",
      errors: [],
    };

    //First check for form fields key presence.
    const requiredFields: string[] = [
      //  "name",
      //  "description",
      //"netTerms", <--- bug
      // "defaultStoreWideProductDiscounts",
    ];
    for (var i in requiredFields) {
      const key = requiredFields[i];
      if (!input[key] || !input.hasOwnProperty(key)) {
        returnVal.status = false;
        returnVal.message = "Invalid form inputs";
        returnVal.errors.push({
          key: "Invalid/empty value",
        });
      }
    }

    //Now fields are verified, now verify in db
    const existingDbRecord = await prisma.shopSegmentsData.findFirst({
      where: {
        shop: dbRecord.shop,
        segmentName: input.name,
        ...(input.id && { NOT: { id: Number(input.id) } }),
      },
    });

    if (existingDbRecord != null && Object.keys(existingDbRecord).length > 0) {
      returnVal.status = false;
      returnVal.message = "Duplicate group name";
      returnVal.errors.push({
        name: "Duplicate group found. Please use another name.",
      });
    }

    return returnVal;
  } catch (error: any) {
    return {
      status: false,
      message: "Invalid values found. Check the breakdowns.",
      errors: [
        {
          global: error.message,
        },
      ],
    };
  }
}