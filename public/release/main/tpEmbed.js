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
    /*
    setInterval(() => {
        try {
            //hideTopSellerButtonsIfBroken();
        } catch (e) {
            console.error('Top seller button check failed:', e);
        }
    }, 1000);
    */
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

async function addTopSellerToCart(variantId, quantity, options = { additive: true, properties: {} }) {
  
  try {
    const cart = await window.cartService.getCart();
    const existingItem = cart.items.find(item => item.variant_id === parseInt(variantId));
    
    const isAdditive = options.additive ?? true;
    const itemProps = options.properties ?? {};

    if (existingItem) {
      const currentQty = existingItem.quantity;
      const newQty = isAdditive ? currentQty + quantity : quantity;

      await window.cartService.updateProductToCart(existingItem.key, newQty, {
        ...itemProps,
        _isUpsellOrigin: true,
        _upsellQuantity: newQty
      });
    } else {
      await window.cartService.addProductToCart(variantId, quantity, {
        ...itemProps,
        _isUpsellOrigin: true,
        _upsellQuantity: quantity
      });
    }

    // ✅ Force open + visible cart drawer
    const drawer = document.querySelector('cart-drawer, .cart-drawer, .drawer');
    if (drawer) {
      drawer.classList.remove('is-empty');
      drawer.classList.add('is-visible');
      drawer.setAttribute('aria-hidden', 'false');
      if (typeof drawer.open === 'function') {
        drawer.open();
      }
    }

    // ✅ Refresh cart bubble and drawer quantity button listeners
    if (typeof updateCartBubbleFromCartJS === 'function') {
      await updateCartBubbleFromCartJS();
    }

    if (typeof bindCartDrawerQuantityButtons === 'function') {
      bindCartDrawerQuantityButtons();
    }

    if (typeof updateCartItemsUpsell === 'function') {
      updateCartItemsUpsell();
    }

    if (typeof updateTopProductPrice === 'function') {
      updateTopProductPrice();
    }

  } catch (error) {
    console.error('Error adding/updating complementary product in cart:', error);
    showComplementaryToast('Failed to add complementary product to cart. Please try again.', 'error');
  }
}




function insertTopSeller() {
  const cartDrawer = document.querySelector('cart-drawer');
  if (cartDrawer && !cartDrawer.querySelector('#top-product-embed')) {
      const drawerInner = cartDrawer.querySelector('.cart-drawer__main');
      if (drawerInner) {
          const topSellerDiv = createTopSellerElement();
          
          const drawerFooter = drawerInner.querySelector('.drawer__footer');
          if (drawerFooter) {
              drawerInner.insertBefore(topSellerDiv, drawerFooter);
          } else {
              drawerInner.appendChild(topSellerDiv);
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
              let increment = topProductState.topProductVolumePricing.volumeConfig.increment || 1;
              let minQuantity = topProductState.topProductVolumePricing.volumeConfig.minimum || 1; // Default to 1 if not specified
              let maxQuantity = topProductState.topProductVolumePricing.volumeConfig.maximum || Number.MAX_SAFE_INTEGER; // Default to Infinity if not specified

              if (currentValue < minQuantity) {
                  topProductState.quantityInput.value = minQuantity;
              }
              else if (currentValue > maxQuantity) {
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
            const variantGid = topProductState.variantId;
            const variantId = topProductExtractVariantIdFromGid(variantGid);
            const quantity = parseInt(topProductState.quantityInput.value, 10);
            const el = e.currentTarget; // assuming inside an event handler
            el.textContent = 'Adding...';
            console.debug('Add to cart clicked. Variant GID:', variantGid, 'Extracted Variant ID:', variantId, 'Quantity:', quantity);
          
            try {
              await addTopSellerToCart(variantId, quantity);
          
              if (typeof window.reloadCartDrawer === 'function') {
                await window.reloadCartDrawer();  // ✅ Refreshes the cart drawer visually
              }

              const newCart = await window.cartService.getCart();
              
              // Optionally close the popup
              const popup = document.getElementById('top-seller-popup');
              if (popup) popup.style.display = 'none';
            } catch (err) {
              console.error('Error adding top seller product:', err);
            }
            el.textContent = 'Added';
            document.getElementById('top-product-embed').remove();
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

  function enableCartButtons() {
    const quantityButtons = document.querySelectorAll('.quantity__button');
    const savingsBadges = document.querySelectorAll('.savings-badge');
    quantityButtons.forEach(button => {
      button.disabled = false;
      button.style.cursor = 'pointer';
    });
    savingsBadges.forEach(badge => {
      badge.disabled = false;
      badge.style.cursor = 'pointer';
    });
  }

  function disableCartButtons() {
    const quantityButtons = document.querySelectorAll('.quantity__button');
    const savingsBadges = document.querySelectorAll('.savings-badge');
    quantityButtons.forEach(button => {
      button.disabled = true;
      button.style.cursor = 'not-allowed';
    });
    savingsBadges.forEach(badge => {
      badge.disabled = true;
      badge.style.cursor = 'not-allowed';
    });
  }

  function checkCartDrawerAndToggle() {
    const cartDrawer = document.querySelector('cart-drawer');
    if (cartDrawer) {
      const topSellerBlock = document.getElementById('top-product-embed');
      if (!topSellerBlock && tpConfig.enableTopProducts === 'true') {
        insertTopSeller();
        const savingsbadge = document.querySelectorAll('.savings-badge');
        if (savingsbadge.length === 0) {
          disableCartButtons();
          updateCartItemsUpsell();
          // workaround
          setTimeout(() => {
            updateCartItemsUpsell();
            enableCartButtons();
          }, 2000);
        }
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

    // ✅ Hide top seller if cart is empty
if (!cart.items || cart.items.length === 0) {
//console.log("Cart is empty — hiding top seller block.");
const embed = document.getElementById('topseller-product-block');
if (embed) {
  embed.style.display = 'none';
  embed.innerHTML = ''; // Optionally clear the DOM content too
}
return;
}


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

  // async function addTopSellerToCart(variantId, quantity) {
  //   try {
  //     // Fetch current cart
  //     const cart = await window.cartService.getCart();
      
  //     // Check if item already exists in cart
  //     const existingItem = cart.items.find(item => item.variant_id === parseInt(variantId));
      
  //     if (existingItem) {
  //       // Update existing line item
  //       const lineItemId = existingItem.key;
  //       const existingUpsellQuantity = existingItem.properties?._upsellQuantity || 0;
  //       const existingIsUpsellOrigin = existingItem.properties?._isUpsellOrigin || null;
        
  //       await window.cartService.updateProductToCart(lineItemId, existingItem.quantity + quantity, {
  //         "_isUpsellOrigin": existingIsUpsellOrigin,
  //         "_upsellQuantity": parseInt(existingUpsellQuantity) + quantity
  //       });
  //     } else {
  //       // Add new item
  //       await window.cartService.addProductToCart(variantId, quantity, {
  //         "_isUpsellOrigin": true,
  //         "_upsellQuantity": quantity
  //       });
  //     }     
  //   } catch (error) {
  //     console.error('Error adding/updating complementary product in cart:', error);
  //     showComplementaryToast('Failed to add complementary product to cart. Please try again.', 'error');
  //   }
  // }

  // Temporary debug function
async function debugCart() {
  const cart = await window.cartService.getCart();
  console.log('[DEBUG] Cart structure:', {
    items: cart.items.map(item => ({
      id: item.id,
      key: item.key,
      variant_id: item.variant_id,
      quantity: item.quantity,
      properties: item.properties
    })),
    item_count: cart.item_count
  });
}


  async function updateCartItemsUpsell() {
    const cartItemsTable = document.querySelectorAll('.cart-items[role="table"]');
    if (!cartItemsTable.length) return;
  
    const rows = cartItemsTable[0].querySelectorAll('tbody > tr');
    topProductState.cartItemsVariants = Array.from(rows).map(row => {
      const href = row.querySelector('td:first-child a')?.href;
      if (!href) return null;
      return href.split('variant=')[1];
    }).filter(id => id);
  
    // Get all quantity input containers
    const quantityInputs = document.querySelectorAll('quantity-input');
    topProductState.cartQuantityInputs = Array.from(quantityInputs).map(container => {
      return container.querySelector('input[name="updates[]"]');
    }).filter(input => input);
  
  // 🔒 DISABLE input interaction if #top-product-embed is missing OR hidden
  const topSellerEmbed = document.getElementById('top-product-embed');
  const isVisible = topSellerEmbed && window.getComputedStyle(topSellerEmbed).display === 'block';
  const configReady = topProductState?.topProductVolumePricing?.volumeConfig;
  const cartData = await window.cartService.getCart();  
  for (let i = 0; i < topProductState.cartItemsVariants.length; i++) {

    const input = topProductState.cartQuantityInputs[i];
    const variantId = topProductState.cartItemsVariants[i];
    if (!input) continue;

    // 🔍 Fetch volume pricing config
    const data = await window.productPricingService.getVolumePricingByProductVariantId(
      tpConfig.appDomain,
      topProductState.shop,
      tpConfig.apiKey,
      tpConfig.timestamp,
      tpConfig.hmac,
      topProductState.customerId,
      variantId
    );

    const volumeConfig = data;
    const discountType = data.type;

    // ⛓️ Set constraints on input
    input.readOnly = true;
    input.min = volumeConfig.volumeConfig.minimum;
    input.max = volumeConfig.volumeConfig.maximum;
    input.step = volumeConfig.volumeConfig.increment;
    

    // 🎧 Listen for quantity input change
    input.addEventListener('change', async () => {
      disableCartButtons();
      
      
      try {
        const newQty = parseInt(input.value, 10);
        const cartData = await window.cartService.getCart();
        const cartLineItem = cartData.items[i];
        
        if (cartLineItem) {
          console.debug('[Cart] Updating line item:', {
            key: cartLineItem.key,
            variantId: cartLineItem.variant_id,
            currentQty: cartLineItem.quantity,
            newQty: newQty
          });
          
          const properties = {
            ...cartLineItem.properties,
            _isUpsellOrigin: true,
            _upsellQuantity: newQty
          };
          
          // Use the line item key if available, otherwise fall back to index
          const identifier = cartLineItem.key || i;
          // console.log("identifier  =========>", identifier, cartLineItem.variant_id, newQty, properties);
          if(identifier) {
          await window.cartService.updateProductToCart(identifier, newQty, properties);
          }
        }
      } catch (error) {
        console.error('Error processing cart update:', error);
      } finally {
        enableCartButtons();
      }
    });
  
    const existingSavings = document.getElementById(`savings-badge-${variantId}`);
      if (existingSavings) existingSavings.remove();
  
      const savingsButton = document.createElement('button');
      savingsButton.id = `savings-badge-${variantId}`;
      savingsButton.className = 'savings-badge';
  
      const currentQty = parseInt(input.value) || 0;
      const nextTier = volumeConfig.priceConfig.find(tier => tier.quantity > currentQty) || volumeConfig.priceConfig[0];
      if (!nextTier || nextTier.quantity - currentQty <= 0) continue;
  
      const diff = nextTier.quantity - currentQty;
      if (discountType === 'fixedAmount') {
        savingsButton.innerHTML = `Add ${diff} more, save ${fixDecimals(nextTier.discountAmount)}`;
      } else {
        savingsButton.innerHTML = `Add ${diff} more, save ${nextTier.percentage}%`;
      }
  
      savingsButton.style.cssText = savingsButtonCssText();
  
      // 🛒 Attach add-to-cart handler
      // In updateCartItemsUpsell function
      savingsButton.onclick = async (e) => {
        e.preventDefault();
        savingsButton.disabled = true;
        savingsButton.style.cursor = 'not-allowed';
        const newVariantId = topProductExtractVariantIdFromGid(variantId);
        
        // Add null check for properties
        const properties = cartData.items[i]?.properties || {};
        
        await addTopSellerToCart(newVariantId, diff, {
          additive: true,
          properties: properties
        });
        
        savingsButton.disabled = false;
        savingsButton.style.cursor = 'pointer';
      };
  
      // 📌 Place savings button in correct row
      const container = input.parentElement.parentElement.parentElement.parentElement;
      container.appendChild(savingsButton);
    }
  }
  