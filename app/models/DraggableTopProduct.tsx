import type { TopProducts } from "@prisma/client";

export interface DraggableTopProduct {
  index: number;
  topProduct: TopProducts;
}