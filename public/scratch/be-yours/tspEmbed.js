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

$(document).ready(async function () {
  const popup = await createPopup()
  if (tspConfig.enableTopProducts === 'true') {
    window.topSellerPopupService.createTopSellerPopup();
    console.log("Top seller popup service created")
    if (window.GlobalVariables.isTopSellerPopupClickDetectorAdded) {
      return
    }

    window.GlobalVariables.isTopSellerPopupClickDetectorAdded = true
    $(".product-form__submit").first().click(async function () {
        let cartData = await window.cartService.getCart();
        const lineItems = cartData.items.map(x => {
          return { product_id: x.product_id, variant_id: x.variant_id, quantity: x.quantity }
        });
        console.log("lineItems", lineItems.length);
        if (lineItems.length === 0) {
          popup.css("display", "flex")
        }
      });
  } else {
    console.warn('No Add to Cart button found for Top Seller Pop Up.');
  }
})

/** Creates, and returns a popup object. Also appends it to the body so it is ready to show.
 *
 * @returns {jQuery} popupObject - jQuery wrapped HTML Element for popup
 *
 */
async function createPopup() {
  try {
    const [data, volData] = await getTopSeller()
    if (!data || !volData) {
      return
    }


    // INFO: Prepare popup and pre-append html
    const popupHTML = await genPopupHTML(data, volData)
    const popupObject = wrapPopup(popupHTML)
    $("body").append(popupObject)

    const minusBtn = $("#cp-ts-minus")
    const plusBtn = $("#cp-ts-plus")
    const addBtn = $("#cp-ts-add-to-cart")


    injectListeners(minusBtn, plusBtn, addBtn, volData, popupObject)

    // INFO: Stop loading spinner, and disable minusBtn by default
    $('#cp-ts-loading-spinner').css("display", "none")
    minusBtn.attr("disabled", "true")

    return popupObject
  }
  catch (error) {
    console.error(error)
    return null
  }
}

/** Generates the inner html for the popup
 *
 * @param {Object} data - Product data
 * @param {Object} volumeData - Product pricing and volume data
 *
 *
 * @returns {string} html
 */
async function genPopupHTML(data, volumeData) {
  // INFO: Extract data
  const { productInfo, productVariantId } = data
  const variantSplit = productVariantId.split("/")
  const variantId = variantSplit[variantSplit.length - 1]
  const { volumeConfig, priceConfig } = volumeData

  // INFO: Set variables for conditional rendering
  const customerTag = await getCustomerTag();
  let isB2B = tspConfig.storeType === 'B2B' ? true : false;

  // INFO: Set initial variables
  let headerText, sellingPoint, quantityInfoText

  // INFO: Set text based on conditions
  if (headerText && isB2B && customerTag) {
    headerText = 'Top-seller with companies like yours!'
    sellingPoint = 'This product is flying off the shelves for businesses just like yours. Don\'t miss out on a customer favorite!';
  }
  else {
    headerText = 'Top Seller!'
    sellingPoint = 'This one\'s selling fast. Don\'t miss out on a customer favorite.'
  }


  quantityInfoText = `Min. ${volumeConfig.minimum} • Increments of ${volumeConfig.increment}`

  // INFO: Create the HTML based on the supplied inputs
  return `
        <div class="topseller-popup-content">
          <div style="padding: 20px; height: 100%; display: flex; flex-direction: column;">
            <button id="close-top-seller-popup" style="background: none; border: none; font-size: 32px; cursor: pointer; position: absolute; top: 10px; right: 15px; color: #333; z-index: 10;" aria-label="Close">&times;</button>

            <div style="flex-grow: 1; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none;">
              <h2 id="cp-ts-header-text" style="font-weight: bold; margin-bottom: 10px;">${headerText}</h2>
              <p id="cp-ts-selling-point" style="color: black; margin-bottom: 20px;">${sellingPoint}</p>

              <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: center; align-items: center; margin-bottom: 20px;">
                  <span id="cp-ts-loading-spinner" class="loading-spinner"></span>
                  <img style="display: block; max-width: 100%; height: auto;" id="cp-ts-product-image" src="${productInfo.image}">
                </div>

                <a href="/${productInfo}?variant?=${data.variantId}" id="cp-ts-product-title" style="display: block; font-weight: bold; margin-bottom: 10px; color: #000; text-decoration: none;">${productInfo.title}</a>

                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                  <p id="cp-ts-product-wholesale-price" style="font-size: 1.2em; font-weight: bold; margin: 0;">${priceConfig[0].currencySymbol}${priceConfig[0].price}</p>
                  <p id="cp-ts-product-original-price" style="font-size: 0.8em; color: #666; margin: 0;">MSRP ${priceConfig[0].currencySymbol}${priceConfig[0].originalPrice}</p>
                </div>

                <div class="tooltip">
                  <p id="cp-ts-product-description" style="color: #000; margin-bottom: 20px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; line-height: 1.4;">${productInfo.description}</p>
                  <span id="cp-ts-product-description-tooltip" class="tooltiptext">${productInfo.description}</span>
                </div>
              </div>
            </div>

            <div style="padding: 20px; border-top: 1px solid #eee; background: white;">
              <div style="display: flex; align-items: center; margin-bottom: 15px;">
                <div style="display: flex; align-items: center; border: 1px solid #dcdcdc; margin-right: 10px;">
                  <button id="cp-ts-minus" style="width: 40px; height: 40px; background: none; border: none; font-size: 16px; cursor: pointer;">−</button>
                  <input id="cp-ts-quantity-input" style="width: 40px; height: 40px; border: none; border-left: 1px solid #dcdcdc; border-right: 1px solid #dcdcdc; font-size: 16px; text-align: center;" value="${volumeConfig.minimum}" readonly variant-id="${variantId}">
                  <button id="cp-ts-plus" style="width: 40px; height: 40px; background: none; border: none; font-size: 16px; cursor: pointer;">+</button>
                </div>
                <p id="cp-ts-quantity-info" style="font-size: 14px; color: #666; margin: 0;">${quantityInfoText}</p>
              </div>

              <button id="cp-ts-add-to-cart" style="background-color: #000; color: white; border: none; padding: 15px; width: 100%; font-size: 16px; cursor: pointer; margin-bottom: 10px;">Add</button>
              <button id="close-top-seller-nothanks" style="background: none; border: none; color: #666; cursor: pointer; width: 100%;">No thank you</button>
            </div>
          </div>
        </div>
      `;
}


/** Injects the listeners into the html that was generated for the popup
 *
 * @param {jQuery} minusBtn - jQuery wrapped HTML Element for the subtract quantity button
 * @param {jQuery} plusBtn - jQuery wrapped HTML Element for the add quantity button
 * @param {jQuery} addBtn - jQuery wrapped HTML Element for the add to cart button
 * @param {Object} volumeData - Volume and pricing data for product
 * @param {jQuery} popupHolder - jQuery wrapped HTML Element for the popupHolder
 *
 */
async function injectListeners(minusBtn, plusBtn, addBtn, volumeData, popupHolder) {
  const { priceConfig, volumeConfig } = volumeData

  addBtn.click(async () => {
    addBtn.prop("disabled", true)
    addBtn.html(createSpinner())
    const quantity = $('#cp-ts-quantity-input').val()
    const variantId = $('#cp-ts-quantity-input').attr("variant-id")
    const success = await addTSToCart(variantId, quantity)
    if (success) {
      popupHolder.css("display", "none")

      const [data, volData] = await getTopSeller()
      if (!data || !volData) {
        return
      }
      embedTopProduct(data, volData)

      unlockScroll();
    }
  });
  minusBtn.click(() => subQuantityListener(volumeConfig, priceConfig));
  plusBtn.click(() => addQuantityListener(volumeConfig, priceConfig));

  $('#close-top-seller-popup').click(async () => {
    popupHolder.css("display", "none")

    const [data, volData] = await getTopSeller()
    if (!data || !volData) {
      return
    }
    embedTopProduct(data, volData)

    unlockScroll();
  });
  $('#close-top-seller-nothanks').click(async () => {
    popupHolder.css("display", "none")

    const [data, volData] = await getTopSeller()
    if (!data || !volData) {
      return
    }
    embedTopProduct(data, volData)

    unlockScroll();
  });

  $("#close-popup-click-away").click(async () => {
    popupHolder.css("display", "none")

    const [data, volData] = await getTopSeller()
    if (!data || !volData) {
      return
    }
    embedTopProduct(data, volData)

    unlockScroll();
  })
}


// INFO: Helpers

/** Wrap raw popup html in jQuery object
 *
 * @param {string} innerHTML - The innerHTML of the popup
 *
 * @returns {jQuery} object - Popup jQuery object
 */
function wrapPopup(innerHTML) {
  const popupHolder = $('<div data-div-name="popup-container"></div>').css({
    "position": "fixed",
    "background-color": "#00000080",
    "display": "none",
    "height": "100vh",
    "width": "100vw",
    "z-index": "1000000",
    "top": "0"
  })

  const popupClickAway = $('<div id="close-popup-click-away"></div>').css({
    "display": "block",
    "flex": "1",
    "min-height": "100%",
  })

  const popupDiv = $('<div id="top-seller-popup" class="popup"></div>').css({
    "display": "flex",
    "justify-content": "center",
    "align-items": "center",
    "right": "0",
    "left": "auto",
    "height": "100%",
    "width": "40rem",
    "background": "#fff",
    "padding": "20px",
    "flex-direction": "column",
    "align-items": "flex-start"
  })

  popupDiv.html(innerHTML);

  popupHolder.append(popupClickAway)
  popupHolder.append(popupDiv)

  return popupHolder
}


/** Gets Customer tag
 */
async function getCustomerTag() {
  let data
  try {
    const response = await fetch(`https://${tspConfig.appDomain}/api/customer-tag?shop=${tspConfig.shopDomain}&api_key=${tspConfig.apiKey}&timestamp=${tspConfig.timestamp}&hmac=${tspConfig.hmac}&customer=${tspConfig.customerId}`);
    data = await response.json();
  }
  catch (error) {
    throw error
  }
  return data
}


/** Fetches product volume pricing based on variant
 *
 * @param {string} variantId - The ID of the variant
 *
 * @returns {Object} data - The response from the server
 */
async function fetchTopProductPopupVolumePricing(productVariantId) {
  let data
  try {
    const response = await fetch(`https://${tspConfig.appDomain}/api/volume-pricing?shop=${tspConfig.shopDomain}&api_key=${tspConfig.apiKey}&timestamp=${tspConfig.timestamp}&hmac=${tspConfig.hmac}&customer=${tspConfig.customerId}&productVariantId=${productVariantId}`);
    data = await response.json();
  }
  catch (error) {
    throw error
  }
  return data;
}

async function addToCartListener() {
  const variantId = topProductExtractVariantIdFromGid(topProductPopupState.topProductData.productVariantId);
  const quantity = parseInt(quantityInput.value, 10);
  await window.topProductEmbedUtils.addTopSellerToCart(variantId, quantity);
  try {
    const newCart = await window.cartService.getCart();
    const cartCount = $('.header__cart-count') || $('.cart-item-count-bubble');
    if (cartCount) {
      cartCount.textContent = newCart.item_count;
    }
    $("html").trigger(
      new CustomEvent('cart:refresh', {
        bubbles: true
      })
    );
  } catch (error) {
    console.error('Error updating cart count:', error);
  }
}

/** Event listener for the subtract quantity function in the popup
 *
 * @param {Object} volumeConfig - Volume config for the item
 * @param {Object} priceConfig  - Price config for the item
 *
 */
function subQuantityListener(volumeConfig, priceConfig) {
  let { increment, minimum, maximum } = volumeConfig
  increment = parseInt(increment)
  minimum = parseInt(minimum)
  maximum = parseInt(maximum)
  const quantityInput = $("#cp-ts-quantity-input")
  let currentValue = parseInt(quantityInput.val())
  currentValue -= increment;
  if ((currentValue - increment) < minimum || currentValue < 1) {
    $("#cp-ts-minus").prop("disabled", true)
  }
  if ((currentValue + increment) < maximum) {
    $("#cp-ts-plus").prop("disabled", false)
  }
  const currentPriceConfig = priceConfig.find(p => currentValue >= parseInt(p.quantity) && currentValue <= parseInt(p.maxQuantity));
  if (currentPriceConfig) {
    $("#cp-ts-product-original-price").text(`MSRP ${currentPriceConfig.currencySymbol}${currentPriceConfig.originalPrice}`);
    $("#cp-ts-product-wholesale-price").text(`${currentPriceConfig.currencySymbol}${currentPriceConfig.price}`);
  }
  quantityInput.val(currentValue);
  console.debug('minusBtn clicked', currentValue);
  return;
}

/** Event listener for the add quantity function in the popup
 *
 * @param {Object} volumeConfig - Volume config for the item
 * @param {Object} priceConfig  - Price config for the item
 *
 */
function addQuantityListener(volumeConfig, priceConfig) {
  let { increment, minimum, maximum } = volumeConfig
  increment = parseInt(increment)
  minimum = parseInt(minimum)
  maximum = parseInt(maximum)
  const quantityInput = $("#cp-ts-quantity-input")
  let currentValue = parseInt(quantityInput.val())
  currentValue += increment;
  if ((currentValue - increment) >= minimum) {
    $("#cp-ts-minus").prop("disabled", false)
  }
  if ((currentValue + increment) > maximum) {
    $("#cp-ts-plus").prop("disabled", true)
  }
  const currentPriceConfig = priceConfig.find(p => currentValue >= parseInt(p.quantity) && currentValue <= parseInt(p.maxQuantity));
  if (currentPriceConfig) {
    $("#cp-ts-product-original-price").text(`MSRP ${currentPriceConfig.currencySymbol}${currentPriceConfig.originalPrice}`);
    $("#cp-ts-product-wholesale-price").text(`${currentPriceConfig.currencySymbol}${currentPriceConfig.price}`);
  }
  quantityInput.val(currentValue);
  console.debug('plusBtn clicked', currentValue);
  return;
}

/** Function for fetching the data of the Top selling product
 *
 *  @returns {Object} data - Product data
 *  @returns {Object} volData - Product volume and pricing data
 *
 */
async function getTopSeller() {
  const cartData = await window.cartService.getCart();
  const lineItems = cartData.items.map(x => {
    return { product_id: x.product_id, variant_id: x.variant_id, quantity: x.quantity }
  });
  let data, volData
  try {
    const response = await fetch(`https://${tspConfig.appDomain}/api/top-products?shop=${tspConfig.shopDomain}&customer=${tspConfig.customerId}&api_key=${tspConfig.apiKey}&timestamp=${tspConfig.timestamp}&hmac=${tspConfig.hmac}`, {
      method: 'POST',
      headers: {
      },
      body: JSON.stringify({ lineItems }),
    });
    data = await response.json();
    if (data.error) {
      console.error(data.error);
      return [null, null];
    }
    else if (!data.id) {
      return [null, null]
    }
    const splitVariantId = data.productVariantId.split("/")
    const variantID = splitVariantId[splitVariantId.length - 1]
    volData = await fetchTopProductPopupVolumePricing(variantID);
    return [data, volData]
  } catch (error) {
    console.error('Error:', error);
    throw error
  }
}
window.getTopSeller = getTopSeller

/** Adds the top seller to cart
 *
 * @param {number} quantity - amount of the item that needs to be added
 * @param {string} variantId - ID of the product being added
 */
async function addTSToCart(variantId, quantity) {
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
  return true
}
