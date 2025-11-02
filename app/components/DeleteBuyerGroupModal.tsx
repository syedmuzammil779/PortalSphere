import { useNavigate } from "@remix-run/react";
import { Button } from "@shopify/polaris";

export const DeleteBuyerGroupModal = ({
  setShowDeleteModal,
  deleting,
  setDeleting,
  selectedGroup,
}: {
  setShowDeleteModal: React.Dispatch<React.SetStateAction<boolean>>;
  deleting: boolean;
  setDeleting: React.Dispatch<React.SetStateAction<boolean>>;
  selectedGroup: any;
}) => {
  const navigate = useNavigate();
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
        setShowDeleteModal(false);
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
          <h2 style={{ fontWeight: "bold", fontSize: "1.25rem" }}>
            Delete Buyer Group
          </h2>
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
          <p
            style={{
              display: "block",
              fontSize: "0.875rem", // text-sm
              fontWeight: 500, // font-medium
              color: "#374151", // text-gray-700
              marginBottom: "0.5rem", // mb-2
            }}
          >
            Are you sure you want to delete this group? This action cannot be
            undone.
          </p>
        </div>

        <div
          style={{
            padding: "20px 24px",
            backgroundColor: "#f9fafb",
            display: "flex",
            gap: "12px",
            justifyContent: "flex-end",
            alignItems: "center",
            width: "100%",
          }}
        >
          {/* Buttons or content go here */}
          <Button
            variant="plain"
            size="large"
            onClick={() => setShowDeleteModal(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            tone="critical"
            size="large"
            onClick={async () => {
              if (!selectedGroup.segmentId) return;
              setDeleting(true);
              try {
                const res = await fetch(
                  `/api/buyer-group/delete?segmentId=${encodeURIComponent(selectedGroup.segmentId)}`,
                );
                const data = await res.json();
                if (data.status) {
                  navigate("/app/buyer-group");
                } else {
                  alert(data.message || "Failed to delete group.");
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
          </Button>
        </div>
      </div>
    </div>
  );
};