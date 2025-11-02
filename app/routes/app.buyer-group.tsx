import { json } from "@remix-run/node";
import {
  useLoaderData,
  useNavigate,
  useSubmit,
  useRevalidator,
  useActionData,
  useSearchParams,
  Outlet,
  useLocation,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  BlockStack,
  Button,
  useIndexResourceState,
  Pagination,
  Tabs,
  TextField,
  Select,
  InlineStack,
  Spinner,
} from "@shopify/polaris";
import PageHeader from "~/components/PageHeader";
import WatchVideoButton from "~/components/WatchVideoButton";
import VideoPopup from "~/components/VideoPopup";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { ActionFunction } from "@remix-run/node";
import { ChevronDown } from "lucide-react";
import { bulkAssignCustomers, bulkRemoveCustomers } from "~/services/CustomerGroups.server";

export const loader = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") ?? "1");
  const orderBy = url.searchParams.get("orderBy") ?? "name";
  const orderDir = url.searchParams.get("dir") ?? "asc";
  const itemsPerPage = 10;
  const skip = (page - 1) * itemsPerPage;

  let groups: any[] = [];
  let totalCount = 0;

  try {
    const { session } = await authenticate.admin(request);
    const { shop } = session;
    
    const whereCondition: any = {
      shop: shop,
      tagID: {
        not: null,
      },
    };

    totalCount = await prisma.shopSegmentsData.count({
      where: whereCondition,
    });

    let orderByCondition: any = { segmentName: "asc" };
    switch (orderBy) {
      case "id":
        orderByCondition = { id: orderDir };
        break;
      case "name":
        orderByCondition = { segmentName: orderDir };
        break;
      case "buyerCount":
        orderByCondition = { memberCount: orderDir };
        break;
      case "moq":
        orderByCondition = { defaultMOQ: orderDir };
        break;
      case "discount":
        orderByCondition = { defaultDiscount: orderDir };
        break;
      default:
        orderByCondition = { segmentName: orderDir };
    }

    const data = await prisma.shopSegmentsData.findMany({
      where: whereCondition,
      select: {
        segmentName: true,
        segmentId: true,
        tagID: true,
        defaultDiscount: true,
        status: true,
        defaultMOQ: true,
        paymentMethods: true,
        storeDiscounts: true, // <-- Add this line
        buyers: {
          select: {
            customerId: true,
            customerName: true,
          },
        },
      },
      skip: skip,
      take: itemsPerPage,
      orderBy: orderByCondition
    });
    
    // Clean up any existing duplicates in the database
    try {
      // Get all buyer records for this shop
      const allBuyers = await prisma.shopSegmentsBuyers.findMany({
        where: {
          segment: {
            shop: shop,
          },
        },
        include: {
          segment: true,
        },
      });

      // Group by segment and customer numeric ID to find duplicates
      const duplicatesBySegment = new Map();

      allBuyers.forEach((buyer) => {
        if (buyer.customerId) {
          const numericId = buyer.customerId.split("/").pop();
          const key = `${buyer.segmentId}-${numericId}`;

          if (!duplicatesBySegment.has(key)) {
            duplicatesBySegment.set(key, []);
          }
          duplicatesBySegment.get(key).push(buyer);
        }
      });

      // Remove duplicates, keeping only the first record
      for (const [key, buyers] of duplicatesBySegment) {
        if (buyers.length > 1) {
          const [keepRecord, ...duplicates] = buyers;

          await prisma.shopSegmentsBuyers.deleteMany({
            where: {
              id: { in: duplicates.map((d: any) => d.id) },
            },
          });
        }
      }
    } catch (cleanupError) {
      console.error("Error during duplicate cleanup:", cleanupError);
    }

    groups = (data || []).map((d) => {
      // Deduplicate buyers by customerId to prevent showing duplicates
      const uniqueBuyers = d.buyers.filter(
        (buyer: any, index: number, self: any[]) => {
          const firstIndex = self.findIndex(
            (b: any) => b.customerId === buyer.customerId,
          );
          return index === firstIndex;
        },
      );

      // console.log(
      //   `After deduplication: ${uniqueBuyers.length} unique buyers for group ${d.segmentName}`,
      // );

      // Parse storeDiscounts and use its discount property if available
      let parsedStoreDiscounts: any = {};
      let defaultDiscount: string | number = d.defaultDiscount;
      if (d.storeDiscounts) {
        try {
          parsedStoreDiscounts = typeof d.storeDiscounts === 'string' ? JSON.parse(d.storeDiscounts) : d.storeDiscounts;
          if (
            parsedStoreDiscounts &&
            typeof (parsedStoreDiscounts as any).discount !== 'undefined' &&
            (parsedStoreDiscounts as any).discount !== null &&
            (parsedStoreDiscounts as any).discount !== '' &&
            !isNaN(Number((parsedStoreDiscounts as any).discount))
          ) {
            defaultDiscount = (parsedStoreDiscounts as any).discount;
          } else {
            defaultDiscount = '-';
          }
        } catch {
          defaultDiscount = '-';
        }
      } else if (typeof defaultDiscount === 'undefined' || defaultDiscount === null || defaultDiscount === '') {
        defaultDiscount = '-';
      }
      // Ensure no nulls for UI
      if (defaultDiscount === null || typeof defaultDiscount === 'undefined') defaultDiscount = '-';
      let defaultMOQ: string = (d.defaultMOQ === null || typeof d.defaultMOQ === 'undefined') ? '-' : String(d.defaultMOQ);
      // Fix: Only set defaultMOQ if storeDiscounts is a non-empty object with volumeConfig.minimum
      if (
        parsedStoreDiscounts &&
        !Array.isArray(parsedStoreDiscounts) &&
        Object.keys(parsedStoreDiscounts).length > 0 &&
        parsedStoreDiscounts.volumeConfig &&
        typeof parsedStoreDiscounts.volumeConfig.minimum !== 'undefined' &&
        parsedStoreDiscounts.volumeConfig.minimum !== null &&
        parsedStoreDiscounts.volumeConfig.minimum !== '' &&
        !isNaN(Number(parsedStoreDiscounts.volumeConfig.minimum))
      ) {
        defaultMOQ = String(parsedStoreDiscounts.volumeConfig.minimum);
      } else {
        defaultMOQ = '-';
      }
      // No need for final null check; defaultMOQ is always a string
      return {
        segmentName: d.segmentName,
        segmentId: d.segmentId,
        tagID: d.tagID,
        defaultDiscount: String(defaultDiscount),
        status: d.status,
        defaultMOQ,
        paymentMethods: d.paymentMethods?.split(","),
        buyerCount: uniqueBuyers.length,
        buyers: uniqueBuyers,
      };
    });
  } catch (e: any) {
    console.error("Failed to load buyer group list:", e);
    console.log(e.message);
    groups = [];
  }

  // Force cache refresh
  const response = json({
    groups,
    pagination: {
      page,
      itemsPerPage,
      totalCount,
      totalPages: Math.ceil(totalCount / itemsPerPage),
    },
  });
  response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Last-Modified", new Date().toUTCString());
  response.headers.set("ETag", `"${Date.now()}"`);

  return response;
};

export const action: ActionFunction = async ({ request }) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const { shop } = session;
    const formData = await request.formData();
    const action = String(formData.get("action"));

    if (action && action === "remove-buyers") {
      const customerList = JSON.parse(String(formData.get("customerList")));
      const tagToRemove = String(formData.get("tag"));
      const groupId = String(formData.get("groupId"));

      // Ensure tagToRemove is a string
      if (typeof tagToRemove !== "string") {
        throw new Error("Invalid input: tag must be a string");
      }

      // Ensure customerIds is an array of strings
      if (!Array.isArray(customerList) || !customerList.every((id) => typeof id === "string")) {
        throw new Error(
          "Invalid input: customerList must be an array of strings",
        );
      }

      const customerIdsArray = new Array();
      const shopifyCustomerPrefix = `gid://shopify/Customer/`;
      for (const segmentMemberId of customerList) {
        const numericId = segmentMemberId.split("/");
        customerIdsArray.push(`${shopifyCustomerPrefix}${numericId[numericId.length - 1]}`);
      }

      const payload = { tagToRemove: tagToRemove, customerIdsArray: customerIdsArray, groupId: groupId };
      
      const status = await bulkRemoveCustomers(payload, admin, shop); 
      console.log('remove status', status);    
      return status ? json({
        success: true,
        action: "remove-buyers",
        message: "Buyers removed successfully",
      }, {
        status: 200
      })
      :
      json(
        { error: `Failed to remove buyers` },
        { status: 500 }
      );
    }

    if (action && action === "assign-buyers") {
      
        const customerIds = JSON.parse(String(formData.get("customerIds")));
        const groupId = String(formData.get("groupId"));
        const groupTag = String(formData.get("groupTag"));

        // Ensure all inputs are valid
        if (
          !Array.isArray(customerIds) ||
          !customerIds.every((id) => typeof id === "string")
        ) {
          throw new Error(
            "Invalid input: customerIds must be an array of strings",
          );
        }

        if (typeof groupTag !== "string") {
          throw new Error("Invalid input: groupTag must be a string");
        }

      const payload = {customerIds: customerIds, groupTag: groupTag, groupId: groupId}
      const status = await bulkAssignCustomers(payload, admin, shop);        
      console.log('add status', status);
      return status ? json({
        success: true,
        action: "assign-buyers",
        message: "Buyers assigned successfully"
      }) 
      : 
      json(
        { error: `Failed to assign buyers` },
        { status: 500 }
      );
    }

    //console.log("No action specified");
    return json({ success: false, message: "No action specified" });
  } catch (error: any) {
    console.error("Error in action function:", error);
    const errorMessage = error?.message || "Unknown error";
    return json(
      { error: `Action function error: ${errorMessage}` },
      { status: 500 },
    );
  }
};

// Custom debounce hook
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// Create a completely isolated search component that doesn't affect the main component
const SearchAndSortControls = React.memo(() => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");
  const [searchParams, setSearchParams] = useSearchParams();
  const [isSearching, setIsSearching] = useState(false);

  // Use refs to prevent re-renders during typing
  const searchTermRef = useRef("");
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update refs without causing re-renders
  useEffect(() => {
    searchTermRef.current = searchTerm;
  }, [searchTerm]);

  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  const handleSearchButton = useCallback(() => {
    setIsSearching(true);
    
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Dispatch search event with current search term
    timeoutRef.current = setTimeout(() => {
      const event = new CustomEvent('searchChanged', { 
        detail: { searchTerm: searchTerm } 
      });
      window.dispatchEvent(event);
      setIsSearching(false);
    }, 100);
  }, [searchTerm]);

  const handleReset = useCallback(() => {
    setIsSearching(true);
    
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Clear search term and dispatch empty search immediately
    setSearchTerm("");
    timeoutRef.current = setTimeout(() => {
      const event = new CustomEvent('searchChanged', { 
        detail: { searchTerm: "" } 
      });
      window.dispatchEvent(event);
      setIsSearching(false);
    }, 100);
  }, []);

  const handleSort = useCallback((field: string, direction: string) => {
    setSortBy(field);
    setSortDirection(direction);
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set("orderBy", field);
    newSearchParams.set("dir", direction);
    setSearchParams(newSearchParams);
  }, [searchParams, setSearchParams]);

  // Listen for clear search event
  useEffect(() => {
    const handleClearSearch = () => {
      setSearchTerm("");
      // Also dispatch empty search to clear results
      const event = new CustomEvent('searchChanged', { 
        detail: { searchTerm: "" } 
      });
      window.dispatchEvent(event);
    };

    window.addEventListener('clearSearch', handleClearSearch);
    return () => {
      window.removeEventListener('clearSearch', handleClearSearch);
    };
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <Card>
      <div style={{ padding: "16px" }}>
        <InlineStack gap="400" align="space-between">
          <div style={{ flex: 1, maxWidth: "400px" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "end" }}>
              <div 
                style={{ flex: 1 }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchTerm.trim()) {
                    handleSearchButton();
                  }
                }}
              >
                <TextField
                  label="Search groups"
                  value={searchTerm}
                  onChange={handleSearch}
                  autoComplete="off"
                  placeholder="Search by group name or tag ID..."
                  clearButton
                  onClearButtonClick={() => {
                    handleSearch("");
                    handleSearchButton();
                  }}
                />
              </div>
              <Button
                variant="primary"
                onClick={handleSearchButton}
                loading={isSearching}
                disabled={!searchTerm.trim()}
              >
                Search
              </Button>
              <Button
                variant="secondary"
                onClick={handleReset}
              >
                Clear
              </Button>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "end" }}>
            <Select
              label="Sort by"
              options={[
                { label: "Group Name", value: "name" },
                { label: "Tag ID", value: "id" },
                { label: "Buyer Count", value: "buyerCount" },
                { label: "Default MOQ", value: "moq" },
                { label: "Default Discount", value: "discount" },
              ]}
              value={sortBy}
              onChange={(value) => handleSort(value, sortDirection)}
            />
            <Select
              label="Direction"
              options={[
                { label: "Ascending", value: "asc" },
                { label: "Descending", value: "desc" },
              ]}
              value={sortDirection}
              onChange={(value) => handleSort(sortBy, value)}
            />
          </div>
        </InlineStack>
      </div>
    </Card>
  );
});

// Create a memoized component for the main table with stable props
const BuyerGroupTable = React.memo(({
  groups,
  onRowClick,
}: {
  groups: any[];
  onRowClick: (segmentId: string) => void;
}) => {
  const rowMarkup = useMemo(() => 
    groups.map((group: any, index: number) => (
      <IndexTable.Row id={group.segmentId} key={group.segmentId} position={index}>
        <IndexTable.Cell>
          <div style={{ cursor: "pointer", padding: "8px" }} onClick={() => onRowClick(group.segmentId)}>
            <Text variant="bodyMd" fontWeight="bold" as="span">
              {group.segmentName}
            </Text>
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div style={{ cursor: "pointer", padding: "8px" }} onClick={() => onRowClick(group.segmentId)}>
            {group.tagID}
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div style={{ cursor: "pointer", textAlign: "center", padding: "8px" }} onClick={() => onRowClick(group.segmentId)}>
            {group.status ? 'Active':'Processing...'}
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div style={{ cursor: "pointer", textAlign: "center", padding: "8px" }} onClick={() => onRowClick(group.segmentId)}>
            {group.defaultDiscount}%
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div style={{ cursor: "pointer", textAlign: "center", padding: "8px" }} onClick={() => onRowClick(group.segmentId)}>
            {group.defaultMOQ}
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div style={{ cursor: "pointer", textAlign: "center", padding: "8px" }} onClick={() => onRowClick(group.segmentId)}>
            {Array.isArray(group.paymentMethods) ? group.paymentMethods.join(", ") : group.paymentMethods}
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div style={{ cursor: "pointer", textAlign: "center", padding: "8px", }} onClick={() => onRowClick(group.segmentId)}>
            {group.buyerCount}
          </div>
        </IndexTable.Cell>
      </IndexTable.Row>
    )), [groups, onRowClick]);

  return (
    <IndexTable
      selectable={false}
      resourceName={{ singular: "group", plural: "groups" }}
      itemCount={groups.length}
      headings={[
        { title: "Group Name" },
        { title: "Tag ID" },
        { title: "Status", alignment: "center" },
        { title: "Default Discount", alignment: "center" },
        { title: "Default MOQ", alignment: "center" },
        { title: "Payment Methods", alignment: "center" },
        { title: "Buyer Count", alignment: "center" },
      ]}
    >
      {rowMarkup}
    </IndexTable>
  );
});

// Create a separate component for the buyers table
const BuyersTable = ({
  buyers,
  group,
  removeLoading,
  setRemoveLoading,
  pendingRemove,
  setPendingRemove,
  submit,
}: {
  buyers: any[];
  group: any;
  removeLoading: boolean;
  setRemoveLoading: (v: boolean) => void;
  pendingRemove: any;
  setPendingRemove: (v: any) => void;
  submit: any;
}) => {

  console.log('buyers', buyers);

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(buyers, {
      resourceIDResolver: (buyer: any) => buyer.customerId,
    });
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const itemsPerPage = 5;
  
  // Filter buyers based on search term
  const filteredBuyers = buyers.filter((buyer: any) =>
    buyer.customerName.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const totalPages = Math.ceil(filteredBuyers.length / itemsPerPage);
  const pagedBuyers = filteredBuyers.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage,
  );

  // Reset page when search term changes
  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  const handleRemoveBuyers = (groupId: string, tag: string, buyers: any[]) => {
    // This will be handled by the parent component
    return { groupId, tag, buyers };
  };

  // Extract button logic to a function
  const handleRemoveBuyersClick = (buyersToRemove: any[]) => {
    if (!buyersToRemove.length) {
      setRemoveLoading(false);
      return;
    }
    setRemoveLoading(true);
    // Submit as a Remix action
    const formData = new FormData();
    formData.append("action", "remove-buyers");
    formData.append("groupId", String(group.segmentId || ""));
    formData.append("tag", String(group.tagID || ""));
    formData.append("customerList", JSON.stringify(buyersToRemove.map((b: any) => b.customerId)));
    submit(formData, { method: "post" });
  };

  useEffect(() => {
    if (
      pendingRemove &&
      pendingRemove.groupId === group.segmentId &&
      pendingRemove.buyers.length > 0
    ) {
      handleRemoveBuyersClick(pendingRemove.buyers);
      setPendingRemove(null);
    }
  }, [pendingRemove, group.segmentId, setPendingRemove]);

  return (
    <>
      {/* Search Bar */}
      <div style={{ marginBottom: 16 }}>
        <TextField
          label="Search assigned buyers"
          value={searchTerm}
          onChange={setSearchTerm}
          autoComplete="off"
          placeholder="Search by customer name..."
        />
      </div>
      
      <IndexTable
        resourceName={{ singular: "buyer", plural: "buyers" }}
        itemCount={filteredBuyers.length}
        selectedItemsCount={
          allResourcesSelected ? "All" : selectedResources.length
        }
        onSelectionChange={handleSelectionChange}
        headings={[{ title: "Name" }]}
      >
        {pagedBuyers.map((buyer: any, idx: number) => (
          <IndexTable.Row
            id={buyer.customerId}
            key={buyer.customerId}
            selected={selectedResources.includes(buyer.customerId)}
            position={idx}
          >
            <IndexTable.Cell>{buyer.customerName}</IndexTable.Cell>
          </IndexTable.Row>
        ))}
      </IndexTable>
      <div style={{ marginTop: 12, textAlign: "right" }}>
        <Button
          tone="critical"
          disabled={selectedResources.length === 0 && !pendingRemove}
          loading={removeLoading}
          onClick={() => {
            const selectedBuyers =
              pendingRemove && pendingRemove.groupId === group.segmentId
                ? pendingRemove.buyers
                : filteredBuyers.filter((b: any) =>
                    selectedResources.includes(b.customerId),
                  );
            handleRemoveBuyersClick(selectedBuyers);
          }}
        >
          Remove Buyers
        </Button>
      </div>
      {totalPages > 1 && (
        <div
          style={{ display: "flex", justifyContent: "center", marginTop: 16 }}
        >
          <Pagination
            hasPrevious={page > 1}
            onPrevious={() => setPage(page - 1)}
            hasNext={page < totalPages}
            onNext={() => setPage(page + 1)}
            label={`Page ${page} of ${totalPages}`}
          />
        </div>
      )}
    </>
  );
};

// Create a separate component for the unassigned buyers table
const UnassignedBuyersTable = ({
  group,
  assignLoading,
  setAssignLoading,
}: {
  group: any;
  assignLoading: boolean;
  setAssignLoading: (v: boolean) => void;
}) => {
  const [unassignedBuyers, setUnassignedBuyers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [prevCursors, setPrevCursors] = useState<string[]>([]); // Stack for previous cursors
  const {
    selectedResources,
    allResourcesSelected,
    handleSelectionChange,
    clearSelection,
  } = useIndexResourceState(unassignedBuyers, {
    resourceIDResolver: (buyer: any) => buyer.id,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const submit = useSubmit();
  const actionData = useActionData<typeof action>();

  // Debounce search term
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 800);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Fetch unassigned buyers with optional cursor
  const fetchUnassignedBuyers = async (searchQuery = "", cursor: string | null = null, direction: 'next' | 'prev' | null = null) => {
    try {
      setLoading(true);
      const url = new URL("/api/buyer-group/list-unassigned-customers", window.location.origin);
      if (searchQuery) {
        url.searchParams.set("searchTerm", searchQuery);
      }
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.status && data.data && data.data.customers) {
        setUnassignedBuyers(data.data.customers || []);
        setEndCursor(data.data.pageInfo?.endCursor || null);
        setHasNextPage(!!data.data.pageInfo?.hasNextPage);
        if (direction === 'next') {
          setPrevCursors((prev) => [...prev, currentCursor || '']);
        } else if (direction === 'prev') {
          setPrevCursors((prev) => prev.slice(0, -1));
        } else if (direction === null) {
          setPrevCursors([]);
        }
        setCurrentCursor(cursor);
        clearSelection();
      } else {
        setUnassignedBuyers([]);
        setEndCursor(null);
        setHasNextPage(false);
        setCurrentCursor(null);
        setPrevCursors([]);
        clearSelection();
      }
    } catch (error) {
      setUnassignedBuyers([]);
      setEndCursor(null);
      setHasNextPage(false);
      setCurrentCursor(null);
      setPrevCursors([]);
      clearSelection();
    } finally {
      setLoading(false);
    }
  };

  // Fetch first page on mount or when debounced search changes
  useEffect(() => {
    fetchUnassignedBuyers(debouncedSearchTerm, null, null);
  }, [debouncedSearchTerm]);

  // Listen for buyer assignment and removal events to refresh the unassigned list
  useEffect(() => {
    const handleBuyerEvent = () => {
      fetchUnassignedBuyers(debouncedSearchTerm, null);
    };
    window.addEventListener("buyerAssigned", handleBuyerEvent);
    window.addEventListener("buyerRemoved", handleBuyerEvent);
    window.addEventListener("removeBuyers", handleBuyerEvent);
    return () => {
      window.removeEventListener("buyerAssigned", handleBuyerEvent);
      window.removeEventListener("buyerRemoved", handleBuyerEvent);
      window.removeEventListener("removeBuyers", handleBuyerEvent);
    };
  }, [debouncedSearchTerm]);

  // Handle assignment responses
  useEffect(() => {
    if (actionData && actionData.success) {
      fetchUnassignedBuyers(debouncedSearchTerm, null);
    }
  }, [actionData, debouncedSearchTerm]);

  const handleAssignBuyers = async () => {
    const selectedBuyers = unassignedBuyers.filter((b: any) =>
      selectedResources.includes(b.id),
    );
    if (selectedBuyers.length === 0) {
      return;
    }
    const formData = new FormData();
    formData.append("action", "assign-buyers");
    formData.append("groupId", group.segmentId);
    formData.append("groupName", group.segmentName);
    formData.append("groupTag", group.tagID);
    formData.append(
      "customerIds",
      JSON.stringify(selectedBuyers.map((b) => b.id)),
    );
    setAssignLoading(true);
    submit(formData, { method: "post" });
  };

  if (loading) {
    return (
      <div style={{ padding: "16px", textAlign: "center" }}>
        Loading unassigned buyers...
      </div>
    );
  }

  return (
    <>
      {/* Search Bar */}
      <div style={{ marginBottom: 16 }}>
        <TextField
          label="Search unassigned buyers"
          value={searchTerm}
          onChange={setSearchTerm}
          autoComplete="off"
          placeholder="Search by customer name..."
        />
      </div>
      <IndexTable
        key={unassignedBuyers.map((b) => b.id).join(",")}
        resourceName={{ singular: "buyer", plural: "buyers" }}
        itemCount={unassignedBuyers.length}
        selectedItemsCount={
          allResourcesSelected ? "All" : selectedResources.length
        }
        onSelectionChange={handleSelectionChange}
        headings={[{ title: "Name" }, { title: "Company" }]}
      >
        {unassignedBuyers.map((buyer: any, idx: number) => (
          <IndexTable.Row
            id={buyer.id}
            key={buyer.id}
            selected={selectedResources.includes(buyer.id)}
            position={idx}
          >
            <IndexTable.Cell>{buyer.display_name}</IndexTable.Cell>
            <IndexTable.Cell>{buyer.company || "-"}</IndexTable.Cell>
          </IndexTable.Row>
        ))}
      </IndexTable>
      <div style={{ marginTop: 12, textAlign: "right" }}>
        <Button
          variant="primary"
          disabled={selectedResources.length === 0}
          loading={assignLoading}
          onClick={handleAssignBuyers}
        >
          Assign Buyers
        </Button>
      </div>
      {hasNextPage || prevCursors.length > 0 ? (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 16, gap: 8 }}>
          <Button
            variant="secondary"
            onClick={() => {
              if (prevCursors.length > 0) {
                const prevCursor = prevCursors[prevCursors.length - 1] || null;
                fetchUnassignedBuyers(debouncedSearchTerm, prevCursor, 'prev');
              }
            }}
            disabled={loading || prevCursors.length === 0}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            onClick={() => fetchUnassignedBuyers(debouncedSearchTerm, endCursor, 'next')}
            disabled={loading || !hasNextPage}
          >
            Next
          </Button>
        </div>
      ) : null}
    </>
  );
};

function ViewOnlyOverridesTabs({
  productOverrides = [],
  collectionOverrides = [],
  accordionStyle,
}: {
  productOverrides: any[];
  collectionOverrides: any[];
  accordionStyle?: boolean;
}) {

  console.log("ViewOnlyOverridesTabs props:", {
    productOverrides,
    collectionOverrides,
  }); // <-- LOG PROPS
  console.log(
    "CollectionOverrides in ViewOnlyOverridesTabs:",
    collectionOverrides,
  );
  if (collectionOverrides.length > 0) {
    console.log("First collection override object:", collectionOverrides[0]);
  }
  const [activeTab, setActiveTab] = useState(0);
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;
  const [openAccordions, setOpenAccordions] = useState<{
    [key: string]: boolean;
  }>({});

  // Defensive: ensure arrays and each item has an id
  const safeProductOverrides = Array.isArray(productOverrides)
    ? productOverrides.filter((item) => item && (item.id || item.productId))
    : [];
  const safeCollectionOverrides = Array.isArray(collectionOverrides)
    ? collectionOverrides.filter(
        (item) => item && (item.id || item.collectionId),
      )
    : [];
  // Patch: ensure every override has discountType/discount_type and minQuantity, maxQuantity, increments set
  const patchedProductOverrides = safeProductOverrides.map((item) => ({
    ...item,
    discountType: item.discountType || item.discount_type || "percentage",
    discount_type: item.discountType || item.discount_type || "percentage",
    minQuantity: item.minQuantity != null ? item.minQuantity : (item.volumeConfig?.minimum != null ? item.volumeConfig.minimum : null),
    maxQuantity: item.maxQuantity != null ? item.maxQuantity : (item.volumeConfig?.maximum != null ? item.volumeConfig.maximum : null),
    increments: item.increments != null ? item.increments : (item.volumeConfig?.increments != null ? item.volumeConfig.increments : null),
  }));
  const patchedCollectionOverrides = safeCollectionOverrides.map((item) => ({
    ...item,
    discountType: item.discountType || item.discount_type || "percentage",
    discount_type: item.discountType || item.discount_type || "percentage",
    minQuantity: item.minQuantity != null ? item.minQuantity : (item.volumeConfig?.minimum != null ? item.volumeConfig.minimum : null),
    maxQuantity: item.maxQuantity != null ? item.maxQuantity : (item.volumeConfig?.maximum != null ? item.volumeConfig.maximum : null),
    increments: item.increments != null ? item.increments : (item.volumeConfig?.increments != null ? item.volumeConfig.increments : null),
  }));
  const allItems = [...patchedProductOverrides, ...patchedCollectionOverrides];
  const productItems = patchedProductOverrides;
  const collectionItems = patchedCollectionOverrides;

  // --- Grouping logic (by productId and discountValue) ---
  function groupProductOverridesByDiscount(items: any[]) {
    const productGroups: {
      [key: string]: {
        productId: string;
        discountValue: number | undefined;
        variants: any[];
      };
    } = {};
    items.forEach((item) => {
      if (item.appliesTo === "products") {
        const pid = item.productId || item.id;
        const discount =
          typeof item.discountValue === "number"
            ? item.discountValue
            : "undefined";
        const key = `${pid}__${discount}`;
        if (!productGroups[key])
          productGroups[key] = {
            productId: pid,
            discountValue: item.discountValue,
            variants: [],
          };
        productGroups[key].variants.push(item);
      }
    });
    return Object.values(productGroups);
  }

  // For the All and Products tabs, group product overrides
  const groupedProductOverrides = groupProductOverridesByDiscount(productItems);

  const tabData = [
    {
      id: "all",
      content: "All",
      items: [...groupedProductOverrides, ...collectionItems],
      isGrouped: true,
    },
    {
      id: "products",
      content: "Products",
      items: groupedProductOverrides,
      isGrouped: true,
    },
    {
      id: "collections",
      content: "Collections",
      items: collectionItems,
      isGrouped: false,
    },
  ];

  const currentTab = tabData[activeTab];
  const totalPages = Math.ceil(currentTab.items.length / itemsPerPage);
  const pagedItems = currentTab.items.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage,
  );

  useEffect(() => {
    setPage(1); // Reset to first page when tab changes
  }, [activeTab]);

  return (
    <div>
      <Tabs
        tabs={tabData.map((tab, idx) => ({
          id: tab.id,
          content: tab.content,
          panelID: `${tab.id}-panel`,
        }))}
        selected={activeTab}
        onSelect={setActiveTab}
      />
      <div style={{ marginTop: 24 }}>
        {/* Render the grouped/paginated list, view-only */}
        {pagedItems.length === 0 ? (
          <div style={{ textAlign: "center", color: "#888", padding: 24 }}>
            No items to display.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 8 }}>Title</th>
                <th style={{ textAlign: "left", padding: 8 }}>Type</th>
                <th style={{ textAlign: "left", padding: 8 }}>Discount</th>
                <th style={{ textAlign: "left", padding: 8 }}>Discount Type</th>
                <th style={{ textAlign: "left", padding: 8 }}>Min Qty</th>
                <th style={{ textAlign: "left", padding: 8 }}>Max Qty</th>
                <th style={{ textAlign: "left", padding: 8 }}>Increments</th>
                {/* Add more columns as needed */}
              </tr>
            </thead>
            <tbody>
              {currentTab.isGrouped
                ? pagedItems.map((groupOrItem: any, idx: number) => {
                    // If it's a product group (from groupedProductOverrides)
                    if (groupOrItem.variants) {
                      const group = groupOrItem;
                      const first = group.variants[0];
                      const groupKey =
                        group.productId + "_" + group.discountValue;
                      if (group.variants.length === 1) {
                        // Single variant: show as a single row, not an accordion
                        const item = group.variants[0];
                        return (
                          <tr
                            key={item.id || item.productId || groupKey}
                            style={{ borderBottom: "1px solid #eee" }}
                          >
                            <td style={{ padding: 8 }}>
                              {item.title || item.productTitle || "-"}
                            </td>
                            <td style={{ padding: 8 }}>
                              {item.type || "Product"}
                            </td>
                            <td style={{ padding: 8 }}>
                              {item.discountValue != null
                                ? (item.discountType === "percentage"
                                    ? `${item.discountValue}%`
                                    : item.discountType === "fixed"
                                    ? `$${item.discountValue}`
                                    : item.discountValue)
                                : "-"}
                            </td>
                            <td style={{ padding: 8 }}>
                              {item.discountType === "fixed"
                                ? "Fixed"
                                : item.discountType === "percentage"
                                ? "Percentage"
                                : "-"}
                            </td>
                            <td style={{ padding: 8 }}>
                              {(item.minQuantity !== null && item.minQuantity !== undefined && item.minQuantity !== "") ? item.minQuantity : 1}
                            </td>
                            <td style={{ padding: 8 }}>
                              {(item.maxQuantity !== null && item.maxQuantity !== undefined && item.maxQuantity !== "") ? item.maxQuantity : <span>&#8734;</span>}
                            </td>
                            <td style={{ padding: 8 }}>
                              {(item.increments !== null && item.increments !== undefined && item.increments !== "") ? item.increments : 1}
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <>
                          <tr
                            key={groupKey}
                            style={{ background: "#f6f8fa", cursor: "pointer" }}
                            onClick={() =>
                              setOpenAccordions((prev) => ({
                                ...prev,
                                [groupKey]: !prev[groupKey],
                              }))
                            }
                          >
                            <td
                              style={{ padding: 8, fontWeight: 600 }}
                              colSpan={6}
                            >
                              <span
                                style={{
                                  marginRight: 8,
                                  display: "inline-block",
                                  transition: "transform 0.2s",
                                  transform: openAccordions[groupKey]
                                    ? "rotate(90deg)"
                                    : "rotate(0deg)",
                                }}
                              >
                                ▶
                              </span>
                              {first.title || first.productTitle || "-"}
                              {typeof group.discountValue === "number" && (
                                <span
                                  style={{
                                    marginLeft: 12,
                                    color: "#2563eb",
                                    fontWeight: 400,
                                  }}
                                >
                                  @{group.discountValue}%
                                </span>
                              )}
                            </td>
                          </tr>
                          {openAccordions[groupKey] &&
                            group.variants.map((item: any, vIdx: number) => (
                              <tr
                                key={item.id || item.productId || vIdx}
                                style={{ borderBottom: "1px solid #eee" }}
                              >
                                <td style={{ padding: 8, paddingLeft: 32 }}>
                                  {item.variantTitle || "-"}
                                </td>
                                <td style={{ padding: 8 }}>
                                  {item.type || "Variant"}
                                </td>
                                <td style={{ padding: 8 }}>
                                  {item.discountValue != null
                                    ? (item.discountType === "percentage"
                                        ? `${item.discountValue}%`
                                        : item.discountType === "fixed"
                                        ? `$${item.discountValue}`
                                        : item.discountValue)
                                    : group.discountValue != null
                                      ? (group.discountType === "percentage"
                                          ? `${group.discountValue}%`
                                          : group.discountType === "fixed"
                                          ? `$${group.discountValue}`
                                          : group.discountValue)
                                      : "-"}
                                </td>
                                <td style={{ padding: 8 }}>
                                  {item.discountType === "fixed"
                                    ? "Fixed"
                                    : item.discountType === "percentage"
                                    ? "Percentage"
                                    : "-"}
                                </td>
                                <td style={{ padding: 8 }}>
                                  {(item.minQuantity !== null && item.minQuantity !== undefined && item.minQuantity !== "") ? item.minQuantity : 1}
                                </td>
                                <td style={{ padding: 8 }}>
                                  {(item.maxQuantity !== null && item.maxQuantity !== undefined && item.maxQuantity !== "") ? item.maxQuantity : <span>&#8734;</span>}
                                </td>
                                <td style={{ padding: 8 }}>
                                  {(item.increments !== null && item.increments !== undefined && item.increments !== "") ? item.increments : 1}
                                </td>
                              </tr>
                            ))}
                        </>
                      );
                    } else {
                      // For collections or ungrouped items
                      const item = groupOrItem;
                      return (
                        <tr
                          key={item.id || item.collectionId || idx}
                          style={{ borderBottom: "1px solid #eee" }}
                        >
                          <td style={{ padding: 8 }}>
                            {item.title || item.collectionTitle || "-"}
                          </td>
                          <td style={{ padding: 8 }}>
                            {item.appliesTo === "collections"
                              ? "Collection"
                              : item.type || "Product"}
                          </td>
                          <td style={{ padding: 8 }}>
                            {item.discountValue != null
                              ? (item.discountType === "percentage"
                                  ? `${item.discountValue}%`
                                  : item.discountType === "fixed"
                                  ? `$${item.discountValue}`
                                  : item.discountValue)
                              : "-"}
                          </td>
                          <td style={{ padding: 8 }}>
                            {item.discountType === "fixed"
                              ? "Fixed"
                              : item.discountType === "percentage"
                              ? "Percentage"
                              : "-"}
                          </td>
                          <td style={{ padding: 8 }}>
                            {(item.minQuantity !== null && item.minQuantity !== undefined && item.minQuantity !== "") ? item.minQuantity : 1}
                          </td>
                          <td style={{ padding: 8 }}>
                            {(item.maxQuantity !== null && item.maxQuantity !== undefined && item.maxQuantity !== "") ? item.maxQuantity : <span>&#8734;</span>}
                          </td>
                          <td style={{ padding: 8 }}>
                            {(item.increments !== null && item.increments !== undefined && item.increments !== "") ? item.increments : 1}
                          </td>
                        </tr>
                      );
                    }
                  })
                : pagedItems.map((item: any, idx: number) => {
                    if (currentTab.id === "collections") {
                      console.log("Rendering collection tab row:", item);
                    }
                    return (
                      <tr
                        key={item.id || item.collectionId || idx}
                        style={{ borderBottom: "1px solid #eee" }}
                      >
                        <td style={{ padding: 8 }}>
                          {item.title || item.collectionTitle || "-"}
                        </td>
                        <td style={{ padding: 8 }}>
                          {item.appliesTo === "collections"
                            ? "Collection"
                            : item.type || "Product"}
                        </td>
                        <td style={{ padding: 8 }}>
                          {item.discountValue != null
                            ? (item.discountType === "percentage"
                                ? `${item.discountValue}%`
                                : item.discountType === "fixed"
                                ? `$${item.discountValue}`
                                : item.discountValue)
                            : "-"}
                        </td>
                        <td style={{ padding: 8 }}>
                          {item.discountType === "fixed"
                            ? "Fixed"
                            : item.discountType === "percentage"
                            ? "Percentage"
                            : "-"}
                        </td>
                        <td style={{ padding: 8 }}>
                          {(item.minQuantity !== null && item.minQuantity !== undefined && item.minQuantity !== "") ? item.minQuantity : 1}
                        </td>
                        <td style={{ padding: 8 }}>
                          {(item.maxQuantity !== null && item.maxQuantity !== undefined && item.maxQuantity !== "") ? item.maxQuantity : <span>&#8734;</span>}
                        </td>
                        <td style={{ padding: 8 }}>
                          {(item.increments !== null && item.increments !== undefined && item.increments !== "") ? item.increments : 1}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        )}
        {totalPages > 1 && (
          <div
            style={{ display: "flex", justifyContent: "center", marginTop: 16 }}
          >
            <Pagination
              hasPrevious={page > 1}
              onPrevious={() => setPage(page - 1)}
              hasNext={page < totalPages}
              onNext={() => setPage(page + 1)}
              label={`Page ${page} of ${totalPages}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function BuyerGroupList() {
  const { groups, pagination } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  
  // Check if we're on a child route
  const isChildRoute = location.pathname.includes('/add') || location.pathname.includes('/members');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [currentGroupBuyers, setCurrentGroupBuyers] = useState<any[]>([]);
  const [removeModalOpen, setRemoveModalOpen] = useState(false);
  const [removingGroupId, setRemovingGroupId] = useState<string | null>(null);
  const [removingTag, setRemovingTag] = useState<string | null>(null);
  const [removingBuyers, setRemovingBuyers] = useState<any[]>([]);
  const submit = useSubmit();
  const [assignLoading, setAssignLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<null | {
    groupId: string;
    tag: string;
    buyers: any[];
  }>(null);
  // Add state for overrides at the top of BuyerGroupList
  const [selectedGroupProductOverrides, setSelectedGroupProductOverrides] =
    useState<any[]>([]);
  const [
    selectedGroupCollectionOverrides,
    setSelectedGroupCollectionOverrides,
  ] = useState<any[]>([]);
  // Add state at the top of BuyerGroupList
  const [groupOverridesOpen, setGroupOverridesOpen] = useState(false);
  // Add loading state for overrides
  const [overridesLoading, setOverridesLoading] = useState(false);
  
  // Add state for video popup
  const [showVideoPopup, setShowVideoPopup] = useState(false);
  const [videoPopupUrl] = useState("https://www.floik.com/embed/f5085237-905a-461b-b209-c8c7d86b5e2f/945da644-42b3-4796-8afa-cf97ba4821cf-flo.html");
  const [videoPopupTitle] = useState("Setup Pricing & Buyer Groups");
  
  // Add state for sorting
  const [sortBy, setSortBy] = useState(searchParams.get("orderBy") ?? "name");
  const [sortDirection, setSortDirection] = useState(searchParams.get("dir") ?? "asc");
  
  const resourceName = {
    singular: "group",
    plural: "groups",
  };

  const handlePageChange = useCallback((page: number) => {
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set("page", page.toString());
    setSearchParams(newSearchParams);
  }, [searchParams, setSearchParams]);

  // Client-side search state - listen to custom events from SearchAndSortControls
  const [searchTerm, setSearchTerm] = useState("");
  const searchTermRef = useRef("");

  // Listen for search changes from the SearchAndSortControls component with debouncing
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let lastSearchTerm = "";

    const handleSearchChange = (event: CustomEvent) => {
      const newSearchTerm = event.detail.searchTerm;
      
      // Only update if the search term actually changed to prevent unnecessary re-renders
      if (newSearchTerm !== lastSearchTerm) {
        // Clear any existing timeout
        clearTimeout(timeoutId);
        
        // Debounce the search term update to reduce flickering
        timeoutId = setTimeout(() => {
          setSearchTerm(newSearchTerm);
          searchTermRef.current = newSearchTerm;
          lastSearchTerm = newSearchTerm;
        }, 200); // Increased delay for better stability
      }
    };

    window.addEventListener('searchChanged', handleSearchChange as EventListener);
    return () => {
      window.removeEventListener('searchChanged', handleSearchChange as EventListener);
      clearTimeout(timeoutId);
    };
  }, []);

  // Computed filtered groups to reduce flickering - use ref to prevent re-renders
  const filteredGroups = useMemo(() => {
    const currentSearchTerm = searchTermRef.current || searchTerm;
    if (!currentSearchTerm.trim()) {
      return groups;
    }
    
    return groups.filter((group) => {
      const searchLower = currentSearchTerm.toLowerCase();
      return (
        group.segmentName?.toLowerCase().includes(searchLower) ||
        group.tagID?.toLowerCase().includes(searchLower)
      );
    });
  }, [groups, searchTerm]);

  const handleSort = useCallback((field: string, direction: string) => {
    setSortBy(field);
    setSortDirection(direction);
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set("orderBy", field);
    newSearchParams.set("dir", direction);
    setSearchParams(newSearchParams);
  }, [searchParams, setSearchParams]);

  // Client-side sorting for filtered results
  const sortedFilteredGroups = useMemo(() => {
    const currentSearchTerm = searchTermRef.current || searchTerm;
    if (!currentSearchTerm) {
      return filteredGroups; // Use server-side sorting when not searching
    }
    
    return [...filteredGroups].sort((a, b) => {
      let aValue: any;
      let bValue: any;
      
      switch (sortBy) {
        case "name":
          aValue = a.segmentName || "";
          bValue = b.segmentName || "";
          break;
        case "id":
          aValue = a.tagID || "";
          bValue = b.tagID || "";
          break;
        case "buyerCount":
          aValue = a.buyerCount || 0;
          bValue = b.buyerCount || 0;
          break;
        case "moq":
          aValue = a.defaultMOQ || "";
          bValue = b.defaultMOQ || "";
          break;
        case "discount":
          aValue = parseFloat(a.defaultDiscount) || 0;
          bValue = parseFloat(b.defaultDiscount) || 0;
          break;
        default:
          aValue = a.segmentName || "";
          bValue = b.segmentName || "";
      }
      
      if (sortDirection === "asc") {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
  }, [filteredGroups, sortBy, sortDirection, searchTerm]);

  const fetchOverridesForGroup = async (segmentId: string) => {
    try {
      setOverridesLoading(true);
      const res = await fetch(
        `/api/buyer-group/overrides?segmentId=${encodeURIComponent(segmentId)}`,
      );
      if (res.ok) {
        const data = await res.json();
        setSelectedGroupProductOverrides(data.mergedProductOverrides || []);
        setSelectedGroupCollectionOverrides(
          data.mergedCollectionOverrides || [],
        );
      } else {
        setSelectedGroupProductOverrides([]);
        setSelectedGroupCollectionOverrides([]);
      }
    } catch (e) {
      setSelectedGroupProductOverrides([]);
      setSelectedGroupCollectionOverrides([]);
    } finally {
      setOverridesLoading(false);
    }
  };

  const handleRowClick = useCallback(async (segmentId: string) => {
    const group = groups.find((g) => g.segmentId === segmentId);
    if (group) {
      setSelectedGroup(group);
      setCurrentGroupBuyers(Array.isArray(group.buyers) ? group.buyers : []);
      setExpandedRowId(segmentId);
      setPopupOpen(true);
      // Reset overrides data and loading state
      setSelectedGroupProductOverrides([]);
      setSelectedGroupCollectionOverrides([]);
      setOverridesLoading(false);
      await fetchOverridesForGroup(segmentId);
    }
  }, [groups, fetchOverridesForGroup]);

  const handleRemoveBuyers = (groupId: string, tag: string, buyers: any[]) => {
    // Add action property to buyers for modal identification
    const buyersWithAction = buyers.map((b) => ({ ...b, action: "remove" }));

    setRemovingGroupId(groupId);
    setRemovingTag(tag);
    setRemovingBuyers(buyersWithAction);
    setRemoveModalOpen(true);
  };

  // In the main component, add event listener
  useEffect(() => {
    const handleRemoveBuyersEvent = (event: CustomEvent) => {
      const { groupId, tag, buyers } = event.detail;
      handleRemoveBuyers(groupId, tag, buyers);
    };

    window.addEventListener(
      "removeBuyers",
      handleRemoveBuyersEvent as EventListener,
    );
    return () => {
      window.removeEventListener(
        "removeBuyers",
        handleRemoveBuyersEvent as EventListener,
      );
    };
  }, []);

  useEffect(() => {}, [
    removeModalOpen,
    removingGroupId,
    removingTag,
    removingBuyers,
  ]);

  // Handle action responses and trigger revalidation
  useEffect(() => {
    if (actionData) {
      //console.log("useEffect for actionData called. actionData:", actionData);
      setAssignLoading(false);
      setRemoveLoading(false);
      if (actionData.success) {
        revalidator.revalidate();
        if (actionData.action === "assign-buyers") {
          window.dispatchEvent(new CustomEvent("buyerAssigned"));
        } else if (actionData.action === "remove-buyers") {
          window.dispatchEvent(new CustomEvent("buyerRemoved"));
        }
      }
    }
  }, [actionData, revalidator]);

  // Update current group buyers when data is revalidated
  useEffect(() => {
    if (selectedGroup && groups.length > 0) {
      const updatedGroup = groups.find(
        (g) => g.segmentId === selectedGroup.segmentId,
      );
      if (updatedGroup) {
        setCurrentGroupBuyers(
          Array.isArray(updatedGroup.buyers) ? updatedGroup.buyers : [],
        );
        // Also update the selectedGroup to keep it in sync
        setSelectedGroup(updatedGroup);
      }
    }
  }, [groups, selectedGroup]);

  // Handle expanded query parameter for auto-opening popup
  useEffect(() => {
    const expandedParam = searchParams.get("expanded");
    if (expandedParam && !popupOpen) {
      // Find the group to expand
      const groupToExpand = groups.find((g) => g.segmentId === expandedParam);
      if (groupToExpand) {
        setSelectedGroup(groupToExpand);
        setCurrentGroupBuyers(
          Array.isArray(groupToExpand.buyers) ? groupToExpand.buyers : [],
        );
        setExpandedRowId(expandedParam);
        setPopupOpen(true);
        fetchOverridesForGroup(expandedParam); // <-- fetch overrides after popup opens
      }

      // Clear the URL parameter after setting the expanded row
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete("expanded");
              navigate(`/app/buyer-group?${newSearchParams.toString()}`, {
        replace: true,
      });
    }
  }, [searchParams, navigate, groups, popupOpen]);



    return (
    <>
      {/* Render child routes if they exist */}
      <Outlet />
      
      {/* Render parent route content only if no child route is active */}
      {!isChildRoute && (
        <Page fullWidth>
          <Layout>
        <Layout.Section>
          <div style={{ marginLeft: 160, marginRight: 160 }}>
          <PageHeader
            title="Buyer Groups"
            subtitle="Manage your B2B buyer groups"
          />
          
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              margin: "8px 0 4px 0",
            }}
          >
            <div style={{ marginTop: "24px", marginBottom: "24px" }}>
              <Text variant="bodyLg" tone="subdued" as="p">
                Create buyer groups to organize wholesale customers into segments and set group-level discounts, minimum order quantities, and payment options.
              </Text>
            </div>
            
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              {/* Watch Video Button */}
              <WatchVideoButton 
                onClick={() => setShowVideoPopup(true)}
                buttonText="Watch video"
              />
              
              <Button
                variant="primary"
                onClick={() => navigate("/app/buyer-group/add")}
              >
                New Group
              </Button>
            </div>
          </div>
          
          {/* Video Popup */}
          <VideoPopup
            isOpen={showVideoPopup}
            onClose={() => setShowVideoPopup(false)}
            videoUrl={videoPopupUrl}
            title={videoPopupTitle}
          />
          </div>
        </Layout.Section>
        <Layout.Section>
          <BlockStack gap="400">
            <div style={{ marginLeft: 160, marginRight: 160 }}>
              {/* Search and Sort Controls */}
              <SearchAndSortControls />
              
                                <Card>
                    {sortedFilteredGroups.length === 0 && (searchTermRef.current || searchTerm) ? (
                      <div style={{ 
                        padding: "40px", 
                        textAlign: "center", 
                        color: "#6b7280",
                        fontSize: "14px"
                      }}>
                        <p>No groups found matching "{searchTermRef.current || searchTerm}"</p>
                        <div style={{ marginTop: "8px" }}>
                          <Button 
                            variant="plain" 
                            onClick={() => {
                              // Dispatch event to clear search in SearchAndSortControls
                              const event = new CustomEvent('clearSearch');
                              window.dispatchEvent(event);
                            }}
                          >
                            Clear search
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <BuyerGroupTable
                        groups={sortedFilteredGroups}
                        onRowClick={handleRowClick}
                      />
                    )}
                  </Card>
            </div>
            {/* Only show pagination when not searching */}
            {!(searchTermRef.current || searchTerm) && pagination.totalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: "16px",
                }}
              >
                <Pagination
                  label={`Page ${pagination.page} of ${pagination.totalPages}`}
                  hasPrevious={pagination.page > 1}
                  onPrevious={() => handlePageChange(pagination.page - 1)}
                  hasNext={pagination.page < pagination.totalPages}
                  onNext={() => handlePageChange(pagination.page + 1)}
                />
              </div>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
      
      {/* Custom Remove Confirmation Modal */}
      {removeModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setRemoveModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "24px",
              maxWidth: "400px",
              width: "90%",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: "16px" }}>
              <Text variant="headingMd" as="h3">
                Remove Buyers
              </Text>
            </div>
            <div style={{ marginBottom: "24px" }}>
              <Text variant="bodyMd" as="p">
                Are you sure you want to remove {removingBuyers?.length || 0}{" "}
                buyer{(removingBuyers?.length || 0) !== 1 ? "s" : ""} from this
                group?
              </Text>
            </div>
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <Button variant="plain" onClick={() => setRemoveModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                tone="critical"
                onClick={() => {
                  setPendingRemove({
                    groupId: String(removingGroupId || ""),
                    tag: String(removingTag || ""),
                    buyers: removingBuyers,
                  });
                  setRemoveModalOpen(false);
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Group Details Popup */}
      {popupOpen && selectedGroup && (
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
          }}
          onClick={() => {
            setPopupOpen(false);
            setSelectedGroup(null);
            setExpandedRowId(null);
          }}
        >
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "90%",
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
                alignItems: "center",
              }}
            >
              <div>
                <h2 className="font-bold text-2xl mb-1">
                  {selectedGroup.segmentName}
                </h2>
                <Text variant="bodyMd" tone="subdued" as="span">
                  Tag ID: {selectedGroup.tagID}
                </Text>
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <Button
                  variant="primary"
                  onClick={() => {
                    // Close popup and reset state before navigating
                    setPopupOpen(false);
                    setSelectedGroup(null);
                    setExpandedRowId(null);
                    // Navigate to edit page
                    navigate(
                      `/app/buyer-group/add?segmentId=${selectedGroup.segmentId}`,
                    );
                  }}
                >
                  Edit Group
                </Button>
                <Button
                  variant="plain"
                  onClick={() => {
                    setPopupOpen(false);
                    setSelectedGroup(null);
                    setExpandedRowId(null);
                  }}
                >
                  Close
                </Button>
              </div>
            </div>

            {/* Content */}
            <div
              style={{
                padding: "24px",
                maxHeight: "calc(90vh - 120px)",
                overflow: "auto",
              }}
            >
              {/* Group Summary */}
              <Card>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "20px",
                    padding: "20px",
                    alignItems: "center",
                    background: "#f9fafb",
                    borderRadius: "12px",
                    border: "1px solid #e3e4e8",
                  }}
                >
                  {[
                    {
                      label: "Default Discount",
                      value: selectedGroup.defaultDiscount + "%",
                    },
                    { label: "Default MOQ", value: selectedGroup.defaultMOQ },
                    {
                      label: "Payment Methods",
                      value: Array.isArray(selectedGroup.paymentMethods)
                        ? selectedGroup.paymentMethods.join(", ")
                        : selectedGroup.paymentMethods,
                    },
                    { label: "Buyer Count", value: selectedGroup.buyerCount },
                  ].map((item, idx) => (
                    <div
                      key={item.label}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        padding: "12px",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          color: "#6b7280",
                          fontSize: 13,
                        }}
                      >
                        {item.label}
                      </span>
                      <span
                        style={{
                          fontWeight: 700,
                          color: "#222",
                          fontSize: 17,
                          marginTop: 4,
                        }}
                      >
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Buyers Section */}
              <div style={{ marginTop: "24px" }}>
                <Card>
                  <div style={{ padding: "16px" }}>
                    <div className="bg-white rounded-xl border border-gray-200 shadow p-6 mb-6">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          cursor: "pointer",
                          marginBottom: 16,
                        }}
                        onClick={() => {
                          setGroupOverridesOpen((open) => !open);
                          // If opening and no overrides data yet, trigger loading
                          if (!groupOverridesOpen && selectedGroup && 
                              selectedGroupProductOverrides.length === 0 && 
                              selectedGroupCollectionOverrides.length === 0) {
                            fetchOverridesForGroup(selectedGroup.segmentId);
                          }
                        }}
                      >
                        <h3 style={{ fontWeight: 700, fontSize: "1rem" }}>
                          Group Overrides
                        </h3>
                        <ChevronDown
                          className={`w-5 h-5 transition-transform ${groupOverridesOpen ? "rotate-180" : ""}`}
                          style={{ fontSize: 24 }}
                        />
                      </div>
                      {groupOverridesOpen && (
                        <div className="space-y-4">
                          {overridesLoading ? (
                            <div style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
                              <Spinner size="small" />
                            </div>
                          ) : (
                          <ViewOnlyOverridesTabs
                            productOverrides={selectedGroupProductOverrides}
                            collectionOverrides={
                              selectedGroupCollectionOverrides
                            }
                            accordionStyle
                          />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
                <div style={{ marginBottom: 24 }} />
                <Card>
                  <div style={{ padding: "16px" }}>
                    <h3 style={{ fontWeight: 700, fontSize: "1rem" }}>
                      Assigned Buyers
                    </h3>
                    {currentGroupBuyers.length > 0 ? (
                      <BuyersTable
                        buyers={currentGroupBuyers}
                        group={selectedGroup}
                        removeLoading={removeLoading}
                        setRemoveLoading={setRemoveLoading}
                        pendingRemove={pendingRemove}
                        setPendingRemove={setPendingRemove}
                        submit={submit}
                      />
                    ) : (
                      <span style={{ color: "#9ca3af", fontStyle: "italic" }}>
                        No buyers assigned.
                      </span>
                    )}
                  </div>
                </Card>
                <div style={{ marginBottom: 24 }} />
                <Card>
                  <div style={{ padding: "16px" }}>
                    <h3 style={{ fontWeight: 700, fontSize: "1rem" }}>
                      Unassigned Buyers
                    </h3>
                    <UnassignedBuyersTable
                      group={selectedGroup}
                      assignLoading={assignLoading}
                      setAssignLoading={setAssignLoading}
                    />
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </div>
      )}
      </Page>
      )}
    </>
  );
}