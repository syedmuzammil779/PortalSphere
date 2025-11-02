import { useState, useEffect } from "react";
import type { BuyerGroupForm } from "~/models/BuyerGroup";

interface Props {
  formData: FormData;
  updateFormData: (field: keyof FormData, value: string) => void;
  onValidationChange?: (isValid: boolean) => void;
  showValidationErrors?: boolean;
}

interface FormData {
  groupName: string;
  shortDescription: string;
}

function BuyGroupGeneralInfo({
  formData,
  updateFormData,
  onValidationChange,
  showValidationErrors,
}: Props) {
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const handleGroupNameChange = (value: string) => {
    updateFormData("groupName", value);

    // Clear error when user starts typing
    if (value.trim() && errors.groupName) {
      setErrors((prev) => ({ ...prev, groupName: "" }));
    }
  };

  const handleShortDescriptionChange = (value: string) => {
    updateFormData("shortDescription", value);

    // Clear error when user starts typing (if there was one)
    if (errors.shortDescription) {
      setErrors((prev) => ({ ...prev, shortDescription: "" }));
    }
  };

  const validateGroupName = () => {
    if (!formData.groupName.trim()) {
      setErrors((prev) => ({ ...prev, groupName: "Group name is required" }));
      return false;
    }
    return true;
  };

  const validateShortDescription = () => {
    // Short description is no longer required
    return true;
  };

  const validateForm = () => {
    const isGroupNameValid = validateGroupName();
    // Short description validation is always true now
    return isGroupNameValid;
  };

  // Validate form whenever formData changes and notify parent
  useEffect(() => {
    const isValid = formData.groupName.trim() !== "";
    // Short description is no longer required
    onValidationChange?.(isValid);
  }, [formData.groupName, onValidationChange]);

  // Validate fields immediately when component loads or formData changes
  useEffect(() => {
    // Only validate group name on load since short description is not required
    validateGroupName();
  }, [formData.groupName]);

  // Initial validation on component mount
  useEffect(() => {
    // Only validate group name on mount since short description is not required
    validateGroupName();
  }, []); // Empty dependency array means this runs only once on mount

  // Show validation errors when triggered from parent
  useEffect(() => {
    if (showValidationErrors) {
      validateGroupName();
      // Short description validation is not needed
    }
  }, [showValidationErrors]);

  // Expose validation function to parent component
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).validateBuyGroupGeneralInfo = validateForm;
    }
  }, [formData]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[25%,1fr,1fr] gap-6">
      <div className="lg:col-span-1 space-y-6">
        <div className=" rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            General Info
          </h2>
          <p className="text-sm text-gray-500 mb-4">Internal use only.</p>
        </div>
      </div>
      <div className="lg:col-span-2 space-y-6">
        {/* General Info Form */}
        <div className="bg-white rounded-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-medium text-gray-900">
                General Info
              </h3>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Group name <span className="text-red-500">*</span> <span className="text-xs text-gray-500">(Required)</span>
              </label>
              <input
                name="groupName"
                type="text"
                value={formData.groupName}
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Short Description
              </label>
              <textarea
                name="shortDescription"
                value={formData.shortDescription}
                onChange={(e) => handleShortDescriptionChange(e.target.value)}
                rows={3}
                className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.shortDescription
                    ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                    : "border-gray-300"
                }`}
              />
              {errors.shortDescription && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.shortDescription}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BuyGroupGeneralInfo;
