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
  'form[action*="/cart/add"] button[type="submit"]',
];

(function() {
  let storeType = tspConfig.storeType;
  let customerId = tspConfig.customerId;
  let isB2B = storeType === 'B2B' ? true : false;
  let isHybrid = (storeType === 'Hybrid' || !storeType) ? true : false;
  let isCustomerLoggedIn = (customerId !== null) ? true : false;
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
    cartItemsVariants: []
  };
  let topProductPopupState = {
    topProductData: null,
    topProductVolumePricing: null,
    customerId: tspConfig.customerId,
    shop: tspConfig.shopDomain,
  }
  async function fetchTopProductVolumePricing() {
    const data = await window.productPricingService.getVolumePricingByProductVariantId(tspConfig.appDomain, topProductState.shop, tspConfig.apiKey, tspConfig.timestamp, tspConfig.hmac, topProductState.customerId, topProductState.variantId);
    return data;
  }
  async function fetchTopProductPopupVolumePricing(variantId) {
    const data = await window.productPricingService.getVolumePricingByProductVariantId(tspConfig.appDomain, topProductState.shop, tspConfig.apiKey, tspConfig.timestamp, tspConfig.hmac, topProductState.customerId, variantId);
    return data;
  }
  async function getCustomerTag() {
    const tag = await window.customerService.getCustomerTag(tspConfig.appDomain, tspConfig.shopDomain, tspConfig.apiKey, tspConfig.timestamp, tspConfig.hmac, tspConfig.customerId);
    return typeof(tag) == 'string' ? tag : null;
  }
  function showTopProductPopup(productInfo) {
    const variantId = topProductExtractVariantIdFromGid(topProductState.variantId);
    const productUrl = `${productInfo.url}?variant=${variantId}`;
    window.location.href = productUrl;
  }
  function closeTopProductPopup() {
    const popup = document.getElementById('top-product-popup');
    popup.style.right = '-100%';
    setTimeout(() => {
        popup.style.display = 'none';
    }, 300);
    document.body.style.overflow = ''; // Restore background scrolling
  }
  async function addTopSellerToCart(variantId, quantity) {
    try {
      const cart = await window.cartService.getCart();     
      const existingItem = cart.items.find(item => item.variant_id === parseInt(variantId));
      if (existingItem) {
        const lineItemId = existingItem.key;
        const existingUpsellQuantity = existingItem.properties?._upsellQuantity || 0;
        const existingIsUpsellOrigin = existingItem.properties?._isUpsellOrigin || null;
        
        await window.cartService.updateProductToCart(lineItemId, existingItem.quantity + quantity, {
          "_isUpsellOrigin": existingIsUpsellOrigin,
          "_upsellQuantity": parseInt(existingUpsellQuantity) + quantity
        });
      } else {
        await window.cartService.addProductToCart(variantId, quantity, {
          "_isUpsellOrigin": true,
          "_upsellQuantity": quantity
        });
      }     
    } catch (error) {
      console.error('Error adding/updating complementary product in cart:', error);
      showComplementaryToast('Failed to add complementary product to cart. Please try again.', 'error');
    }
  }

  if(!window.displayTopSellerPopup) {
    window.displayTopSellerPopup = async function () {
      const topsellerPopup = document.getElementById('top-seller-popup');
      topsellerPopup.style.display = 'flex';
      topsellerPopup.scrollTo(0, 0);
      document.body.style.overflow = 'auto'; 
      setTimeout(() => {
          topsellerPopup.style.right = '0';
      }, 10);
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
      }
      else {
        headerText.innerHTML = 'Top Seller!';
        sellingPoint.innerHTML = 'This one\'s selling fast. Don\'t miss out on a customer favorite.';
      }
      const cartData = await window.cartService.getCart();
      const lineItems = cartData.items.map(x => { 
        return {product_id: x.product_id, variant_id: x.variant_id, quantity: x.quantity}
      });
      try {
        const response = await fetch(`https://${tspConfig.appDomain}/api/top-products?shop=${shop}&customer=${customerId}&api_key=${tspConfig.apiKey}&timestamp=${tspConfig.timestamp}&hmac=${tspConfig.hmac}`, {
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
        const volData = await fetchTopProductPopupVolumePricing(data.productVariantId);
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
        try {
          const newCart = await window.cartService.getCart();
          const cartCount = document.querySelector('.header__cart-count') || document.querySelector('.cart-item-count-bubble');
          if (cartCount) {
            cartCount.textContent = newCart.item_count;
          }
          setTimeout(async () => {
            await CartDrawer.onCartRefreshListener({detail: {open: true}});
          }, 100);
        } catch (error) {
          console.error('Error updating cart count:', error);
        }
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
        console.debug('minusBtn clicked', currentValue);
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
        console.debug('plusBtn clicked', currentValue);
        return;
      });
    }
  }
})();