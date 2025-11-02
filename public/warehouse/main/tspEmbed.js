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

const addToCartSelectors = [
  'form[action*="/cart/add"] button[type="submit"]'
];

(function() {
  let storeType = tspConfig.storeType;
  let customerId = tspConfig.customerId;
  let isB2B = storeType === 'B2B' ? true : false;
  // let isHybrid = (storeType === 'Hybrid' || !storeType) ? true : false;
  // let isCustomerLoggedIn = (customerId !== null) ? true : false;
  let shop = tspConfig.shopDomain;
  let customerTag = null;
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
    cartItemsVariants: [],
    variantConfigurations: null,
    currentVariantSelections: {}
  };
  let topProductPopupState = {
    topProductData: null,
    topProductVolumePricing: null,
    customerId: tspConfig.customerId,
    shop: tspConfig.shopDomain,
  }
  // async function fetchTopProductVolumePricing() {
  //   const data = await window.productPricingService.getVolumePricingByProductVariantId(tspConfig.appDomain, topProductState.shop, tspConfig.apiKey, tspConfig.timestamp, tspConfig.hmac, topProductState.customerId, topProductState.variantId);
  //   return data;
  // }
  async function fetchTopProductPopupVolumePricing(variantId) {
    const data = await window.productPricingService.getVolumePricingByProductVariantId(tspConfig.appDomain, topProductState.shop, tspConfig.apiKey, tspConfig.timestamp, tspConfig.hmac, topProductState.customerId, variantId);
    return data;
  }
  async function getCustomerTag() {
    const data = await window.customerService.getCustomerTag(tspConfig.appDomain, tspConfig.shopDomain, tspConfig.apiKey, tspConfig.timestamp, tspConfig.hmac, tspConfig.customerId);
    return data;
  }

  if(!window.displayTopSellerPopup) {

    async function recordButtonClick(buttonType, tag, operation) {
      await window.customerService.recordButtonClick(tspConfig.appDomain, tspConfig.shopDomain, tspConfig.apiKey, tspConfig.timestamp, tspConfig.hmac, tspConfig.customerId, tag, buttonType, operation);
    }

    function updateCarouselText() {
      const productDescription = document.getElementById('cp-ts-product-description');
      const productDescriptionTooltip = document.getElementById('cp-ts-product-description-tooltip');
      const productImage = document.getElementById('cp-ts-product-image');
      const productTitle = document.getElementById('cp-ts-product-title');
      const productWholesalePrice = document.getElementById('cp-ts-product-wholesale-price');
      const productOriginalPrice = document.getElementById('cp-ts-product-original-price');
      const quantityInfo = document.getElementById('cp-ts-quantity-info');
      const quantityInput = document.getElementById('cp-ts-quantity-input');
      
      const variantConfigurations = topProductState.variantConfigurations;
      var i = parseInt(document.getElementById('carouselCounter').value) - 1;
      const keys = Object.keys(variantConfigurations);

      if (i >= 0 && i <= keys.length) {
        const key = keys[i];
        const data = variantConfigurations[key];

        if(data) {
          if(data.variantInfo.product.featuredImage) {
            productImage.setAttribute('src', data.variantInfo.product.featuredImage); 
          }

          productDescription.innerHTML = data.variantInfo.product.descriptionHtml;
          productDescriptionTooltip.innerHTML = data.variantInfo.product.descriptionHtml;
        
          if(data.variantInfo.title) {
            productTitle.innerHTML = data.variantInfo.title;
            const handleURL = `/products/${data.variantInfo.product.handle}?variant=${data.variantInfo.id.replace('gid://shopify/ProductVariant/', '')}`
            productTitle.href = handleURL;
            productTitle.setAttribute('href', handleURL);
          }

          const priceConfig = topProductState.currentVariantSelections != null && topProductState.currentVariantSelections.hasOwnProperty(key) ? topProductState.currentVariantSelections[key].priceConfig : data.priceConfig.priceConfig[0];
          const volumeConfig = topProductState.currentVariantSelections != null && topProductState.currentVariantSelections.hasOwnProperty(key) ? topProductState.currentVariantSelections[key].volumeConfig : data.priceConfig.volumeConfig;
          const newQuantity = topProductState.currentVariantSelections != null && topProductState.currentVariantSelections.hasOwnProperty(key) ? topProductState.currentVariantSelections[key].newQuantity : null
          productOriginalPrice.textContent = `${priceConfig.currencySymbol}${priceConfig.originalPrice}`;
          productWholesalePrice.textContent = `${priceConfig.currencySymbol}${priceConfig.price}`;

          if (!volumeConfig.maximum || volumeConfig.maximum == Number.MAX_SAFE_INTEGER) {
            quantityInfo.textContent = `Min. ${volumeConfig.minimum} • Increments of ${volumeConfig.increment}`;  
          } else {
            quantityInfo.textContent = `Min. ${volumeConfig.minimum} • Max ${volumeConfig.maximum} • Increments of ${volumeConfig.increment}`;
          }

          const newText = `${parseInt(i) + 1} of ${Object.keys(variantConfigurations).length}`;
          document.getElementById('carouselValue').value = newText;
          document.getElementById('selectedTopVariant').value = data.variantInfo.id;

          quantityInput.setAttribute('value', newQuantity ? newQuantity : volumeConfig.minimum);
          quantityInput.value = newQuantity ? newQuantity : volumeConfig.minimum;
        }
      }
    }

    window.displayTopSellerPopup = async function () {
      const topsellerPopup = document.getElementById('top-seller-popup');
      //topsellerPopup.style.display = 'flex';
      const headerText = document.getElementById('cp-ts-header-text');
      const sellingPoint = document.getElementById('cp-ts-selling-point');
      // const productTitle = document.getElementById('cp-ts-product-title');
      // const productImage = document.getElementById('cp-ts-product-image');
      // const productWholesalePrice = document.getElementById('cp-ts-product-wholesale-price');
      // const productOriginalPrice = document.getElementById('cp-ts-product-original-price');
      // const productDescription = document.getElementById('cp-ts-product-description');
      // const productDescriptionTooltip = document.getElementById('cp-ts-product-description-tooltip');
      // const quantityInfo = document.getElementById('cp-ts-quantity-info');
      const addBtn = document.getElementById('cp-ts-add-to-cart');
      const quantityInput = document.getElementById('cp-ts-quantity-input');
      const minusBtn = document.getElementById('cp-ts-minus');
      const plusBtn = document.getElementById('cp-ts-plus');
      
      customerTag = await getCustomerTag();
      if (headerText && isB2B && customerTag) {
        headerText.innerHTML = `Top-seller with companies like yours!`;
        sellingPoint.innerHTML = `This product is flying off the shelves for businesses just like yours. Don't miss out on a customer favorite!`;
      } else {
        headerText.innerHTML = `Top Seller!`;
        sellingPoint.innerHTML = `This one's selling fast. Don't miss out on a customer favorite.`;
      }
      const cartData = await window.cartService.getCart();
      const lineItems = cartData.items.map(x => { 
        return { product_id: x.product_id, variant_id: x.variant_id, quantity: x.quantity }
      });
      
      const data = await window.topSellerPopupService.getTopProductForTopSeller(tspConfig, lineItems);
      const cptsLoadingSpinner = document.getElementById('cp-ts-loading-spinner');
      cptsLoadingSpinner.style.display = 'none';

      document.getElementById('carouselCounter').value = 1;
      topProductState.variantConfigurations = data.variantsConfiguration;
      
      updateCarouselText();

      plusBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const variantId = document.getElementById('selectedTopVariant').value;
        const data = topProductState.variantConfigurations[variantId];
        
        const volumeConfig = data.priceConfig.volumeConfig; 
        let currentValue = parseInt(quantityInput.value, 10);
        currentValue += parseInt(volumeConfig.increment, 10);
        if (currentValue > volumeConfig.maximum) {
          currentValue = volumeConfig.maximum;
        }

        const priceConfig = data.priceConfig.priceConfig.find(p => currentValue >= p.quantity && currentValue < p.maxQuantity);
        topProductState.currentVariantSelections[variantId] = { priceConfig: priceConfig, volumeConfig: volumeConfig, newQuantity: currentValue };
        updateCarouselText();
      }, true);

      minusBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const variantId = document.getElementById('selectedTopVariant').value;
        const data = topProductState.variantConfigurations[variantId];
        
        const volumeConfig = data.priceConfig.volumeConfig; 
        
        let currentValue = parseInt(quantityInput.value, 10);
        currentValue -= volumeConfig.increment;
        if (currentValue < volumeConfig.minimum || currentValue < 1) {
          currentValue = volumeConfig.minimum === 0 ? 1 : volumeConfig.minimum;
        }
        const priceConfig = data.priceConfig.priceConfig.find(p => currentValue >= p.quantity && currentValue < p.maxQuantity);
        topProductState.currentVariantSelections[variantId] = { priceConfig: priceConfig, volumeConfig: volumeConfig, newQuantity: currentValue };
        updateCarouselText();
      }, true);

      addBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        topsellerPopup.style.display = 'none';
        var variantId = document.getElementById('selectedTopVariant').value;
        variantId = topProductExtractVariantIdFromGid(variantId);
        const quantity = parseInt(quantityInput.value, 10);
        await window.topProductEmbedUtils.addTopSellerToCart(variantId, quantity);
        await recordButtonClick('top_product_embed', customerTag, JSON.stringify({'variantId': variantId, 'quantity': quantity}));
        try {
          const newCart = await window.cartService.getCart();
          const cartCount = document.querySelector('.header__cart-count') || document.querySelector('.cart-item-count-bubble');
          if (cartCount) {
            cartCount.textContent = newCart.item_count;
          }
          document.documentElement.dispatchEvent(
            new CustomEvent('cart:refresh', {
              bubbles: true
            })
          );
          setTimeout(async () => {
            await window.bindCartDrawerQuantityButtons();
          })
        } catch (error) {
          console.error('Error updating cart count:', error);
        }
      }, true);
      
      document.getElementById('showPrev').addEventListener('click', function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        var currentVal = parseInt(document.getElementById('carouselCounter').value);
        if(currentVal > 1) {
          document.getElementById('carouselCounter').value = parseInt(currentVal) - 1;
          updateCarouselText();
        }
      });

      document.getElementById('showNext').addEventListener('click', function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        var currentVal = parseInt(document.getElementById('carouselCounter').value);
        if(currentVal < Object.keys(topProductState.variantConfigurations).length) {
          document.getElementById('carouselCounter').value = parseInt(currentVal) + 1;
          updateCarouselText();
        }
      });
    
      
      /*
      quantityInput.value = topProductPopupState.topProductVolumePricing.volumeConfig.minimum;
      topProductPopupState.topProductData = data;
      const volData = await fetchTopProductPopupVolumePricing(data.productVariantId);
      topProductPopupState.topProductVolumePricing = volData;
        
      const volumeConfig = topProductPopupState.topProductVolumePricing.volumeConfig;
      if (!volumeConfig.maximum || volumeConfig.maximum == Number.MAX_SAFE_INTEGER) {
        quantityInfo.textContent = `Min. ${topProductPopupState.topProductVolumePricing.volumeConfig.minimum} • Increments of ${topProductPopupState.topProductVolumePricing.volumeConfig.increment}`;  
      }
      else {
        quantityInfo.textContent = `Min. ${topProductPopupState.topProductVolumePricing.volumeConfig.minimum} • Max ${topProductPopupState.topProductVolumePricing.volumeConfig.maximum} • Increments of ${topProductPopupState.topProductVolumePricing.volumeConfig.increment}`;
      }
      productTitle.textContent = topProductPopupState.topProductData.productInfo.title;

      const url = `${topProductPopupState.topProductData.productInfo.url}?variant=${topProductPopupState.topProductData.productVariantId}`;
      productTitle.setAttribute('href', url);

      productImage.src = topProductPopupState.topProductData.productInfo.image;
      productImage.style.display = 'block';
      productDescription.textContent = topProductPopupState.topProductData.productInfo.description;
      productDescriptionTooltip.textContent = topProductPopupState.topProductData.productInfo.description;
      const priceConfig = topProductPopupState.topProductVolumePricing.priceConfig[0];
      productOriginalPrice.textContent = `MSRP ${priceConfig.currencySymbol}${priceConfig.originalPrice}`;
      productWholesalePrice.textContent = `${priceConfig.currencySymbol}${priceConfig.price}`;
      
      addBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        topsellerPopup.style.display = 'none';
        const variantId = topProductExtractVariantIdFromGid(topProductPopupState.topProductData.productVariantId);
        const quantity = parseInt(quantityInput.value, 10);
        await window.topProductEmbedUtils.addTopSellerToCart(variantId, quantity);
        try {
            const newCart = await window.cartService.getCart();
            const cartCount = document.querySelector('.header__cart-count') || document.querySelector('.cart-item-count-bubble');
            if (cartCount) {
                cartCount.textContent = newCart.item_count;
            }
            document.documentElement.dispatchEvent(
              new CustomEvent('cart:refresh', {
                bubbles: true
              })
            );
            setTimeout(async () => {
              await window.bindCartDrawerQuantityButtons();
            })
        } catch (error) {
            console.error('Error updating cart count:', error);
        }
      });
      minusBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
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
        e.stopImmediatePropagation();
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
      */
    }
  }

  // document.addEventListener('DOMContentLoaded', async function () {
  //   if (tspConfig.enableTopProducts === 'true') {
  //     let cartData = await window.cartService.getCart();
  //     const lineItems = cartData.items.map(x => {
  //       return {product_id: x.product_id, variant_id: x.variant_id, quantity: x.quantity}
  //     });
  //     if(lineItems.length === 0) {
  //       const tspElement = window.topSellerPopupService.createTopSellerPopup();
  //       if (window.GlobalVariables.isTopSellerPopupClickDetectorAdded) {
  //         return;
  //       }
  //       window.GlobalVariables.isTopSellerPopupClickDetectorAdded = true;
  //       let addToCartButton = null;
  //       for (const selector of addToCartSelectors) {
  //         addToCartButton = document.querySelector(selector);
  //         if (addToCartButton) {
  //           break;
  //         }
  //       }
  //       if (addToCartButton) {
  //         addToCartButton.addEventListener('click', async function () {
  //           const volumeConfig = productPageState.productVolumePricing.volumeConfig;
  //           if (productPageState.original.productOriginalQuantityInput.value < volumeConfig.minimum){
  //             productPageState.original.productOriginalQuantityInput.value = productPageState.new.productQuantityInput.value;
  //           } 
  //           displayTopSellerPopup(tspElement);
  //         });
  //       } 
  //     }
  //   }
  // })
})();