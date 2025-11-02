import { createPortal } from "react-dom";

export default function PortalModal({ children }: { children: React.ReactNode }) {
  let modalRoot = document.getElementById("modal-root");
  if (!modalRoot) {
    modalRoot = document.createElement("div");
    modalRoot.id = "modal-root";
    document.body.appendChild(modalRoot);
  }
  return createPortal(children, modalRoot);
} 