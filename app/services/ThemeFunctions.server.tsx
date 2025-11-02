import prisma from "~/db.server";
import { B2B_PLUS_NAMESPACE } from "./CustomerGroups.server";
import { getShopIdManual } from "./Settings.server";
import { GraphqlClient } from "@shopify/shopify-api";
import { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { Session } from "@prisma/client";

export const getCurrentScriptConfig = async (shop: string): Promise<any> => {
    return prisma.shopThemeAssets.findMany({
        where: {
            shop: shop
        }
    });
}

export const getThemesForStoreFromGraphQLAPI = async (admin: AdminApiContext|GraphqlClient): Promise<any> => {
    const gQLQuery = `query {
        themes(first: 50, roles: MAIN) {
            edges {
                node {
                    name
                    id
                    role
                }
            }
        }
    }`;

    var response;
    if('graphql' in admin) {
        const resp = await admin.graphql(gQLQuery);
        response = await resp.json();
    } else {
        response = await admin.request(gQLQuery);
    }

    return response;
}

export const getScriptsConfigForThisStore = (shop: Session, assets: any): any => {
    var baseScriptFolder = shop.baseScriptFolder;
    
    if(shop.themeBaseFlag) {
        var parsed = JSON.parse(JSON.stringify(assets));
        var assetContents = JSON.parse(parsed.value);

        var liveThemeProp = null;
        var schema_name:string|null = null;
        if(assetContents && Array.isArray(assetContents) && assetContents.length > 0) {
            for(var i in assetContents) {
                if(assetContents[i] && assetContents[i].hasOwnProperty('name') && assetContents[i].name != null && assetContents[i].name == 'theme_info') {
                    liveThemeProp = assetContents[i];
                    break;
                }
            }
        }

        if(liveThemeProp != null) {
            schema_name = liveThemeProp.theme_name.toLowerCase();
            switch(schema_name) {
                case 'be yours':
                case 'trade': baseScriptFolder = 'trade'; break;
                case 'release': baseScriptFolder = 'release'; break;
                case 'be-yours': baseScriptFolder = 'be-yours'; break;
                case 'warehouse': baseScriptFolder = 'warehouse'; break;
                case 'concept': baseScriptFolder = 'concept'; break;
                case 'broadcast': baseScriptFolder = 'broadcast'; break;
                case 'brooklyn': baseScriptFolder = 'brooklyn'; break;
                case 'impulse': baseScriptFolder = 'impulse'; break;
                case 'empire': baseScriptFolder = 'empire'; break;
                case 'fresh': baseScriptFolder = 'fresh'; break;
                case 'symmetry': baseScriptFolder = 'symmetry'; break;
                case 'motion': baseScriptFolder = 'motion'; break;
                case 'horizon': baseScriptFolder = 'horizon'; break;
                default: baseScriptFolder = shop.baseScriptFolder;
            }
        }

        if(schema_name) {
            setTimeout(async () => {
                await prisma.shopThemeAssets.updateMany({
                    data: { schemaName: schema_name },
                    where: { shop: shop.shop }
                });
            });
        }
        
    }

    var baseScriptPath = shop.baseScriptPath;

    return {
        mainjs: `${baseScriptFolder}/${baseScriptPath}/mainjs.js`,
        cpEmbed: `${baseScriptFolder}/${baseScriptPath}/cpEmbed.js`,
        ppEmbed: `${baseScriptFolder}/${baseScriptPath}/ppEmbed.js`,
        pptEmbed: `${baseScriptFolder}/${baseScriptPath}/pptEmbed.js`,
        tpEmbed: `${baseScriptFolder}/${baseScriptPath}/tpEmbed.js`,
        tspEmbed: `${baseScriptFolder}/${baseScriptPath}/tspEmbed.js`
    }
}

export const syncThemesForStore = async (store: Session, admin: GraphqlClient, assets: any): Promise<any> => {

    var shop = store.shop;
    const response = await getThemesForStoreFromGraphQLAPI(admin);
    const extraAssets = defaultExtraAssets();
    const { data: { themes: { edges } } } = response;
    if(edges != null && edges.length > 0) {
        for(var i in edges) {
            const currentNode = edges[i].node;
            if(currentNode.role === 'MAIN') {

                const scriptsConfig = getScriptsConfigForThisStore(store, assets);

                var payload = {
                    shop: shop,
                    themeName: currentNode.name,
                    themeId: currentNode.id,
                    role: currentNode.role,
                    status: true,
                    extraAssets: extraAssets,
                    mainJs: scriptsConfig.mainjs,
                    ppEmbedBlock: scriptsConfig.ppEmbed,
                    cpBlock: scriptsConfig.cpEmbed,
                    pptBlock: scriptsConfig.pptEmbed,
                    tpEmbedBlock: scriptsConfig.tpEmbed,
                    tspEmbedBlock: scriptsConfig.tspEmbed 
                }

                await prisma.shopThemeAssets.deleteMany({
                    where: { shop: shop }
                })

                await prisma.shopThemeAssets.upsert({
                    where: { shop_themeId: { shop: shop, themeId: currentNode.id } },
                    update: payload,
                    create: payload
                });
            }
        }
    }
}

export const defaultExtraAssets = (): any => {
    var returnVal = new Array();
    returnVal.push('<script src="https://code.jquery.com/jquery-3.7.1.min.js" defer></script>');
    returnVal.push('<script>document.addEventListener("DOMContentLoaded", function () { $.noConflict(); });</script>');
    returnVal.push('<link rel="stylesheet" src="https://app_domain/css/extensions.css">');
    returnVal.push('<script src="https://app_domain/analytics/tracking.js" defer></script>');
    return returnVal;
}

export const setThemeMetafieldForStore = async (store: any, admin: GraphqlClient, assets: any): Promise<any> => {
    await syncThemesForStore(store, admin, assets);
    let existingRows = await getCurrentScriptConfig(store.shop);
    
    var data = new Array();
    for(var i in existingRows) {
        var row = existingRows[i];
        if(row.role == 'MAIN') { //No use considering other themes as we have no way to get actual theme id on the theme app extension
            data.push({
                role: row.role,
                name: row.themeName,
                extraAssets: row.extraAssets,
                mainJS: {
                    src: row.mainJs,
                    status: row.status
                },
                ppEmbedBlock: {
                    src: row.ppEmbedBlock,
                    status: row.ppEmbedFlag
                },
                pptBlock: {
                    src: row.pptBlock,
                    status: row.pptBlockFlag
                },
                cpBlock: {
                    src: row.cpBlock,
                    status: row.cpBlockFlag
                },
                tspEmbedBlock: {
                    src: row.tspEmbedBlock,
                    status: row.tspEmbedBlockFlag
                },
                tpEmbedBlock: {
                    src: row.tpEmbedBlock,
                    status: row.tpEmbedBlockFlag
                }
            });
        }
    }

    const variables = [{
        namespace: B2B_PLUS_NAMESPACE,
        key: 'themeScriptsConfig',
        value: JSON.stringify(data),
        type: 'json',
        ownerId: await getShopIdManual(admin, store.shop)        
    }];

    const mutation = `mutation createMetafields($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
            metafields {
                key
                namespace
                value
            }
            userErrors {
                field
                message
            }
        }   
    }`;

    await admin.request(mutation, { variables: { metafields: variables } }); 
}