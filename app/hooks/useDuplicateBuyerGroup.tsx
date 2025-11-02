import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@remix-run/react";

type T_DuplicateBuyerGroupData = {
  groupId: string;
  name: string;
};

const duplicateBuyerGroup = async (data: T_DuplicateBuyerGroupData) => {
  const res = await fetch(`/api/buyer-group/duplicate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const result = await res.json();
  if (!res.ok) { throw new Error(result.message) }
  return result;
};

export const useDuplicateBuyerGroup = () => {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: duplicateBuyerGroup,
    onSuccess: (data) => {
      navigate("/app/buyer-group");
    },
  });
};