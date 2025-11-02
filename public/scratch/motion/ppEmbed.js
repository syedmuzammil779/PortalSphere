const currentScript = document.currentScript || (function () {
  const scripts = document.getElementsByTagName('script');
  return scripts[scripts.length - 1];
})();

const $ = window.jQuery
const url = new URL(currentScript.src);
const params = new URLSearchParams(url.search);

// Extract the parameters
const config = {
  apiKey: params.get("api_key"),
  appDomain: params.get("appDomain"),
  customerId: params.get("customerId"),
  shopId: params.get("shopId"),
  shopDomain: params.get("shopDomain"),
  storeType: params.get("storeType"),
  timestamp: params.get("timestamp"),
  hmac: params.get("hmac"),
  productVariantId: params.get("productVariantId"),
  productId: params.get("productId"),
  enableTopProducts: params.get("enableTopProducts")
};


let quantitySelector = "div.product__quantity input[name='quantity']"
let priceSelector = "div.product-block.product-block--price span.product__price"


var Shopify = Shopify || {};
Shopify.theme = Shopify.theme || {};

$(document).ready(async function () {

  if (!config.customerId) {
    return
  }

  // INFO: Cart update embed
  const target = document.getElementById('CartDrawer');

  // INFO: Add a spinner style to the dom
  const style = document.createElement('style');
  style.innerHTML = `
@keyframes cart-btn-loading-spinner {
  to { transform: rotate(360deg); }
  }
`;
  document.head.appendChild(style);

  const rows = $('#CartDrawer div.cart__items div.cart__item')
  if (rows.length > 0) {
    addTopupButtons(rows)
  }

  if (target) {
    const observer = new MutationObserver(function (mutationList) {
      mutationList.forEach((mut) => {
        if (mut.target.hasAttribute("data-subtotal")) {
          // INFO: Update here
          const rows = $('#CartDrawer div.cart__items div.cart__item')
          if (rows.length > 0) {
            addTopupButtons(rows)
          }
        }
      })
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  }

  let min, max, step
  let priceCfg
  let handleArray

  if (!window.location.pathname.includes('products')) {
    handleArray = fetchItemNames('a.grid-product__link')
    if (!handleArray) {
      return
    }
    await populateHomePagePrices(handleArray)
  }
  else {
    setTimeout(async () => {
      handleArray = fetchItemNames('a.grid-product__link')
      if (!handleArray) {
        return
      }
      await populateHomePagePrices(handleArray)
    }, 500)

  }

  try {
    const productPricing = await getProductPricing()
    const { volumeConfig, priceConfig } = productPricing;
    priceCfg = priceConfig
    window.productPageState.productVolumePricing = {
      volumeConfig: volumeConfig
    }

    // if we didnt get a volume config
    if (volumeConfig === undefined || volumeConfig === null) {
      min = 1, max = Number.MAX_SAFE_INTEGER, step = 1
    }
    else {
      const { minimum, maximum, increment } = volumeConfig;
      min = isNull(minimum) ? 1 : minimum
      max = isNull(maximum) ? Number.MAX_SAFE_INTEGER : maximum
      step = isNull(increment) ? 1 : increment
    }
  }
  catch (error) {
    // INFO: if we get an error at this point we need to return
    console.error(error)
    return
  }

  // INFO: element definitions
  const quantity = $(quantitySelector).first()
  const priceEl = $(priceSelector).first()

  // INFO: pricing code
  $(quantitySelector).change(() => updatePrice(priceCfg, priceEl, quantity.val()))
  const plusBtn = $("div[data-product-blocks] div.js-qty__wrapper button.js-qty__adjust.js-qty__adjust--plus")
  const minusBtn = $("div[data-product-blocks] div.js-qty__wrapper button.js-qty__adjust.js-qty__adjust--minus")
  const newPlusBtn = stripListeners(plusBtn)
  const newMinusBtn = stripListeners(minusBtn)
  newPlusBtn.click(() => {
    let inc = parseInt($(quantitySelector).attr("step"))
    let val = parseInt($(quantitySelector).val())
    let max = parseInt($(quantitySelector).attr("max"))
    if (inc + val <= max) {
      $(quantitySelector).val(val + inc)

    }
  })
  newMinusBtn.click(() => {
    let inc = parseInt($(quantitySelector).attr("step"))
    let val = parseInt($(quantitySelector).val())
    let min = parseInt($(quantitySelector).attr("min"))
    if (val - inc >= min) {
      $(quantitySelector).val(val - inc)
    }
  })

  //  INFO: Disable edit and set increments
  setInputAttr(quantity, min, max, step)
  updatePrice(priceCfg, priceEl, quantity.val())

  const priceInput = $(".price-per-item__container")
  priceInput.css({
    "flex-direction": "column",
    "align-items": "flex-start"
  })
  const minInc = $("<span style='font-size: 1.2rem'></span>").text(`Min. ${min} • Increments of ${step}`)
  priceInput.append(minInc)

})


/** strip listeners for the el
 *
 * @param {jQuery} - jquery wrapped html element
 *
 */
function stripListeners($el) {
  const newEl = $el[0].cloneNode(true);
  $el[0].parentNode.replaceChild(newEl, $el[0]);
  return $(newEl);
}

/** Sets the attributes for an input
 *
 *
 */
function setInputAttr(quantity, min, max, step) {
  quantity.attr("min", `${min}`)
  quantity.attr("readonly", "")
  quantity.val(`${min}`)
  quantity.attr("max", `${max}`)
  quantity.attr("step", `${step}`)
}

/** Fetches the name of the items that match the selector
 *
 * @param {string} selector - CSS selector for the items
 */
function fetchItemNames(selector) {
  let handleArray = []
  const cardElements = document.querySelectorAll(selector)
  if (!cardElements) {
    return;
  }
  cardElements.forEach(el => {
    if (el.href.includes('/products/')) {
      var href = el.href.split('/products/')[1];
      if (!handleArray.includes(href)) {
        const itemName = href.split("?")[0]
        handleArray.push(itemName);
      }
    }
  });
  return handleArray
}


/** Fetched product pricing by ID
 *
 * @param {string} productId - The id of the product
 *
 * @returns {Object} productData - Product pricing data from API
 */
const getProductPricing = async () => {
  try {
    const response = await fetch(`https://${config.appDomain}/api/volume-pricing?shop=${config.shopDomain}&api_key=${config.apiKey}&timestamp=${config.timestamp}&hmac=${config.hmac}&customer=${config.customerId}&productId=${config.productId}&productVariantId=${config.productVariantId}`);
    return await response.json();
  }
  catch (error) {
    throw error
  }
}

/** Change price state
 *
 * @param {string} priceCfg - The pricing config
 * @param {jQuery} target - jQuery wrapped HTMLElement that is the taget for the changes
 * @param {number} currentQuantity - Current quantity selected
 *
 */
const updatePrice = (priceCfg, target, currentQuantity) => {
  const currentPriceSlab = priceCfg.find(cfg => {
    const min = parseFloat(cfg.quantity);
    const max = parseFloat(cfg.maxQuantity);
    return currentQuantity >= min && currentQuantity <= max;
  })
  const { currencySymbol, price, currencyCode, originalPrice } = currentPriceSlab
  const msrp = `<span style="font-size: 1rem"><s>MSRP ${currencySymbol}${originalPrice} ${currencyCode}</s></span>`
  target.html(`<b>${currencySymbol}${price} ${currencyCode}</b> ${msrp}`)
}


/** Gets volume pricing data for the defined array of elements
 *
 * @param {Array<string>} handleArr - the names of all the elements that need volume pricing fetched
 *
 * @returns {Object} volumePricingData
 */
async function getProductVolumePricingByHandleArr(handleArr) {
  const customerId = config.customerId;
  const shop = config.shopDomain;

  return await window.productPricingService.getVolumePricingBulkByHandleArray(
    config.appDomain,
    shop,
    config.apiKey,
    config.timestamp,
    config.hmac,
    customerId,
    handleArr
  );
}

/** Populates prices on the home page adhering to volume pricing
 *
 */
async function populateHomePagePrices(handleArray, containerSelector) {
  if (handleArray.length < 1) {
    return;
  }

  console.log('handleArray', handleArray);

  const priceArray = document.querySelectorAll('div[data-product-handle] div.grid-product__price');
  priceArray.forEach((el) => {
    el.innerHTML = 'Loading...'
  })

  // some presets
  $('div.price--on-sale .price__sale').first().css("display", "none")
  $('div.price--on-sale .price__regular').first().css("display", "block")
  $('div.price--on-sale .price-item.price-item--regular').css({
    "text-decoration": "none",
    "font-size": "1.6rem",
    "color": "#000"
  })

  const response = await getProductVolumePricingByHandleArr(handleArray);
  if (response != null && response.hasOwnProperty('count')) {
    if (response.count > 0) {
      for (var i in response.data) {
        const { returnData, productVariantHandle } = response.data[i];
        const { priceConfig } = returnData

        const priceContainer = $(`div.grid-product__content:has(a[href*="/products/${productVariantHandle}"])`)
        if (priceConfig.length > 1) {
          const { price: highestPrice, currencySymbol, currencyCode } = priceConfig[0];
          const { price: lowestPrice } = priceConfig[priceConfig.length - 1];

          const content = `
              <b>From ${currencySymbol}${lowestPrice} - ${currencySymbol}${highestPrice} ${currencyCode}</b>
          `
          priceContainer.find('.grid-product__price').html(content)
        }
        else if (priceConfig.length == 1) {

          const { price, originalPrice, currencySymbol, currencyCode } = priceConfig[0];
          const content = `<b>${currencySymbol}${price} ${currencyCode}</b> <s style="font-size: 0.8rem">MSRP ${currencySymbol}${originalPrice} ${currencyCode}</s>`
          priceContainer.find('.grid-product__price').html(content)
        }
      }
    }
  }
}

/** This function is responsible for adding buttons that encourage
 * the user to add more to their cart
 *
 * @param {Array<jQuery>} rowData - An array of jQuery wrapped html elements
 */
async function addTopupButtons(rowData) {
  const spinner = createSpinner()
  rowData.map(function () {
    let addButton
    const container = $(this).find('div.cart__item--details');
    const foundButton = container.find('button[type="button"].to-next-interval')
    const plusBtn = container.find("button.js-qty__adjust.js-qty__adjust--plus")
    const minusBtn = container.find("button.js-qty__adjust.js-qty__adjust--minus")

    const newPlusBtn = stripListeners(plusBtn)
    const newMinusBtn = stripListeners(minusBtn)


    if (foundButton.length < 1) {
      addButton = $('<button type="button" class="to-next-interval"></button>').css({
        "background-color": "black",
        "width": "142px",
        "color": "white",
        "padding": "10px 5px",
        "border": "none"
      }).click(() => {
        newPlusBtn.trigger("click")
      })
      container.append(addButton)
    }
    else {
      addButton = foundButton.first()
    }
    const spinEl = addButton.find("svg")
    if (spinEl.length == 0) {
      addButton.html(spinner)
    }
    addButton.prop("disabled", true)
  });

  let volData

  try {
    volData = await getVolumePricingData(rowData)
  }
  catch (error) {
    console.log(error)
    return
  }

  volData.map((data) => {
    const { productVariantHandle, returnData } = data
    const { volumeConfig } = returnData
    const { minimum, maximum, increment } = volumeConfig
    const plusBtn = $(`div.cart__item:has(a[href^='/products/${productVariantHandle}']) button.js-qty__adjust.js-qty__adjust--plus`)
    const minusBtn = $(`div.cart__item:has(a[href^='/products/${productVariantHandle}']) button.js-qty__adjust.js-qty__adjust--minus`)
    const input = $(`div.cart__item:has(a[href^='/products/${productVariantHandle}']) input`)
    const pricingInfo = $(`div.cart__item:has(a[href^='/products/${productVariantHandle}']) div.cart__item--price.cart__item-price-col.text-right`)

    plusBtn.click(() => {
      const val = parseInt(input.val())
      const variantId = input.attr("data-id").split(":")[0]
      if (increment + val <= maximum) {
        pricingInfo.html(createSpinner("black"))
        window.cartService.updateProductToCart(variantId, val + increment)
      }
    })
    minusBtn.click(() => {
      pricingInfo.html(createSpinner("black"))
      const val = parseInt(input.val())
      const variantId = input.attr("data-id").split(":")[0]
      window.cartService.updateProductToCart(variantId, val - increment)
    })
  })

  const intervalInfo = calculateIntervalData(volData)

  intervalInfo.map(({ name, amountToAdd, benefit, benefitType, currencySymbol }) => {
    let button = $(`div.cart__items div.cart__item:has(a[href^="/products/${name}"]) button.to-next-interval`)
    if (!name || !amountToAdd || !benefit || !benefitType || !currencySymbol) {
      button.remove()
    }
    else {
      let amountOff
      if (benefitType === "percentage") {
        amountOff = `${benefit}%`
      }
      else {
        amountOff = `${currencySymbol}${benefit}`
      }
      button.html(`Add ${amountToAdd}, Get ${amountOff} extra off`)
      button.prop("disabled", false)
    }
  })
}


/** Fetching items from row data
 *
 * @param {Array<jQuery>} rowData - An array of jQuery wrapped html elements
 *
 * @return {Array<string>} - items - An array of items names
 */
function getItemsFromRowData(rowData) {
  const hrefs = rowData.map(function () {
    return $(this).find('a').first().attr('href');
  }).get();
  if (hrefs.length == 0) {
    return
  }

  const items = hrefs.map(item => {
    const segments = item.split('?')[0].split('/');
    return segments.pop()
  })
  return items
}


/** Gets the volume price data for the items in the cart
 *
 * @param {Array<jQuery>} rowData - A list of jQuery wrapped html elements
 *
 * @returns volumeData - volume pricing data for the cart items
 */
async function getVolumePricingData(rowData) {
  const items = getItemsFromRowData(rowData)
  if (items.length == 0) {
    return
  }

  if (window.localStorage) {
    const volumeData = window.localStorage.getItem("volumeData")
    if (volumeData) {
      const jsonData = JSON.parse(volumeData)
      let cacheValid = true
      for (const item of items) {
        const found = jsonData.some(obj => obj.productVariantHandle === item);
        if (!found) {
          cacheValid = false
          break
        }
      }
      if (cacheValid) {
        return jsonData
      }
    }
  }

  let data
  try {
    data = await getProductVolumePricingByHandleArr(items);
  }
  catch (error) {
    console.log(error)
    throw error
  }
  const itemData = data.data
  if (window.localStorage){
    window.localStorage.setItem("volumeData", JSON.stringify(itemData))
  }
  return itemData
}


/** Calculates the amount required to hit the next interval and the
 *  % reduction in price at the next interval
 *
 * @param {Object} volumeData - Volume pricing data for the objects in cart
 *
 * @returns {Array<Object>} priceIntervalInfo - The price intervals for the items in the cart
 */
function calculateIntervalData(volumeData) {
  let priceIntervalInfo = []
  volumeData.map((item) => {
    const { productVariantHandle, returnData } = item
    const { priceConfig, volumeConfig } = returnData
    const row = $(`div.cart__item:has(a[href^="/products/${productVariantHandle}"])`).first()
    const quantityInput = row.find('input')
    const quantity = quantityInput.val()
    if (!quantity) {
      return
    }

    quantityInput.attr("max", volumeConfig.maximum)
    quantityInput.attr("step", volumeConfig.increment)
    quantityInput.attr("min", volumeConfig.minimum)
    quantityInput.prop("disabled", true)


    // INFO: Find the current interval
    const intervals = findIntervalAndNext(quantity, priceConfig)

    const { current, next } = intervals
    if (!current || !next) {
      return priceIntervalInfo.push({
        "name": productVariantHandle,
        "amountToAdd": null,
        "benefit": null,
        "currencySymbol": null,
        "benefitType": null,
      })
    }
    const quantityToAdd = parseInt(next.quantity) - parseInt(quantity)

    let benefit
    if (returnData.type === "fixedAmount"){
      benefit = parseInt(current.percentage) - parseInt(next.percentage)
    }
    else {
      benefit = parseInt(next.percentage) - parseInt(current.percentage)
    }

    priceIntervalInfo.push({
      "name": productVariantHandle,
      "currencySymbol": returnData.priceConfig[0].currencySymbol,
      "amountToAdd": quantityToAdd,
      "benefitType": returnData.type === "fixedAmount" ? "fixedAmount" : "percentage",
      "benefit": benefit
    })
  })
  return priceIntervalInfo
}

/** Finds the current quantity interval and the next interval
 *
 * @param {string} currentQuantity - The current quantity of the item in the cart
 * @param {Array<Object>} intervalData - The data of the price and quantity intervals
 *
 * @returns {Object} intervals - An object with the key current, displaying the current interval
 * and next, displaying the next interval
 */
function findIntervalAndNext(currentQuantity, intervalData) {
  const numX = parseInt(currentQuantity);

  for (let i = 0; i < intervalData.length; i++) {
    const min = parseInt(intervalData[i].quantity);
    const max = parseInt(intervalData[i].maxQuantity);


    if (numX >= min && numX <= max) {
      const current = intervalData[i];
      const next = intervalData[i + 1] || null;
      return { current, next };
    }
  }

  return { current: null, next: null };
}

/** Generates html for a loading spinner
 *
 *
 */
function createSpinner(color="white") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-circle-icon lucide-loader-circle" style="color:${color}; animation: cart-btn-loading-spinner 1s linear infinite; display: inline-block; margin-top: 3px;">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>`
}

function isNull(item) {
  if (
    item === null ||
    item === "null" ||
    item === undefined ||
    item === "undefined"
  ) return true

  // in the case that it is defined
  return false
}
