import { useDownloadSampleCsv } from "~/hooks/useDownloadSampleCsv";
import { useFetcher, useNavigate } from "@remix-run/react";
import React, { useState, useCallback, useEffect } from "react";
import { Button } from "@shopify/polaris";
import { useQueryClient } from "@tanstack/react-query";

export const BuyerGroupCsvModal = ({setCsvModalOpen, selectedGroup }: {setCsvModalOpen: React.Dispatch<React.SetStateAction<boolean>>; selectedGroup: { segmentId: string }; }) => {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetcher = useFetcher();
  const downloadSampleCsv = useDownloadSampleCsv(
    selectedGroup.segmentId,
    false,
  );
  const isUploading = fetcher.state !== "idle";

  // Close modal
  const handleClose = () => {
    setCsvModalOpen(false);
    queryClient.removeQueries({
      queryKey: ["sample-csv", selectedGroup.segmentId],
    });
    setFile(null);
    setStatusMessage(null);
  };

  // File input and drag handlers
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 1) {
      setStatusMessage({
        type: "error",
        text: "Please select a single CSV file.",
      });
      return;
    }
    if (event.target.files?.[0]) {
      setFile(event.target.files[0]);
      setStatusMessage(null);
    }
  };

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (event.dataTransfer.files?.[0]) {
      setFile(event.dataTransfer.files[0]);
      setStatusMessage(null);
    }
  }, []);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
  };

  const handleDownloadSampleCsv = () => downloadSampleCsv.refetch();

  // Form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    if (file.type !== "text/csv") {
      setStatusMessage({
        type: "error",
        text: "Please select a CSV file.",
      });
      return;
    }

    const formData = new FormData();
    formData.append("csvFile", file);
    fetcher.submit(formData, {
      method: "post",
      encType: "multipart/form-data",
      action: "/api/upload-simple-csv",
    });
  };

  // Watch fetcher result
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.status) {
        setStatusMessage({ type: "success", text: fetcher.data.message });
        setFile(null);
        const timeout = setTimeout(() => {
          navigate("/app/buyer-group");
        }, 2000);
        return () => clearTimeout(timeout);
      } else if (fetcher.data.error) {
        setStatusMessage({ type: "error", text: fetcher.data.error });
      }
    }
  }, [fetcher.state, fetcher.data]);

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
      onClick={handleClose}
    >
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "50vw",
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
          <h2 className="font-bold text-xl">Import / Export CSV</h2>
        </div>

        {/* Content */}
        <div
          style={{
            padding: "20px 24px",
            backgroundColor: "#f9fafb",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          {/* Download Button */}
          <div className="mx-auto flex flex-col justify-between items-center w-2/5">
            <Button
              variant="primary"
              size="large"
              fullWidth
              onClick={handleDownloadSampleCsv}
              disabled={downloadSampleCsv.isLoading}
            >
              Download Sample CSV
            </Button>
            {downloadSampleCsv.error && (
              <div
                className={`w-full mt-2 px-3 py-2 rounded-lg font-medium flex justify-center items-center text-red-600 bg-[rgba(255,0,0,0.1)]`}
              >
                {downloadSampleCsv.error.message}
              </div>
            )}
          </div>

          {/* File Drop Area */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`rounded-lg p-10 text-center cursor-pointer border-2 border-dashed ${
              dragActive
                ? "border-[#007aff] bg-[#eef6ff]"
                : "border-[#ccc] bg-white"
            }`}
          >
            <p>
              {file
                ? `Selected file: ${file.name}`
                : "Drag & drop your CSV file here, or click to select"}
            </p>
            <input
              type="file"
              accept=".csv"
              name="csvFile"
              style={{ display: "none" }}
              id="csvFileInput"
              onChange={handleFileChange}
            />
            <label
              htmlFor="csvFileInput"
              style={{ cursor: "pointer", color: "#007aff" }}
            >
              Browse
            </label>
          </div>

          {/* Upload Button */}
          <div className="mx-auto flex flex-col justify-between items-center w-2/5">
            <Button
              variant="primary"
              fullWidth
              size="large"
              onClick={handleSubmit}
              disabled={!file || isUploading}
            >
              {isUploading ? "Uploading..." : "Import"}
            </Button>
            {/* Success / Error Messages */}
            {statusMessage && (
              <div
                className={`w-full mt-2 px-3 py-2 rounded-lg font-medium flex justify-center items-center ${
                  statusMessage.type === "success"
                    ? "text-green-600 bg-[rgba(0,200,0,0.1)]"
                    : "text-red-600 bg-[rgba(255,0,0,0.1)]"
                }`}
              >
                {statusMessage.text}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};