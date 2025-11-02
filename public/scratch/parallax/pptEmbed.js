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

setTimeout(() => {
  (function ($) {
    $(document).ready(async function () {
      // aliases
      let getVolPriceByProductVariantId = window.productPricingService.getVolumePricingByProductVariantId

      // INFO: custom add to cart
      const addToCartBtn = $('div.atc-btn-container button')
      addToCartBtn.on('click', async function (e) {
        e.stopImmediatePropagation();
        e.preventDefault();
        window.triggerTsp()
        const quantity = $('div[data-attr="quantity-selector-div"] input').val()
        const variantId = $('div[data-attr="quantity-selector-div"] input').attr("variant-id")
        let previousState
        try {
          previousState = addToCartBtn.html()
          addToCartBtn.html(createSpinner())
          await window.cartService.addProductToCart(variantId, quantity)
          addToCartBtn.html(previousState)
        }
        catch(error) {
          console.error(error)
          addToCartBtn.html(previousState)
        }
      });

      let customerId = pptConfig.customerId;
      let shop = pptConfig.shopDomain;
      let productVariantId = pptConfig.productVariantId;

      let volumePricingContainer = $('#volume-pricing-container');
      let volumePricingTable = $('#volume-pricing-table');
      let loadingSpinner = $('#loading-spinner');

      toggleState([loadingSpinner], [volumePricingTable])

      try {
        let volumePricingData = await getVolPriceByProductVariantId(
          pptConfig.appDomain,
          shop,
          pptConfig.apiKey,
          pptConfig.timestamp,
          pptConfig.hmac,
          customerId,
          productVariantId
        )

        // if any of these are null, remove the spinner and return
        if (
          isNull(volumePricingData) ||
          isNull(volumePricingData.volumeConfig) ||
          isNull(volumePricingData.priceConfig) ||
          volumePricingData.priceConfig.length === 0
        ) {
          toggleState([], [loadingSpinner, volumePricingContainer])
          return
        }

        // these are guaranteed to exist at this point
        const volumeConfig = volumePricingData.volumeConfig
        const priceConfig = volumePricingData.priceConfig

        // dont need to show a spinner because we have the data we need
        toggleState([], [loadingSpinner])

        // Show table and populate data
        genPricingTable(volumePricingTable, priceConfig, volumeConfig, volumePricingData)

      } catch (error) {
        console.error('Error updating product prices:', error)
        // remove the spinner and table because something went wrong
        toggleState([], [loadingSpinner, volumePricingContainer])
      }
    })


    /** Takes 2 arrays, one consistenting of elements that are meant to
     * have their visibility toggled on, and one consisting of elements
     * that are mean to have their visibility toggled off
     *
     * @param {jQuery[]} show - An array of jQuery wrapped HTML elements to show.
     * @param {jQuery[]} hide - An array of jQuery wrapped HTML elements to hide.
     */
    function toggleState(show, hide) {
      show.forEach(el => el.css("display", "block"))
      hide.forEach(el => el.css("display", "none"))
    }

    window.toggleState = toggleState

    /** For a supplied var, conducts various tests to check for null values
     * returns True if null
     *
     * @param {jQuery[]} item - Any variable that is nullable
     * @returns boolean
     */
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

    window.isNull = isNull

    /** Generate a Pricing Table for Products
     *
     * @param {jQuery} tableEl - A jQuery wrapped HTMLElement
     * @param {unknown} priceCfg - Pricing Config
     * @param {unknown} volumeCfg - Volume Config
     * @param {unknown} volumePricingData - Volume Pricing Data
     */
    function genPricingTable(tableEl, priceCfg, volumeCfg, volumePricingData) {
      tableEl.css("display", "table")
      const body = $('<tbody></tbody>')
      const tdCss = {
        "border": "1px solid #ddd",
        "padding": "8px",
        "textAlign": "center"
      }

      priceCfg.forEach(config => {
        // create the rows and cells
        const row = $('<tr></tr>')
        const quantityCell = $('<td></td>').text(`${config.quantity === 0 ? volumeCfg.minimum : config.quantity}+`).css(tdCss);
        const priceCell = $('<td></td>').text(`${config.currencySymbol}${fixDecimals(config.price)}`).css(tdCss)
        const discountCell = $('<td></td>').css(tdCss)

        // Insert discount based on the vol price data type
        if (volumePricingData.type === 'fixedAmount') {
          const discountAmount = `${config.discountAmount}`;
          discountCell.text(`${config.currencySymbol}${fixDecimals(discountAmount)}`);
        }
        else {
          const discountPercentage = `${config.percentage}`;
          discountCell.text(`${discountPercentage}%`);
        }

        row.append(quantityCell, priceCell, discountCell)
        body.append(row)
        tableEl.append(body)
      })
    }

    $("div.swatch.is-flex.is-flex-wrap div.swatch-element.available").click(() => {
      setTimeout(() => {
        window.location.reload()
      }, 600);
    })
  })(window.jQuery)
}, 500)


