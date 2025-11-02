import React, { useState } from "react";

interface Props {
  formData: FormData;
  updateFormData: (field: keyof FormData, value: any) => void;
}

interface FormData {
  netTermsEnabled: boolean;
}

function BuyerGroupNetTerms({ formData, updateFormData }: Props) {
  const [showNetTermsModal, setShowNetTermsModal] = useState(false);

  const handleNetTermsEnabled = () => {
    updateFormData("netTermsEnabled", true);
    setShowNetTermsModal(true);
  };

  const closeModal = () => {
    setShowNetTermsModal(false);
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[25%,1fr,1fr] gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Net Terms
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              You have the option to enable "Net Terms" as a payment option for
              buyers in this group. By doing so, buyers will be able to checkout
              without providing payment and you can invoice them later.
            </p>
            <p className="text-sm text-blue-600">
              Learn how to{" "}
              <a href="#" className="underline">
                manage orders placed on net terms
              </a>
              .
            </p>
          </div>
        </div>
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6">
              Net Terms at Checkout
            </h3>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  id="disabled"
                  name="netTerms"
                  value="disabled"
                  checked={!formData.netTermsEnabled}
                  onChange={() => updateFormData("netTermsEnabled", false)}
                  className="mt-1"
                />
                <div>
                  <label
                    htmlFor="disabled"
                    className="block text-sm font-medium text-gray-900"
                  >
                    Disabled
                  </label>
                  <p className="text-sm text-gray-600">
                    No net terms. Buyers must pay with a card at checkout.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  id="enabled"
                  name="netTerms"
                  value="enabled"
                  checked={formData.netTermsEnabled}
                  onChange={handleNetTermsEnabled}
                  className="mt-1"
                />
                <div className="flex-1">
                  <label
                    htmlFor="enabled"
                    className="block text-sm font-medium text-gray-900"
                  >
                    Enabled
                  </label>
                  <p className="text-sm text-gray-600 mb-4">
                    Buyers can choose net terms as a payment option at checkout,
                    allowing them to place orders without submitting payment
                    upfront.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Net Terms Setup Modal */}
      {showNetTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={closeModal}
          ></div>
          
          {/* Modal */}
          <div className="relative bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            {/* Close button */}
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold"
            >
              ×
            </button>
            
            {/* Alert Box */}
            <div className="bg-[#FFF5EB] border border-[#8B601C] rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="text-[#8B601C] text-xl">⚠️</div>
                <div className="text-[#8B601C] text-sm">
                  If you haven't already created Net Terms as a manual payment option in Shopify Admin, please watch this step-by-step guide
                </div>
              </div>
            </div>
            
            {/* Video */}
            <div className="mb-4">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Net Terms Setup Guide</h3>
              <div 
                id='floik-iframe-container-meltbjcf'
                style={{
                  overflow: 'hidden',
                  borderRadius: '16px',
                  position: 'relative',
                  width: '100%',
                  maxHeight: '100%',
                  aspectRatio: '1.7777777777777777'
                }}
              >
                <iframe 
                  id='floik-iframe-meltbjcf'
                  frameBorder='0'
                  allowFullScreen={true}
                  style={{
                    width: '100%', 
                    height: '100%', 
                    border: 'none', 
                    position: 'absolute', 
                    top: 0, 
                    left: 0
                  }}
                  width='1920px'
                  height='1080px'
                  src='https://www.floik.com/embed/f5085237-905a-461b-b209-c8c7d86b5e2f/7bf09cb6-f4c6-4c96-8995-d58d0d775d67-flo.html'
                  allow="clipboard-read; clipboard-write"
                ></iframe>
              </div>
            </div>
            
            {/* Action buttons */}
            <div className="flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default BuyerGroupNetTerms;
