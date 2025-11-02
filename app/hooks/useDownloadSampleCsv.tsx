import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

const fetchSampleCsv = async (segmentId: string) => {
  const res = await fetch(
    `/api/download-sample-csv?segmentId=${encodeURIComponent(segmentId)}`,
  );

  if (!res.ok) {
    const result = await res.json();
    throw new Error(result.error || "Failed to export CSV.");
  }

  // Extract filename
  const contentDisposition = res.headers.get("Content-Disposition");
  let filename = "sample.csv";
  if (contentDisposition) {
    filename = contentDisposition.split("filename=")[1].trim().slice(1, -1);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  return { url, filename };
};

export const useDownloadSampleCsv = (
  segmentId: string | undefined,
  enabled = false,
) => {
  const query = useQuery({
    queryKey: ["sample-csv", segmentId],
    queryFn: () => {
      if (!segmentId) throw new Error("segmentId is required");
      return fetchSampleCsv(segmentId);
    },
    enabled: enabled && !!segmentId,
    refetchOnWindowFocus: false,
    refetchOnMount: false
  });

  useEffect(() => {
    if (query.data?.url && query.data.filename) {
      const link = document.createElement("a");
      link.href = query.data.url;
      link.download = query.data.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(query.data.url);
    }
  }, [query.data]);

  return query;
};