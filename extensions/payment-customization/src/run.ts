import type {
  RunInput,
  FunctionRunResult,
} from "../generated/api";

const OPERATIONS_ARR: FunctionRunResult = {
  operations: [],
};

type Configuration = {};

export function run(input: RunInput): FunctionRunResult {
  //We've kept the logic like this.
  //If the customer's logged in and is assigned to a customer group, and that customer group that Net Terms enabled 
  //We show Net Terms only then. Otherwise hide it, for all stores for everyone.

  var showNetTerms:Boolean = false;
  var customerTags:any = input.cart.buyerIdentity?.customer?.metafield?.value || null;
  var paymentMethods = input.paymentMethods;
  if(customerTags != null && customerTags.length > 0) {
    customerTags = customerTags?.split(',');
    let paymentMethodOptions = JSON.parse(input.shop?.metafield?.value || '');
    if(paymentMethodOptions != null && paymentMethodOptions.length > 0) {
      for(var i in paymentMethodOptions) {
        if(paymentMethodOptions[i].hasOwnProperty('tag')) {
          if(customerTags.includes(paymentMethodOptions[i].tag)) {
            //Found the payment method option, now check for Net Terms
            const options = paymentMethodOptions[i].selectedPayments;
            if(options.includes('NetTerms')) {
              showNetTerms = true; break;
            }
          }
        }
      }
    }
  }

  //If after doing all above, showNetTerms variable is still false,
  //Now check for input methods and which ever one is in the array, hide it
  var hiddenMethodNames = ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net15', 'Net30', 'Net45', 'Net60', 'Net Terms'];
  if(!showNetTerms) {
    if(paymentMethods != null && paymentMethods.length > 0) {
      for(var j in paymentMethods) {
        if(hiddenMethodNames.includes(paymentMethods[j].name)) {
          OPERATIONS_ARR.operations.push({
            hide: {
              paymentMethodId: paymentMethods[j].id
            }
          });
        }
      }
    } 
  }

  return OPERATIONS_ARR;
};