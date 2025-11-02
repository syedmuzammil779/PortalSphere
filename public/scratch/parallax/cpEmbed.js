let cpCurrentScript = document.currentScript || (function () {
    let cpScripts = document.getElementsByTagName('script');
    return cpScripts[cpScripts.length - 1];
})();

let cpUrl = new URL(cpCurrentScript.src);
let cpParams = new URLSearchParams(cpUrl.search);

// Extract the parameters
const cpConfig = {
    apiKey: cpParams.get("api_key"),
    appDomain: cpParams.get("appDomain"),
    customerId: cpParams.get("customerId"),
    shopId: cpParams.get("shopId"),
    shopDomain: cpParams.get("shopDomain"),
    storeType: cpParams.get("storeType"),
    timestamp: cpParams.get("timestamp"),
    hmac: cpParams.get("hmac"),
    productVariantId: cpParams.get("productVariantId"),
    productId: cpParams.get("productId")
};

console.log('cpConfig loaded', cpConfig);

setTimeout(() => {
  $(document).ready(async function() {
    const res = await window.complementaryProductService.getComplementaryProductWithConfig(
      cpConfig.appDomain,
      cpConfig.shopDomain,
      cpConfig.apiKey,
      cpConfig.timestamp,
      cpConfig.hmac,
      cpConfig.productId,
      cpConfig.productVariantId,
      cpConfig.storeType
    )

    if (!res || res.complementaryProductInfo.title === "") {
      return
    }

    const complementaryBlock = $("div.shopify-block.shopify-app-block[data-block-handle='complementary-products-block']").first()
    const innerHtml = generateCpHTML(res)

    complementaryBlock.html(innerHtml)

    // add quantity stuff to it
    insertQuantitySelector(res)

    const addBtn = complementaryBlock.find("button[add-cp-to-cart][type='button']")
    const quantityInput = complementaryBlock.find("input")
    addBtn.click(async () => {
      window.triggerTsp()
      const variantId = quantityInput.attr("data-quantity-variant-id")
      const quantity = quantityInput.val()
      const spinner = createSpinner()
      addBtn.html(spinner)
      try {
        const res = await window.topProductEmbedUtils.addTopSellerToCart(variantId, quantity)
        console.log(res)
        complementaryBlock.remove()
      } catch (error) {
        addBtn.html("Add to cart")
      }
    })

  })
}, 500);

function generateCpHTML(complementaryProduct) {
  let min = 1, step = 1, max = Number.MAX_SAFE_INTEGER
  const { complementaryProductInfo } = complementaryProduct
  const { productTitle, productId, image, previewUrl } = complementaryProductInfo

  let price = complementaryProductInfo.price

  const { volumePricingData } = complementaryProductInfo
  if (volumePricingData) {
    const { volumeConfig, priceConfig } = volumePricingData
    min = volumeConfig.minimum
    max = volumeConfig.maximum
    step = volumeConfig.increment
    price = `${priceConfig[0].currencySymbol}${priceConfig[0].price} ${priceConfig[0].currencyCode}`
  }


  return `
    <div style="display: flex; flex-direction: column; gap: 15px; border: 1px solid lightgray; border-radius: 5px; padding: 20px;">
      <!-- Header -->
      <div>
        <h2 style="margin:0px"><b>Increase your Sales With This Complementary Product</b></h2>
      </div>
      <!-- Content -->
      <div style="display: flex; flex-direction: column; gap: 8px;" class="cp-content">
        <span style="color: gray; line-height: 1.4;">End customers often also buy this complementary product!</span>
        <div style="display: flex; gap: 3px;">
          <a href="${previewUrl}">
          <img style="height: 100px" src="${image}">
          </a>
          <div style="display: flex; flex-direction: column; gap:2px;">
            <a href="${previewUrl}" style="text-decoration: none;">
              <h3 style="margin: 0px;"><b>${productTitle}</b></h3>
            </a>
            <span class="cp-embed-price"><b>${price}</b></span>
          </div>
        </div>
        <span style="font-size: 1.2rem; color: light-gray">Quantity</span>
      </div>
      <!-- Footer -->
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <span style="color: light-gray; font-size:1.2rem">Min. ${min} • Increments of ${step}</span>
        <button style="background-color: black; border: none; color: white; padding: 15px 0; cursor: pointer;" type="button" add-cp-to-cart>
          Add to cart
        </button>
      </div>
    </div>
  `
}

function insertQuantitySelector(complementaryProduct) {
    let min = 1, step = 1, max = Number.MAX_SAFE_INTEGER
    const { complementaryProductInfo, complementaryProductVariantId } = complementaryProduct

    const { volumePricingData } = complementaryProductInfo
    if (volumePricingData) {
      const { volumeConfig, priceConfig } = volumePricingData
      min = volumeConfig.minimum
      max = volumeConfig.maximum
      step = volumeConfig.increment
    }

    let quantitySelector = createQuantitySelector({
      borderColor: "black",
      minusColor: "gray",
      plusColor: "black",
      quantityColor: "black"
    })

    $('div.cp-content').append(quantitySelector)
    quantitySelector = $('div.cp-content').find('div[data-attr="quantity-input"]')
    quantitySelectorBtnEvts('div.cp-content div[data-attr="quantity-input"]', "black")

    const productIdDataSplit = complementaryProductVariantId.split("/")
    const productIdData = productIdDataSplit[productIdDataSplit.length - 1]

    const input = quantitySelector.find('input')
    input.attr("min", min)
    input.attr("value", min)
    input.attr("step", step)
    input.attr("max", max)
    input.attr("data-quantity-variant-id", productIdData)

    quantitySelector.find('button').click((evt) => {
      currentQuantity = input.val()

      if (!volumePricingData) return

      const { volumeConfig, priceConfig } = volumePricingData
      const { match } = getMatchingConfig(currentQuantity, priceConfig)
      if (!match) return

      $('span.cp-embed-price').html(`<b>${match.currencySymbol}${match.price} ${match.currencyCode}</b>`)

    })
}

function getMatchingConfig(x, priceConfig) {
  const currentQuantity = Number(x);

  for (let i = 0; i < priceConfig.length; i++) {
    const current = priceConfig[i];
    const min = Number(current.quantity);
    const max = Number(current.maxQuantity);

    if (currentQuantity >= min && currentQuantity <= max) {
      return { match: current };
    }
  }

  return { match: null };
}
