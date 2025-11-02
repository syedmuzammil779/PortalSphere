let pptCurrentScript = document.currentScript || (function () {
    let pptScripts = document.getElementsByTagName('script');
    return pptScripts[pptScripts.length - 1];
})();

let pptUrl = new URL(pptCurrentScript.src);
let pptParams = new URLSearchParams(pptUrl.search);

// Extract the parameters
const pptConfig = {
    apiKey: pptParams.get("api_key"),
    appDomain: pptParams.get("appDomain"),
    customerId: pptParams.get("customerId"),
    shopId: pptParams.get("shopId"),
    shopDomain: pptParams.get("shopDomain"),
    storeType: pptParams.get("storeType"),
    timestamp: pptParams.get("timestamp"),
    hmac: pptParams.get("hmac"),
    productVariantId: pptParams.get("productVariantId")
};

console.log('pptConfig loaded', pptConfig);

(function() {
    //let storeType = pptConfig.storeType;
    let customerId = pptConfig.customerId;
    // let isB2B = storeType === 'B2B' ? true : false;
    // let isHybrid = (storeType === 'Hybrid' || !storeType) ? true : false;
    // let isCustomerLoggedIn = (customerId !== null) ? true : false;
    // let customerTag = null;
    // let cartData = null;
    let shop = pptConfig.shopDomain;
    let productVariantId = pptConfig.productVariantId;
    async function populateVolumePricingTable() {
        let volumePricingContainer = document.getElementById('volume-pricing-container');
        let volumePricingTable = document.getElementById('volume-pricing-table');
        let loadingSpinner = document.getElementById('loading-spinner');
        // Show loading spinner and hide table
        loadingSpinner.style.display = 'block';
        volumePricingTable.style.display = 'none';
        try {
            let volumePricingData = await window.productPricingService.getVolumePricingByProductVariantId(pptConfig.appDomain, shop, pptConfig.apiKey, pptConfig.timestamp, pptConfig.hmac, customerId, productVariantId);        
            // Hide loading spinner
            loadingSpinner.style.display = 'none';
            const volumeConfig = volumePricingData?.volumeConfig;
            const priceConfig = volumePricingData?.priceConfig;         
            if (!priceConfig || priceConfig.length === 0) {
                volumePricingContainer.style.display = 'none';
                return;
            }
            // Show table and populate data
            volumePricingTable.style.display = 'table';          
            const body = volumePricingTable.createTBody();
            priceConfig.forEach(config => {
                const row = body.insertRow();
                const quantityCell = row.insertCell();
                const priceCell = row.insertCell();
                const discountCell = row.insertCell();
                quantityCell.textContent = `${config.quantity === 0 ? volumeConfig.minimum : config.quantity}+`;
                priceCell.textContent = `${config.currencySymbol}${fixDecimals(config.price)}`;              
                if (volumePricingData.type === 'fixedAmount'){   
                    const discountAmount = `${config.discountAmount}`;
                    discountCell.textContent = `${config.currencySymbol}${fixDecimals(discountAmount)}`;
                }
                else {
                    const discountPercentage = `${config.percentage}`;
                    discountCell.textContent = `${discountPercentage}%`;
                }
                [quantityCell, priceCell, discountCell].forEach(cell => {
                    cell.style.border = '1px solid #ddd';
                    cell.style.padding = '8px';
                    cell.style.textAlign = 'center';
                });
            });
        } catch (error) {
            console.error('Error updating product prices:', error);
            volumePricingContainer.style.display = 'none'; // Hide the container if there's an error
            loadingSpinner.style.display = 'none'; // Hide the loading spinner
        }
    }
    
    populateVolumePricingTable();
    
})();
