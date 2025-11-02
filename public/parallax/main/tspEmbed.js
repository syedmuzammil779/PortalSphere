let tspScript = document.currentScript || (function () {
  let tspScripts = document.getElementsByTagName('script');
  return tspScripts[tspScripts.length - 1];
})();

let tspUrl = new URL(tspScript.src);
let tspParams = new URLSearchParams(tspUrl.search);

// Extract the parameters
const tspConfig = {
  apiKey: tspParams.get("api_key"),
  appDomain: tspParams.get("appDomain"),
  customerId: tspParams.get("customerId"),
  shopId: tspParams.get("shopId"),
  shopDomain: tspParams.get("shopDomain"),
  storeType: tspParams.get("storeType"),
  timestamp: tspParams.get("timestamp"),
  hmac: tspParams.get("hmac"),
  productVariantId: tspParams.get("productVariantId"),
  productId: tspParams.get("productId"),
  enableTopProducts: tspParams.get("enableTopProducts")
};

let topProductState = {
  priceElement: document.getElementById('top-product-price'),
  quantityInput: document.getElementById('top-quantity-input'),
  minusButton: document.getElementById('top-quantity-minus'),
  plusButton: document.getElementById('top-quantity-plus'),
  quantityInputGroup: document.querySelector('#top-product-embed quantity-input.quantity'),
  eventListenerFlags: {},
  customerId: tspConfig.customerId,
  productId: tspConfig.productId,
  variantId: tspConfig.productVariantId,
  shop: tspConfig.shopDomain,
  topProductVolumePricing: null,
  topProduct: null,
  addToCartTopProduct: document.getElementById('add-top-product'),
  learnMoreTopProduct: document.getElementById('learn-more-top-product'),
  topProductEmbed: document.getElementById('top-product-embed'),
  cartLineItems: null,
  cartItemsVariants: []
};
let topProductPopupState = {
  topProductData: null,
  topProductVolumePricing: null,
  customerId: tspConfig.customerId,
  shop: tspConfig.shopDomain,
}

if (!window.topSellerPopupService) {
  window.topSellerPopupService = {
    displayTopSellerPopup: async function () {
      const topsellerPopup = document.getElementById('top-seller-popup');
      topsellerPopup.style.display = 'flex';
      topsellerPopup.scrollTo(0, 0);
      topsellerPopup.style.right = '0';
      document.body.style.overflow = 'auto'; 
      const headerText = document.getElementById('cp-ts-header-text');
      const sellingPoint = document.getElementById('cp-ts-selling-point');
      const productTitle = document.getElementById('cp-ts-product-title');
      const productImage = document.getElementById('cp-ts-product-image');
      const productWholesalePrice = document.getElementById('cp-ts-product-wholesale-price');
      const productOriginalPrice = document.getElementById('cp-ts-product-original-price');
      const productDescription = document.getElementById('cp-ts-product-description');
      const productDescriptionTooltip = document.getElementById('cp-ts-product-description-tooltip');
      const addBtn = document.getElementById('cp-ts-add-to-cart');
      const quantityInfo = document.getElementById('cp-ts-quantity-info');
      const quantityInput = document.getElementById('cp-ts-quantity-input');
      const minusBtn = document.getElementById('cp-ts-minus');
      const plusBtn = document.getElementById('cp-ts-plus');
      customerTag = await getCustomerTag();
      if (headerText && isB2B && customerTag) {
        headerText.innerHTML = 'Top-seller with companies like yours!';
        sellingPoint.innerHTML = 'This product is flying off the shelves for businesses just like yours. Don\'t miss out on a customer favorite!';
      } else {
        headerText.innerHTML = 'Top Seller!';
        sellingPoint.innerHTML = 'This one\'s selling fast. Don\'t miss out on a customer favorite.';
      }
      const cartData = await window.cartService.getCart();
      const lineItems = cartData.items.map(x => { 
        return {product_id: x.product_id, variant_id: x.variant_id, quantity: x.quantity}
      });
      try {
        const response = await fetch(`https://${tspConfig.appDomain}/api/top-products?shop=${tspConfig.shopDomain}&customer=${tspConfig.customerId}&api_key=${tspConfig.apiKey}&timestamp=${tspConfig.timestamp}&hmac=${tspConfig.hmac}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ lineItems }),
        });
        const data = await response.json();
        if (data.error) {
          console.error(data.error);
          return;
        }
        topProductPopupState.topProductData = data;
        const volData = await window.productPricingService.getVolumePricingByProductVariantId(tspConfig.appDomain, tspConfig.shopDomain, tspConfig.apiKey, tspConfig.timestamp, tspConfig.hmac, tspConfig.customerId, data.productVariantId);
        topProductPopupState.topProductVolumePricing = volData;
        const quantityInput = document.getElementById('cp-ts-quantity-input');
        quantityInput.value = topProductPopupState.topProductVolumePricing.volumeConfig.minimum;
      } catch (error) {
        console.error('Error:', error);
      }
      const cptsLoadingSpinner = document.getElementById('cp-ts-loading-spinner');
      cptsLoadingSpinner.style.display = 'none';
      const volumeConfig = topProductPopupState.topProductVolumePricing.volumeConfig;
      if (!volumeConfig.maximum || volumeConfig.maximum == Number.MAX_SAFE_INTEGER) {
        quantityInfo.textContent = `Min. ${topProductPopupState.topProductVolumePricing.volumeConfig.minimum} • Increments of ${topProductPopupState.topProductVolumePricing.volumeConfig.increment}`;  
      } else {
        quantityInfo.textContent = `Min. ${topProductPopupState.topProductVolumePricing.volumeConfig.minimum} • Max ${topProductPopupState.topProductVolumePricing.volumeConfig.maximum} • Increments of ${topProductPopupState.topProductVolumePricing.volumeConfig.increment}`;
      }
      productTitle.textContent = topProductPopupState.topProductData.productInfo.title;
      productImage.src = topProductPopupState.topProductData.productInfo.image;
      productImage.style.display = 'block';
      productDescription.textContent = topProductPopupState.topProductData.productInfo.description;
      productDescriptionTooltip.textContent = topProductPopupState.topProductData.productInfo.description;
      const priceConfig = topProductPopupState.topProductVolumePricing.priceConfig[0];
      productOriginalPrice.textContent = `MSRP ${priceConfig.currencySymbol}${priceConfig.originalPrice}`;
      productWholesalePrice.textContent = `${priceConfig.currencySymbol}${priceConfig.price}`;
      productTitle.onclick = function(e) {
        e.preventDefault();
        const productUrl = topProductPopupState.topProductData.productInfo.url;
        const variantId = topProductPopupState.topProductData.productVariantId;
        window.location.href = `${productUrl}?variant=${variantId}`;
      };
      addBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        topsellerPopup.style.display = 'none';
        const variantId = topProductExtractVariantIdFromGid(topProductPopupState.topProductData.productVariantId);
        const quantity = parseInt(quantityInput.value, 10);
        await window.topProductEmbedUtils.addTopSellerToCart(variantId, quantity);
      });
      minusBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const volumeConfig = topProductPopupState.topProductVolumePricing.volumeConfig;
        let currentValue = parseInt(quantityInput.value, 10);
        currentValue -= volumeConfig.increment;
        if (currentValue < volumeConfig.minimum || currentValue < 1) {
          currentValue = volumeConfig.minimum === 0 ? 1 : volumeConfig.minimum;
        }
        const priceConfig = topProductPopupState.topProductVolumePricing.priceConfig.find(p => currentValue >= p.quantity && currentValue < p.maxQuantity);
        if (priceConfig) {
          productOriginalPrice.textContent = `MSRP ${priceConfig.currencySymbol}${priceConfig.originalPrice}`;
          productWholesalePrice.textContent = `${priceConfig.currencySymbol}${priceConfig.price}`;
        }
        quantityInput.value = currentValue;
        return;
      });
      plusBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const volumeConfig = topProductPopupState.topProductVolumePricing.volumeConfig;
        let currentValue = parseInt(quantityInput.value, 10);
        currentValue += parseInt(volumeConfig.increment, 10);
        if (currentValue > volumeConfig.maximum) {
          currentValue = volumeConfig.maximum;
        }
        const priceConfig = topProductPopupState.topProductVolumePricing.priceConfig.find(p => currentValue >= p.quantity && currentValue < p.maxQuantity);
        if (priceConfig) {
          productOriginalPrice.textContent = `MSRP ${priceConfig.currencySymbol}${priceConfig.originalPrice}`;
          productWholesalePrice.textContent = `${priceConfig.currencySymbol}${priceConfig.price}`;
        }
        quantityInput.value = currentValue;
        return;
      });
    },
    generateTopSellerPopup: function() {
      return `
        <div class="topseller-popup-content">
          <div style="padding: 20px; height: 100%; display: flex; flex-direction: column;">
            <button id="close-top-seller-popup" style="background: none; border: none; font-size: 32px; cursor: pointer; position: absolute; top: 10px; right: 15px; color: #333; z-index: 10;" aria-label="Close">&times;</button>
            
            <div style="flex-grow: 1; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none;">
              <h2 id="cp-ts-header-text" style="font-weight: bold; margin-bottom: 10px;"></h2>
              <p id="cp-ts-selling-point" style="color: black; margin-bottom: 20px;"></p>
              
              <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: center; align-items: center; margin-bottom: 20px;">
                  <span id="cp-ts-loading-spinner" class="loading-spinner"></span>
                  <img style="display: none; max-width: 100%; height: 300px;" id="cp-ts-product-image" src="">
                </div>
                
                <a href="#" id="cp-ts-product-title" style="display: block; font-weight: bold; margin-bottom: 10px; color: #000; text-decoration: none;"></a>
                
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                  <p id="cp-ts-product-wholesale-price" style="font-size: 1.2em; font-weight: bold; margin: 0;"></p>
                  <p id="cp-ts-product-original-price" style="font-size: 0.8em; color: #666; margin: 0;"></p>
                </div>
  
                <div class="tooltip">
                  <p id="cp-ts-product-description" style="color: #000; margin-bottom: 20px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; line-height: 1.4;"></p>
                  <span id="cp-ts-product-description-tooltip" class="tooltiptext"></span>
                </div>
              </div>
            </div>
  
            <div style="padding: 20px; border-top: 1px solid #eee; background: white;">
              <div style="display: flex; align-items: center; margin-bottom: 15px;">
                <div style="display: flex; align-items: center; border: 1px solid #dcdcdc; margin-right: 10px;">
                  <button id="cp-ts-minus" style="width: 40px; height: 40px; background: none; border: none; font-size: 16px; cursor: pointer;">−</button>
                  <input id="cp-ts-quantity-input" style="width: 40px; height: 40px; border: none; border-left: 1px solid #dcdcdc; border-right: 1px solid #dcdcdc; font-size: 16px; text-align: center;" value="1" readonly>
                  <button id="cp-ts-plus" style="width: 40px; height: 40px; background: none; border: none; font-size: 16px; cursor: pointer;">+</button>
                </div>
                <p id="cp-ts-quantity-info" style="font-size: 14px; color: #666; margin: 0;"></p>
              </div>
  
              <button id="cp-ts-add-to-cart" style="background-color: #000; color: white; border: none; padding: 15px; width: 100%; font-size: 16px; cursor: pointer; margin-bottom: 10px;">Add</button>
              <button id="close-top-seller-nothanks" style="background: none; border: none; color: #666; cursor: pointer; width: 100%;">No thank you</button>
            </div>
          </div>
        </div>
      `;
    },
    createTopSellerPopup: function() {
      const popupDiv = document.createElement('div');
      popupDiv.id = 'top-seller-popup';
      popupDiv.className = 'popup';
      popupDiv.style.display = 'none'; // initially hidden
      popupDiv.style.justifyContent = 'center';
      popupDiv.style.alignItems = 'center';

      // Additional styles from the CSS
      popupDiv.style.position = 'fixed'; // you likely need positioning
      popupDiv.style.right = '0';
      popupDiv.style.left = 'auto';
      popupDiv.style.height = '100%';
      popupDiv.style.width = '25rem';
      popupDiv.style.background = '#fff';
      popupDiv.style.padding = '20px';
      popupDiv.style.flexDirection = 'column'; // optional depending on layout
      popupDiv.style.alignItems = 'flex-start'; // overridden from 'center' above
      
      popupDiv.innerHTML = window.topSellerPopupService.generateTopSellerPopup();
  
      document.body.appendChild(popupDiv);
      // Close button functionality
      const closeBtn = popupDiv.querySelector('#close-top-seller-popup');
      const nothanksBtn = popupDiv.querySelector('#close-top-seller-nothanks');
  
      closeBtn.onclick = function(e) {
        e.preventDefault();
        popupDiv.style.display = 'none';
        window.reloadPageWithCartOpen('openCart', 'true');
      };
  
      nothanksBtn.onclick = function(e) {
        e.preventDefault();
        popupDiv.style.display = 'none';
        window.reloadPageWithCartOpen('openCart', 'true');
      };    
  
      // Close when clicking outside the popup
      window.onclick = function(event) {
        if (event.target === popupDiv) {
          e.preventDefault();
          popupDiv.style.display = 'none';
          unlockScroll();
        }
      };
  
      return popupDiv;
    }
  }
}