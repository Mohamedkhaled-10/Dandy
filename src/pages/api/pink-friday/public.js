export const prerender = false;

// src/pages/api/pink-friday/public.js
// Public-facing API endpoint returning the active published Pink Friday campaign status
import {
  getPublishedPinkFridayCampaign,
  getCampaignStatus,
  shouldDisplayCampaignToCustomers
} from '../../../utils/pink-friday-server.ts';

export async function GET() {
  try {
    const campaign = await getPublishedPinkFridayCampaign(true);
    const status = getCampaignStatus(campaign);
    const isVisibleToCustomers = shouldDisplayCampaignToCustomers(campaign);

    const rawOffers = Array.isArray(campaign.offers)
      ? campaign.offers
      : (campaign.offers && typeof campaign.offers === 'object' ? Object.values(campaign.offers) : []);

    const rawCollections = Array.isArray(campaign.collections)
      ? campaign.collections
      : (campaign.collections && typeof campaign.collections === 'object' ? Object.values(campaign.collections) : []);

    // Only expose public-facing promotional fields
    const publicPayload = {
      campaignId: campaign.id,
      year: campaign.year,
      title: campaign.title,
      subtitleAr: campaign.subtitleAr,
      timezone: campaign.timezone,
      status,
      enabled: campaign.enabled === true && campaign.unpublished !== true && status === 'active',
      unpublished: Boolean(campaign.unpublished),
      startAt: campaign.startAt || campaign.startDate,
      endAt: campaign.endAt || campaign.endDate,
      isVisible: isVisibleToCustomers,
      visuals: campaign.visuals || {},
      ...(campaign.i18n ? { i18n: campaign.i18n } : {}),
      offers: isVisibleToCustomers
        ? rawOffers
            .filter(o => o && o.active !== false && o.active !== 'false' && o.active !== 0 && o.productId)
            .map(o => ({
              productId: o.productId,
              expectedBasePrice: o.expectedBasePrice,
              campaignPrice: o.campaignPrice,
              discountPercentage: o.discountPercentage,
              badgeText: o.badgeText || 'Pink Friday',
              allowWithGenericDiscount: Boolean(o.allowWithGenericDiscount),
              active: true
            }))
        : [],
      collections: isVisibleToCustomers
        ? rawCollections
            .filter(c => c && c.active !== false && c.active !== 'false' && c.active !== 0)
            .map(c => {
              const colItems = Array.isArray(c.items)
                ? c.items
                : (c.items && typeof c.items === 'object' ? Object.values(c.items) : []);
              return {
                id: c.id,
                name: c.name,
                description: c.description || '',
                coverImage: c.coverImage || '',
                allowDuplicates: Boolean(c.allowDuplicates),
                pricingType: c.pricingType,
                packagePrice: c.packagePrice,
                discountPercentage: c.discountPercentage,
                badgeText: c.badgeText || 'كوليكشن Pink Friday',
                active: true,
                items: colItems.map(it => ({
                  collectionItemId: it.collectionItemId,
                  productId: it.productId,
                  defaultVariantId: it.defaultVariantId
                }))
              };
            })
        : []
    };

    return new Response(JSON.stringify(publicPayload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      }
    });
  } catch (error) {
    console.error('[PinkFriday Public API] Error:', error);
    return new Response(JSON.stringify({
      enabled: false,
      status: 'disabled',
      isVisible: false,
      offers: [],
      collections: []
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      }
    });
  }
}
