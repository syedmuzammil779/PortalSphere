import { Button } from "@shopify/polaris";
import React, { useEffect, useState } from "react";
import { useDuplicateBuyerGroup } from "~/hooks/useDuplicateBuyerGroup";

export const DuplicateBuyerGroupModal = (
    { setPopupOpen, selectedGroup }: { setPopupOpen: React.Dispatch<React.SetStateAction<boolean>>; selectedGroup: any; }
) => {
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
    
    useEffect(() => {
        if (duplicateBuyerGroup.isSuccess) {
            setPopupOpen(false);
        }
    }, [duplicateBuyerGroup.isSuccess]);

    useEffect(() => {
        //console.log("selectedGroup", selectedGroup);
    }, [selectedGroup]);

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
                    <h2 style={{ fontWeight: "bold", fontSize: "1.25rem" }}>
                        Duplicate Buyer Group
                    </h2>{" "}
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
                    <label
                        style={{
                            display: "block",
                            fontSize: "0.875rem", // text-sm
                            fontWeight: 500, // font-medium
                            color: "#374151", // text-gray-700
                            marginBottom: "0.5rem", // mb-2
                        }}
                    >
                        Duplicate Group name{" "}
                        <span style={{ color: "#ef4444" /* text-red-500 */ }}>*</span>{" "}
                        <span
                            style={{
                                fontSize: "0.75rem", // text-xs
                                color: "#6b7280", // text-gray-500
                            }}
                        >
                            (Required)
                        </span>
                    </label>
                    <input
                        name="groupName"
                        type="text"
                        value={buyerGroupName}
                        onChange={(e) => handleGroupNameChange(e.target.value)}
                        onBlur={validateGroupName}
                        style={{
                        width: "100%",
                        paddingLeft: "0.75rem",
                        paddingRight: "0.75rem",
                        paddingTop: "0.5rem",
                        paddingBottom: "0.5rem",
                        borderWidth: "1px",
                        borderRadius: "0.375rem",
                        fontSize: "0.875rem",
                        outline: "none",
                        borderColor: errors.groupName ? "#fca5a5" : "#d1d5db",
                        boxShadow: errors.groupName
                            ? "0 0 0 2px #ef4444"
                            : "0 0 0 2px #3b82f6"
                        }}
                    />
                    {errors.groupName && (
                        <p
                            style={{
                                marginTop: "0.25rem",
                                fontSize: "0.875rem",
                                color: "#dc2626" 
                            }}
                        >
                            {errors.groupName}
                        </p>
                    )}{" "}
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