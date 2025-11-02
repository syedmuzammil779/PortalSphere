let tpScript = document.currentScript || (function () {
  let tpScripts = document.getElementsByTagName('script');
  return tpScripts[tpScripts.length - 1];
})();

let tpUrl = new URL(tpScript.src);
let tpParams = new URLSearchParams(tpUrl.search);

// Extract the parameters
const tpConfig = {
  apiKey: tpParams.get("api_key"),
  appDomain: tpParams.get("appDomain"),
  customerId: tpParams.get("customerId"),
  shopId: tpParams.get("shopId"),
  shopDomain: tpParams.get("shopDomain"),
  storeType: tpParams.get("storeType"),
  timestamp: tpParams.get("timestamp"),
  hmac: tpParams.get("hmac"),
  productVariantId: tpParams.get("productVariantId"),
  productId: tpParams.get("productId"),
  enableTopProducts: tpParams.get("enableTopProducts"),
  authSignature: tpParams.get("authSignature")
};

(function() {
    // State management
  let topProductState = {
    priceElement: document.getElementById('top-product-price'),
    quantityInput: document.getElementById('top-quantity-input'),
    minusButton: document.getElementById('top-quantity-minus'),
    plusButton: document.getElementById('top-quantity-plus'),
    quantityInputGroup: document.querySelector('#top-product-embed quantity-input.quantity'),
    eventListenerFlags: {},
    customerId: tpConfig.customerId,
    productId: tpConfig.productId,
    variantId: tpConfig.productVariantId,
    shop: tpConfig.shopDomain,
    topProductVolumePricing: null,
    topProduct: null,
    addToCartTopProduct: document.getElementById('add-top-product'),
    topProductEmbed: document.getElementById('top-product-embed'),
    cartLineItems: null,
    cartItemsVariants: []
  };

  window.topProductState = topProductState

  let topProductPopupState = {
    topProductData: null,
    topProductVolumePricing: null,
    customerId: tpConfig.customerId,
    shop: tpConfig.shopDomain,
  }

  window.topProductEmbedSettings = {
    shop: tpConfig.shopDomain,
    customerId: tpConfig.customerId,
    appDomain: tpConfig.appDomain,
    apiKey: tpConfig.apiKey,
    timestamp: tpConfig.timestamp,
    hmac: tpConfig.authSignature
  };

  if (tpConfig.enableTopProducts === 'true') {
    checkCartDrawerAndToggle();
    
    const cartDrawer = document.querySelector('cart-drawer');
    if (cartDrawer) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            checkCartDrawerAndToggle();
          }
        });
      });

      observer.observe(cartDrawer, { attributes: true });
    }

    setInterval(checkCartDrawerAndToggle, 1000);
  }
})();

function createTopSellerElement() {
  const topSellerDiv = document.createElement('div');
  topSellerDiv.id = 'top-product-embed';
  topSellerDiv.style.display = 'none';
  topSellerDiv.innerHTML = window.generateTopSellerBlock();
  return topSellerDiv;
}

function showTopProductPopup(productInfo) {
  // Redirect to the product page with the specific variant
  const variantId = topProductExtractVariantIdFromGid(topProductState.variantId);
  const productUrl = `${productInfo.url}?variant=${variantId}`;
  window.location.href = productUrl;
}

async function addTopSellerToCart(variantId, quantity) {
  try {
    // Fetch current cart
    const cart = await window.cartService.getCart();
    
    // Check if item already exists in cart
    const existingItem = cart.items.find(item => item.variant_id === parseInt(variantId));
    
    if (existingItem) {
      // Update existing line item
      const lineItemId = existingItem.key;
      const existingUpsellQuantity = existingItem.properties?._upsellQuantity || 0;
      const existingIsUpsellOrigin = existingItem.properties?._isUpsellOrigin || null;
      
      await window.cartService.updateProductToCart(lineItemId, existingItem.quantity + quantity, {
        "_isUpsellOrigin": existingIsUpsellOrigin,
        "_upsellQuantity": parseInt(existingUpsellQuantity) + quantity
      });
    } else {
      // Add new item
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

function insertTopSeller(cartDrawer) {
  if (cartDrawer && !cartDrawer.querySelector('#top-product-embed')) {
    const drawerInner = cartDrawer.querySelector('.drawer__inner');
    if (drawerInner) {
      const topSellerDiv = createTopSellerElement();
      
      const drawerFooter = drawerInner.querySelector('.drawer__scrollable');
      if (drawerFooter) {
        drawerFooter.appendChild(topSellerDiv);
      }

      topProductState.priceElement = document.getElementById('top-product-price');
      topProductState.quantityInput = document.getElementById('top-quantity-input');
      topProductState.minusButton = document.getElementById('top-quantity-minus');
      topProductState.plusButton = document.getElementById('top-quantity-plus');
      topProductState.quantityInputGroup = document.querySelector('#top-product-embed quantity-input.quantity');
      topProductState.addToCartTopProduct = document.getElementById('add-top-product');
      topProductState.topProductEmbed = document.getElementById('top-product-embed');
      const topsellerTitle = document.getElementById('top-seller-title');
      
      fetchTopSeller();

      topsellerTitle.innerHTML = 'Don\'t miss out on a customer favorite!';

      // Top Product Quantity Input
      if (!topProductState.eventListenerFlags.quantityInput) {
        // Add event listener for quantity input
        topProductState.quantityInput.addEventListener('input', function() {
        let currentValue = parseInt(topProductState.quantityInput.value, 10);
        let minQuantity = topProductState.topProductVolumePricing.volumeConfig.minimum || 1; // Default to 1 if not specified
        let maxQuantity = topProductState.topProductVolumePricing.volumeConfig.maximum || Number.MAX_SAFE_INTEGER; // Default to Infinity if not specified

        if (currentValue < minQuantity) {
          topProductState.quantityInput.value = minQuantity;
        } else if (currentValue > maxQuantity) {
          topProductState.quantityInput.value = maxQuantity;
        }

        // Ensure quantity is within min and max limits
        let updatedValue = Math.max(minQuantity, Math.min(maxQuantity, parseInt(topProductState.quantityInput.value, 10)));
        topProductState.quantityInput.value = updatedValue.toString();
            updateTopProductPrice();
        });
        topProductState.eventListenerFlags.quantityInput = true;
      }
      // Add event listeners for minus and plus buttons
      topProductState.minusButton.addEventListener('click', function() {
        let currentValue = parseInt(topProductState.quantityInput.value, 10) - 1;
        let increment = topProductState.topProductVolumePricing.volumeConfig.increment || 1;
        let minQuantity = topProductState.topProductVolumePricing.volumeConfig.minimum || 1; // Default to 1 if not specified

        if (currentValue > minQuantity) {
          // Decrement to the nearest number divisible by increment
          let newValue = Math.floor(currentValue / increment) * increment;
          topProductState.quantityInput.value = Math.max(minQuantity, newValue).toString();
        } else if (currentValue < minQuantity) {
          topProductState.quantityInput.value = minQuantity;
        } else {
          topProductState.quantityInput.value = 1;          
        }
        updateTopProductPrice();
      });
      topProductState.eventListenerFlags.minusButton = true;
      
      topProductState.plusButton.addEventListener('click', function() {
          const config = topProductState.topProductVolumePricing?.volumeConfig;
          if (!config) return;

          let currentValue = parseInt(topProductState.quantityInput.value, 10);
          let increment = topProductState.topProductVolumePricing.volumeConfig.increment || 1;
          let maxQuantity = topProductState.topProductVolumePricing.volumeConfig.maximum || Number.MAX_SAFE_INTEGER; // Default to Infinity if not specified

          // Calculate the next value that is higher and divisible by the increment
          let nextValue = currentValue;
          if (increment > 1) {
            nextValue = Math.ceil((currentValue + 1) / increment) * increment;
          } else {
            nextValue = parseInt(currentValue) + parseInt(increment);
          }
          
          topProductState.quantityInput.value = Math.min(maxQuantity, nextValue).toString();
          updateTopProductPrice();
      });
      topProductState.eventListenerFlags.plusButton = true;
      
      topProductState.addToCartTopProduct.onclick = async (e) => {
        e.preventDefault();
        e.target.innerHTML = 'Adding...';
        setTimeout(async () => {
          const variantGid = topProductState.variantId;
          const variantId = topProductExtractVariantIdFromGid(variantGid);
          const quantity = parseInt(topProductState.quantityInput.value, 10);
          await addTopSellerToCart(variantId, quantity);
          document.querySelector('cart-drawer .drawer__close').click();
          await CartDrawer.onCartRefreshListener({detail: {open: true}});
        }, 1000);
      };
      
      topProductState.eventListenerFlags.addToCart = true;
      topProductState.eventListenerFlags.learnMore = true;

      // Add close button event listener
      const closeButton = document.getElementById('close-top-seller');
      if (closeButton) {
        closeButton.addEventListener('click', removeTopSeller);
      }
    }
  }
}

    function removeTopSeller() {
      const topSellerElement = document.querySelector('#top-product-embed');
      if (topSellerElement) {
        topSellerElement.remove();
      }
    }

    function enableCartButtons(cartDrawer) {
      const quantityButtons = cartDrawer.querySelectorAll('.quantity__buttons');
      const savingsBadges = cartDrawer.querySelectorAll('.savings-badge');
      quantityButtons.forEach(button => {
        button.disabled = false;
        button.style.display = 'block';
      });
      savingsBadges.forEach(badge => {
        badge.disabled = false;
        badge.style.cursor = 'pointer';
      });
    }

    function disableCartButtons(cartDrawer) {
      const quantityButtons = cartDrawer.querySelectorAll('.quantity__buttons');
      const savingsBadges = cartDrawer.querySelectorAll('.savings-badge');

      if(quantityButtons.length > 0) {
        quantityButtons.forEach(button => {
          button.disabled = true;
          button.style.display = 'none';
        });
      }
      
      if(savingsBadges.length > 0) {
        savingsBadges.forEach(badge => {
          badge.disabled = true;
          badge.style.cursor = 'not-allowed';
        });
      }
    }

    function checkCartDrawerAndToggle() {
      const cartDrawer = document.querySelector('cart-drawer');
      const cartDrawerItems = document.querySelectorAll('cart-items ul li');
      if (cartDrawer && cartDrawerItems.length > 0) {
        const topSellerBlock = document.getElementById('top-product-embed');
        if (!topSellerBlock && tpConfig.enableTopProducts === 'true') {
          insertTopSeller(cartDrawer);
        }
        const savingsbadge = document.querySelectorAll('.savings-badge');
        if (savingsbadge.length === 0) {
          updateCartItemsUpsell();
        }
      } else {
        removeTopSeller();
      }
    }

    async function fetchTopProductVolumePricing() {
      return fetch(`https://${tpConfig.appDomain}/api/volume-pricing?shop=${topProductState.shop}&api_key=${tpConfig.apiKey}&timestamp=${tpConfig.timestamp}&hmac=${tpConfig.hmac}&customer=${topProductState.customerId}&productVariantId=${topProductState.variantId}`)
        .then(response => {
          return response.json();
        })
        .then(data => {
          topProductState.topProductVolumePricing = data;
          topProductState.quantityInput.value = data.volumeConfig.minimum;

          return data;
        })
        .catch(error => {
          console.error('Error fetching volume pricing:', error);
          throw error;
        });
    }

    async function fetchTopSeller() {
      var customerId = tpConfig.customerId;
      var shop = tpConfig.shopDomain;
      var cart = await window.cartService.getCart();

      if (!customerId || tpConfig.enableTopProducts !== 'true') {
        return;
      }

      const lineItems = cart.items.map(x => { 
        return {product_id: x.product_id, variant_id: x.variant_id}
      });

      topProductState.cartLineItems = lineItems;

      if (lineItems.length === 0) {
        topProductState.topProductEmbed.style.display = 'none';
        return;
      }

      try {
        const response = await fetch(`https://${tpConfig.appDomain}/api/top-products?shop=${shop}&customer=${customerId}&api_key=${tpConfig.apiKey}&timestamp=${tpConfig.timestamp}&hmac=${tpConfig.hmac}`, {
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
        topProductState.variantId = data.productVariantId;
        topProductState.topProduct = data;
        const pricing = await fetchTopProductVolumePricing();
        const quantityInput = document.getElementById('top-quantity-input');
        updateTopSellerUI(data, pricing);
      } catch (error) {
        console.error('Error:', error);
      }
    }

    function updateTopProductPrice() {
      let quantity = parseInt(topProductState.quantityInput.value, 10);

      const priceInfo = topProductState.topProductVolumePricing.priceConfig.find(p => quantity >= p.quantity && quantity <= p.maxQuantity);
      if (priceInfo) {
        // Assuming priceInfo.originalPrice is available and contains the original price
        topProductState.priceElement.innerHTML = window.generateTopProductPriceElement(priceInfo);
      } else {
        topProductState.priceElement.textContent = 'Price not available';
      }
    }

    function updateTopSellerUI(data, pricing) {
      const topprodembed = document.getElementById('top-product-embed');
      if (topprodembed) {
        topprodembed.style.display = 'block';
        var img = document.getElementById('top-product-image');
        const productUrl = `${data.productInfo.url}?variant=${topProductExtractVariantIdFromGid(data.productVariantId)}`;
        
        // Create wrapper link for image
        const imagecontainer = document.getElementById('top-product-image-container');
        imagecontainer.href = productUrl;
        imagecontainer.style.cursor = 'pointer';     
        img.src = data.productInfo.image;
        document.getElementById('animated-placeholder').style.display = 'none';
        
        img.onload = function() {
          img.style.opacity = '1';
        };
        img.onerror = function() {
          console.error('Failed to load image:', data.productInfo.image);
        };

        // Create title with link
        const titleText = data.productInfo.title + ' ' + (data.productInfo.variantTitle && data.productInfo.variantTitle.toLowerCase() === 'default title' ? '' : data.productInfo.variantTitle);
        document.getElementById('top-product-title').innerHTML = `
          <a href="${productUrl}" style="text-decoration: none; color: inherit; cursor: pointer;">
            ${titleText}
          </a>
        `;
        
        updateTopProductPrice();  
      }    
    }

    async function addTopSellerToCart(variantId, quantity) {
      try {
        // Fetch current cart
        const cart = await window.cartService.getCart();
        
        // Check if item already exists in cart
        const existingItem = cart.items.find(item => item.variant_id === parseInt(variantId));
        
        if (existingItem) {
          // Update existing line item
          const lineItemId = existingItem.key;
          const existingUpsellQuantity = existingItem.properties?._upsellQuantity || 0;
          const existingIsUpsellOrigin = existingItem.properties?._isUpsellOrigin || null;
          
          await window.cartService.updateProductToCart(lineItemId, existingItem.quantity + quantity, {
            "_isUpsellOrigin": existingIsUpsellOrigin,
            "_upsellQuantity": parseInt(existingUpsellQuantity) + quantity
          });
        } else {
          // Add new item
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

async function updateCartItemsUpsell() {
  const cartDrawer = document.querySelector('cart-drawer');
  const cartItemsTable = document.querySelector('cart-items');
  const rows = cartItemsTable.querySelectorAll('ul.horizontal-products > li')
  topProductState.cartItemsVariants = Array.from(rows).map(row => {
    const href = row.querySelector('a.horizontal-product__title')?.href;
    if (!href) return null;
    return href.split('variant=')[1];
  }).filter(id => id);

  // get quantity controls
  const quantityInputs = document.querySelectorAll('quantity-input');
  topProductState.cartQuantityInputs = Array.from(quantityInputs).map(container => {
    return container.querySelector('input[name="updates[]"]');
  }).filter(input => input);

  const cartData = await window.cartService.getCart();

  for (let i = 0; i < topProductState.cartItemsVariants.length; i++) {
    const input = topProductState.cartQuantityInputs[i];
    const variantId = topProductState.cartItemsVariants[i];
    const data = await window.productPricingService.getVolumePricingByProductVariantId(tpConfig.appDomain, topProductState.shop, tpConfig.apiKey, tpConfig.timestamp, tpConfig.hmac, topProductState.customerId, variantId);          
    let dataConfig = data;
    const discountType = data.type;
    
    // Function to set input constraints
    const setInputConstraints = (input, config) => {
      input.readOnly = true;
      input.min = config.volumeConfig.minimum;
      input.max = config.volumeConfig.maximum;
      input.step = config.volumeConfig.increment;
      input.setAttribute('max', config.volumeConfig.maximum);
      input.setAttribute('step', config.volumeConfig.increment.toString());
    };

    // Set initial constraints
    setInputConstraints(input, dataConfig);

    input.parentElement.querySelectorAll('button').forEach(el => {
      el.onclick = (e) => {
        setTimeout(() => {
          window.reloadPageWithCartOpen('openCart', 'true');
        }, 1200);
      }
    })

    // Add input event listener
    input.addEventListener('change', async () => {
      // Get and disable all quantity buttons and savings badges
      disableCartButtons(cartDrawer);

      try {
        // Get the corresponding line item
        const data2 = await window.productPricingService.getVolumePricingByProductVariantId(tpConfig.appDomain, topProductState.shop, tpConfig.apiKey, tpConfig.timestamp, tpConfig.hmac, topProductState.customerId, variantId);
        const updatedConfig = data2;
        setInputConstraints(input, updatedConfig);

        // Wait for 3 seconds before checking the cart
        setTimeout( async () => {
          const newcartData = await window.cartService.getCart();
          const cartLineItem = newcartData.items[i];  
          if (cartLineItem.properties._isUpsellOrigin) {
            const properties = {
              ...cartLineItem.properties,
              '_upsellQuantity': cartLineItem.quantity
            };
            await addTopSellerToCart(variantId, cartLineItem.quantity, properties);
          }
        }, 1000);
      } catch (error) {
        console.error('Error processing cart update:', error);
      } finally {
        enableCartButtons(cartDrawer);
      }            
    });

    // Replace the empty appendChild() with button creation
    const existingSavings = document.getElementById(`savings-badge-${variantId}`);
    if (!existingSavings) {
      const savingsButton = document.createElement('button');
      savingsButton.id = `savings-badge-${variantId}`;
      savingsButton.className = 'savings-badge';
      const currentQty = parseInt(input.value) || 0;
      const nextTier = dataConfig.priceConfig.find(tier => tier.quantity > currentQty) || dataConfig.priceConfig[0];
      const diff = nextTier.quantity - currentQty;
      if (!nextTier || diff <= 0) continue;
      if (discountType === 'fixedAmount') {
        savingsButton.innerHTML = `Add ${diff} more, save ${fixDecimals(nextTier.discountAmount)}`;
      } else {
        savingsButton.innerHTML = `Add ${diff} more, save ${nextTier.percentage}%`;
      }
      savingsButton.style.cssText = savingsButtonCssText();
      savingsButton.onclick = async (e) => {
        e.preventDefault();
        disableCartButtons(cartDrawer);
        savingsButton.innerHTML = 'Adding...';
        savingsButton.disabled = true;
        savingsButton.style.cursor = 'not-allowed';
        const newVariantId = topProductExtractVariantIdFromGid(variantId);
        const properties = cartData.items[i].properties || {};
        await addTopSellerToCart(newVariantId, diff, properties);
          
        setTimeout(async () => {
          savingsButton.disabled = false;
          savingsButton.style.cursor = 'pointer';
          document.querySelector('#CartDrawer button.drawer__close').click();
          window.reloadPageWithCartOpen('openCart', 'true');
        }, 500);
      };
      const container = input.parentElement.parentElement.parentElement.parentElement.parentElement.querySelector('.horizontal-product__details');
      container.appendChild(savingsButton);  
    }
  }
}