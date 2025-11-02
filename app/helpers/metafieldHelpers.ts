export interface IMetafieldDetails {
    discountId: string;
    metafield: {
        value: string;
        id?: string;
        key?: string;
        namespace?: string;
   }
}


export const escapeJsonForGraphQL = (value: any[]) => JSON.stringify(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
export const escapeObjectForGraphQL = (value: any) => JSON.stringify(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export const getGroupDiscount = (discountList: any[], groupId: string | null): IMetafieldDetails | null => {
    for (const discountObject of discountList) {
        for (const metafield of discountObject.metafields.nodes) {
            if (
                metafield.key === "group_tags" &&
                metafield.namespace === "volume-pricing"
            ) {
                let valueArray;
                try {
                    valueArray = JSON.parse(metafield.value);
                } catch (error) {
                    console.error("Error parsing metafield value:", error);
                    continue;
                }

                if (Array.isArray(valueArray) && valueArray.length > 0) {
                    for (const discountSegment of valueArray) {
                        if (discountSegment.id === groupId) {
                            const response: IMetafieldDetails = {
                                discountId: discountObject.discount.discountId,
                                metafield
                            };
                            return response;
                        }
                    }
                }
            }
        }
    }   

    return null;
}