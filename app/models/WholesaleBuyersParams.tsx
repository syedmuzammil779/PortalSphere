import type { WholesalePricingBuyers } from "@prisma/client"

export interface WholesaleBuyersRequest {
  page: number,
  size: number,
  sortBy: string,
  order: string
}

export interface WholesaleBuyersResponse {
  page: number,
  size: number,
  sortBy: string,
  order: string,
  buyers: WholesalePricingBuyers[],
  totalPages: number,
  totalBuyers: number,
  rejectedTotal: number,
  approvedTotal: number,
  pendingTotal: number,
  shop: string,
  customergroups?: {id: string, name: string}[]
}