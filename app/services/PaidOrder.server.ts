import type { PaidOrder } from "@prisma/client";
import db from "~/db.server";

export async function createPaidOrder(orderData: PaidOrder) {
  return await db.paidOrder.upsert({
    where: {
      id: orderData.id
    },
    update: {
      orderNumber: orderData.orderNumber,
      shop: orderData.shop,
      orderTotal: orderData.orderTotal,
      createdAt: orderData.createdAt,
      transactionMonth: orderData.createdAt.getMonth() + 1,
      transactionYear: orderData.createdAt.getFullYear()
    },
    create: {
      id: orderData.id,
      orderNumber: orderData.orderNumber,
      shop: orderData.shop,
      orderTotal: orderData.orderTotal,
      createdAt: orderData.createdAt,
      transactionMonth: orderData.createdAt.getMonth() + 1,
      transactionYear: orderData.createdAt.getFullYear()
    }
  });
} 