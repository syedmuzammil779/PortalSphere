import { Page, Card, DataTable, Layout, BlockStack, CalloutCard } from "@shopify/polaris";
import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import moment from "moment";
import React, { useState } from "react";

import PageHeader from "~/components/PageHeader";
import { disableAllFeatures, getActiveSubscription, getShopId, setSubscriptionStatusMetafield } from "~/services/Settings.server";
import prisma from '../db.server';
import { PRICING_TIERS } from '~/lib/pricing';

function getPriceTier(val: string) {
  var returnVal = null;
  for (var i in PRICING_TIERS) {
    if (PRICING_TIERS[i]['tier'] == parseInt(val)) {
      returnVal = PRICING_TIERS[i];
    }
  }
  return returnVal;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shopId = await getShopId(admin);
  const dbShopRecord = await prisma.session.findFirst({
    where: {
      shop: session.shop
    },
    select: {
      id: true,
      shop: true,
      state: true,
      isOnline: true,
      accessToken: true,
      scope: true,
      createdAt: true
    }
  });

  const subscriptionInfo = await prisma.storeSubscriptionInfo.findMany({
    where: {
      shop: session.shop,
    },
    orderBy: {
      id: 'desc'
    }
  });

  var displaySubscriptionInfo = null;
  if (subscriptionInfo != null && subscriptionInfo.length) {
    displaySubscriptionInfo = new Array();
    for (var i in subscriptionInfo) {
      var tempVal = {
        totalEarnings: parseFloat(subscriptionInfo[i].totalEarnings),
        upsellEarnings: parseFloat(subscriptionInfo[i].upsellEarnings),
        tier: getPriceTier(subscriptionInfo[i].currentTier),
        chargeDate: moment(subscriptionInfo[i].createdAt).format('MM/DD/YYYY')
      }

      displaySubscriptionInfo.push(tempVal);
    }
  }

  const isCancelEnabled = process.env.CANCEL_ENABLED === "true";
  const active = await getActiveSubscription(request);
  if (active) {
    await setSubscriptionStatusMetafield(request, "ACTIVE");
    return json({ plan: [active], isCancelEnabled, dbShopRecord, displaySubscriptionInfo });
  } else {
    await setSubscriptionStatusMetafield(request, "UNSUBSCRIBED");
    await disableAllFeatures(shopId, admin);
    return json({ plan: [{ status: "Unsubscribed" }], isCancelEnabled, dbShopRecord, displaySubscriptionInfo });
  }
};

export default function SubscriptionPage() {
  const navigate = useNavigate();
  const { plan, isCancelEnabled, dbShopRecord, displaySubscriptionInfo } = useLoaderData<typeof loader>();

  var installDate, trialDate;
  var isTrialEnabled = true;
  var todayMoment = moment(moment(), 'YYYY-MM-DD');
  if (dbShopRecord != null && dbShopRecord.createdAt) {
    installDate = moment(dbShopRecord.createdAt.split(' ')[0], 'YYYY-MM-DD');
    trialDate = installDate.add(30, 'days');

    if (todayMoment.isAfter(trialDate)) {
      isTrialEnabled = false;
    }
  }

  const formattedChargeRows = displaySubscriptionInfo != null ? displaySubscriptionInfo.map((item) => [
    item.tier.label,
    item.tier.basePrice.toString(),
    `${item.totalEarnings.toString()} USD`,
    `${item.upsellEarnings.toString()} USD`,
    item.chargeDate
  ]) : null;

  let isSubscribed = false;
  if (Array.isArray(plan) && plan.length > 0) {
    isSubscribed = plan[0].status === "ACTIVE";
  }

  // Brand logos matching the image
 const logos = [
    "/assets/brand_logos/Boxed water.png",
    "/assets/brand_logos/Customer Logo - 13 stars.png",
    "/assets/brand_logos/Customer Logo - Apex Built.png",
    "/assets/brand_logos/Customer Logo - ecobark.png",
    "/assets/brand_logos/Customer logo - el ecristiano tequila.png",
    "/assets/brand_logos/Customer Logo - Epoch.png",
    "/assets/brand_logos/Customer Logo - Ketelogie.png",
    "/assets/brand_logos/Customer Logo - Lily Hill.png",
    "/assets/brand_logos/Customer Logo - Mushroom Supplies.png",
    "/assets/brand_logos/Dose.png",
    "/assets/brand_logos/Jarritos.png",
    "/assets/brand_logos/Le creuset logo.png",
    "/assets/brand_logos/Lumin logo.png",
    "/assets/brand_logos/Organic crave.png"
  ];

  const [openPricing, setOpenPricing] = useState(false);

  return (
    <Page>
      <Layout>
        <div style={{ maxWidth: '2000px', margin: '0 auto', width: '120%' }}> 
          <Layout.Section>
            <PageHeader title="PortalSphere" subtitle="Next-Gen B2B" />
          </Layout.Section>
          <Layout.Section>
            <BlockStack gap="400">
              {isSubscribed ? (
                <Card>
                  <CalloutCard
                    title="Thanks! You are subscribed."
                    illustration="https://cdn.shopify.com/s/files/1/0583/6465/7734/files/tag.png?v=1705280535"
                    primaryAction={isCancelEnabled ? { content: "Cancel Plan", url: "/app/cancel-subscription" } : { content: "Start Setting up Your Store", url: "/app" }}
                  >
                    <p>You're currently on {plan[0].name}. All features are unlocked.</p>
                    {isTrialEnabled ? (
                      <p>Your trial ends on {trialDate?.format('MM/DD/YYYY')}</p>
                    ) : null}
                  </CalloutCard>
                  <div>
                    {formattedChargeRows != null && formattedChargeRows.length > 0 ? (
                      <>
                        <p style={{ marginTop: '20px' }}><b>Your Charge History:</b></p>
                        <DataTable
                          columnContentTypes={["text", "text", "text", "text", "text"]}
                          headings={["Tier", "Subscription Fee", "Total Revenue", "Upsell Revenue", "Charge Date"]}
                          rows={formattedChargeRows}
                        />
                      </>
                    ) : (
                      <p>No charges to display</p>
                    )}
                  </div>
                </Card>
              ) : (
                <>
                  {/* Hero Card */}
                  <Card>
                    <div style={{ padding: '32px 48px', textAlign: 'left' }}>
                      <h2 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '16px', color: '#202223' }}>
                        Ready to supercharge your wholesale orders? Let's get started!
                      </h2>

                      <div style={{ marginBottom: '20px', textAlign: 'left' }}>
                        <div style={{ marginBottom: '8px', fontSize: '16px', color: '#637381' }}>
                          Your subscription starts with a <b>30-day free trial.</b>
                        </div>
                        <div style={{ fontSize: '14px', color: '#637381', lineHeight: '20px' }}>
                          After your 30-day free trial, pricing begins at $49/mo, and increases incrementally based on your sales (up to $799/mo. for stores doing $300k+ per month).
                        </div>
                      </div>

                      {/* Pricing Table Toggle Button */}
                      <div style={{ textAlign: 'left', marginBottom: '16px' }}>
                        <button
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#007bff',
                            cursor: 'pointer',
                            fontWeight: 400,
                            fontSize: '16px',
                            textDecoration: 'underline',
                            padding: 0
                          }}
                          onClick={() => setOpenPricing((prev) => !prev)}
                        >
                          {openPricing ? 'Hide pricing table' : 'See pricing table'}
                        </button>
                      </div>

                      {openPricing && (
                        <>
                          {/* Custom Pricing Table */}
                          <div style={{
                            background: '#f7f8fa',
                            borderRadius: '32px',
                            padding: '32px 16px 24px 16px',
                            margin: '0 auto 32px auto',
                            maxWidth: 1520,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                          }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 16 }}>
                              <thead>
                                <tr>
                                  <th style={{ textAlign: 'left', padding: '0 0 8px 0', fontSize: 24, fontWeight: 700, color: '#202223' }}>
                                    Monthly Sales
                                    <div style={{ fontWeight: 400, fontSize: 14, color: '#8C9196', marginTop: 2 }}>
                                      Your store's monthly gross sales determines the tier you're in.
                                    </div>
                                  </th>
                                  <th style={{ textAlign: 'center', verticalAlign: 'middle', padding: '0 0 8px 0', fontSize: 24, fontWeight: 700, color: '#202223' }}>
                                    Monthly Price
                                    <div style={{ fontWeight: 400, fontSize: 14, color: '#8C9196', marginTop: 2 }}>
                                      Your total cost for using PortalSphere.
                                    </div>
                                  </th>
                                  <th style={{ textAlign: 'center', verticalAlign: 'middle', padding: '0 0 8px 0', fontSize: 24, fontWeight: 700, color: '#202223' }}>
                                    Upsell Revenue
                                    <div style={{ fontWeight: 400, fontSize: 14, color: '#8C9196', marginTop: 2 }}>
                                      Add'l revenue you can generate from PortalSphere upsell features. Exceeding this will move you to the next tier.
                                    </div>
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr style={{ borderTop: '1px solid #e1e3e5' }}>
                                  <td style={{ padding: '16px 0', textAlign: 'left' }}>Up to <b>$25,000</b></td>
                                  <td style={{ padding: '16px 0', fontWeight: 700, textAlign: 'center', verticalAlign: 'middle' }}>$49/mo.</td>
                                  <td style={{ padding: '16px 0', textAlign: 'center', verticalAlign: 'middle' }}>$1,250</td>
                                </tr>
                                <tr style={{ borderTop: '1px solid #e1e3e5' }}>
                                  <td style={{ padding: '16px 0', textAlign: 'left' }}>Up to <b>$50,000</b></td>
                                  <td style={{ padding: '16px 0', fontWeight: 700, textAlign: 'center', verticalAlign: 'middle' }}>$99/mo.</td>
                                  <td style={{ padding: '16px 0', textAlign: 'center', verticalAlign: 'middle' }}>$2,500</td>
                                </tr>
                                <tr style={{ borderTop: '1px solid #e1e3e5' }}>
                                  <td style={{ padding: '16px 0', textAlign: 'left' }}>Up to <b>$100,000</b></td>
                                  <td style={{ padding: '16px 0', fontWeight: 700, textAlign: 'center', verticalAlign: 'middle' }}>$199/mo.</td>
                                  <td style={{ padding: '16px 0', textAlign: 'center', verticalAlign: 'middle' }}>$5,000</td>
                                </tr>
                                <tr style={{ borderTop: '1px solid #e1e3e5' }}>
                                  <td style={{ padding: '16px 0', textAlign: 'left' }}>Up to <b>$200,000</b></td>
                                  <td style={{ padding: '16px 0', fontWeight: 700, textAlign: 'center', verticalAlign: 'middle' }}>$399/mo.</td>
                                  <td style={{ padding: '16px 0', textAlign: 'center', verticalAlign: 'middle' }}>$10,000</td>
                                </tr>
                                <tr style={{ borderTop: '1px solid #e1e3e5' }}>
                                  <td style={{ padding: '16px 0', textAlign: 'left' }}>Up to <b>$300,000</b></td>
                                  <td style={{ padding: '16px 0', fontWeight: 700, textAlign: 'center', verticalAlign: 'middle' }}>$599/mo.</td>
                                  <td style={{ padding: '16px 0', textAlign: 'center', verticalAlign: 'middle' }}>$15,000</td>
                                </tr>
                                <tr style={{ borderTop: '1px solid #e1e3e5' }}>
                                  <td style={{ padding: '16px 0', textAlign: 'left' }}>Over <b>$300,000</b></td>
                                  <td style={{ padding: '16px 0', fontWeight: 700, textAlign: 'center', verticalAlign: 'middle' }}>$799/mo.</td>
                                  <td style={{ padding: '16px 0', textAlign: 'center', verticalAlign: 'middle' }}>$20,000<br/>
                                    <span style={{ display: 'block', fontSize: 13, color: '#8C9196', fontStyle: 'italic', marginTop: 4 }}>
                                      Exceeding $20k will increase monthly price $99 per additional $10k generated from upsell features.
                                    </span>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}

                      {/* Continue Button */}
                      <div style={{
                        position: 'relative',
                        width: '100%',
                        margin: '0 auto 0 auto',
                        maxWidth: 1520,
                        paddingBottom: 8,
                      }}>
                        <button
                          style={{
                            width: '100%',
                            background: '#222',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: 20,
                            border: 'none',
                            borderRadius: 12,
                            padding: '16px 0',
                            margin: '0 auto',
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                            letterSpacing: 0.5,
                            transition: 'background 0.2s',
                          }}
                          onClick={() => navigate("/app/submit-subscription")}
                        >
                          Continue
                        </button>
                      </div>


                      <p style={{
                        fontSize: '16px',
                        color: '#202223',
                        fontWeight: 600,
                        marginBottom: '24px',
                        textAlign: 'center'
                      }}>
                        Go beyond mere order taking – start increasing B2B sales & product adoption today!
                      </p>

                      {/* Rating and Guarantee Section */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '48px',
                        flexWrap: 'wrap',
                        marginBottom: '32px'
                      }}>
                        {/* Shopify Rating */}
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '20px', color: '#FFD700', marginBottom: '4px' }}>
                            ★★★★★
                          </div>
                          <div style={{ fontSize: '12px', color: '#8C9196' }}>
                            Shopify app store rating
                          </div>
                        </div>

                        {/* ROI Guarantee */}
                        <div style={{ textAlign: 'center' }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            marginBottom: '4px'
                          }}>
                            <span style={{ fontSize: '16px', color: '#00A47C' }}>✅</span>
                            <span style={{ fontSize: '14px', fontWeight: 600, color: '#00A47C' }}>
                              ROI Guarantee
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#8C9196' }}>
                            Pays for itself or it's free
                          </div>
                        </div>
                      </div>


                    </div>
                  </Card>

                  {/* Trusted Brands Section */}
                  <Card>
                    <div style={{ padding: '32px' }}>
                      <h2 style={{
                        fontSize: '18px',
                        fontWeight: 600,
                        textAlign: 'center',
                        marginBottom: '32px',
                        color: '#202223'
                      }}>
                        Trusted by innovative brands to increase B2B sales and product adoption
                      </h2>

                      {/* Logo Carousel */}
                      <div style={{
                        width: '100%',
                        overflow: 'hidden',
                        padding: '20px 0',
                        position: 'relative',
                        maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
                        WebkitMaskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)'
                      }}>
                        <div style={{
                          display: 'flex',
                          gap: '48px',
                          animation: 'scrollLogos 30s linear infinite',
                          width: 'max-content'
                        }}>
                          {/* First set of logos */}
                          {logos.map((logo, idx) => (
                            <div key={`first-${idx}`} style={{
                              flex: '0 0 auto',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '16px 24px',
                              backgroundColor: '#ffffff',
                              border: '1px solid #e1e3e5',
                              borderRadius: '12px',
                              minWidth: '160px',
                              height: '80px',
                              transition: 'all 0.3s ease',
                              cursor: 'pointer'
                            }}>
                              <img
                                src={logo}
                                alt={`Brand logo ${idx + 1}`}
                                style={{
                                  maxHeight: '60px',
                                  maxWidth: '140px',
                                  width: 'auto',
                                  objectFit: 'contain',
                                  filter: 'grayscale(10%)',
                                  opacity: 0.8,
                                  transition: 'all 0.3s ease'
                                }}
                              />
                            </div>
                          ))}
                          {/* Duplicate set for seamless loop */}
                          {logos.map((logo, idx) => (
                            <div key={`second-${idx}`} style={{
                              flex: '0 0 auto',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '16px 24px',
                              backgroundColor: '#ffffff',
                              border: '1px solid #e1e3e5',
                              borderRadius: '12px',
                              minWidth: '160px',
                              height: '80px',
                              transition: 'all 0.3s ease',
                              cursor: 'pointer'
                            }}>
                              <img
                                src={logo}
                                alt={`Brand logo ${idx + 1}`}
                                style={{
                                  maxHeight: '60px',
                                  maxWidth: '140px',
                                  width: 'auto',
                                  objectFit: 'contain',
                                  filter: 'grayscale(10%)',
                                  opacity: 0.8,
                                  transition: 'all 0.3s ease'
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      <style>{`
                        @keyframes scrollLogos {
                          0% {
                            transform: translateX(0);
                          }
                          100% {
                            transform: translateX(calc(-50% - 24px));
                          }
                        }

                        /* Pause animation on hover */
                        .logo-carousel:hover > div {
                          animation-play-state: paused;
                        }

                        /* Logo hover effects */
                        .logo-item:hover {
                          transform: translateY(-2px);
                          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                          border-color: #c9cccf;
                        }

                        .logo-item:hover img {
                          filter: grayscale(0%);
                          opacity: 1;
                        }
                      `}</style>
                    </div>
                  </Card>
                </>
              )}
            </BlockStack>
          </Layout.Section>
        </div>
      </Layout>
    </Page>
  );
}