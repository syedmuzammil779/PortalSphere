import prisma from "~/db.server";
import { processSegment } from "~/services/CustomerGroups.server";

export const createSegment = async (): Promise<void> => {
    //First get pending segments
    const segments = await prisma.shopSegmentsData.findMany({
        where: {
            status: false
        },
        take: 20
    });

    //console.log(`Found ${segments.length} segments to process`);

    if(segments != null && segments.length > 0) {
        for(var i in segments) {
            const currentSegment = segments[i];
            await processSegment(currentSegment);
        }
    } 
}
