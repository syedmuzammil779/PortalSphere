export interface Buyer {
    id: string;
    companyName: string;
    companyAddress: string;
    contactFirstName: string;
    contactLastName: string;
    emailAddress: string;
    phoneNumber: string;
    buyerType: string;
    locationCount: string|number;
    customerGroup?: string;
    status: string;
    info: string|object|null;
  }