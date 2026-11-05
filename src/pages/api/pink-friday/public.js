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
    const campaign = await getPublishedPinkFridayCampaign();
    const status = getCampaignStatus(campaign);
    const isVisibleToCustomers = shouldDisplayCampaignToCustomers(campaign);

    // Only expose public-facing promotional fields
    const publicPayload = {
      campaignId: campaign.id,
      year: campaign.year,
      title: campaign.title,
      subtitleAr: campaign.subtitleAr,
      timezone: campaign.timezone,
      status,
      enabled: campaign.enabled && status === 'active',
      startAt: campaign.startAt,
      endAt: campaign.endAt,
      isVisible: isVisibleToCustomers,
      visuals: campaign.visuals || {},
      offers: isVisibleToCustomers
        ? (campaign.offers || []).filter(o => o.active).map(o => ({
            productId: o.productId,
            campaignPrice: o.campaignPrice,
            discountPercentage: o.discountPercentage,
            badgeText: o.badgeText || 'Pink Friday'
          }))
        : [],
      collections: isVisibleToCustomers
        ? (campaign.collections || []).filter(c => c.active).map(c => ({
            id: c.id,
            name: c.name,
            description: c.description || '',
            coverImage: c.coverImage || '',
            allowDuplicates: Boolean(c.allowDuplicates),
            pricingType: c.pricingType,
            packagePrice: c.packagePrice,
            discountPercentage: c.discountPercentage,
            badgeText: c.badgeText || 'كوليكشن Pink Friday',
            items: (c.items || []).map(it => ({
              collectionItemId: it.collectionItemId,
              productId: it.productId,
              defaultVariantId: it.defaultVariantId
            }))
          }))
        : []
    };

    return new Response(JSON.stringify(publicPayload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=120'
      }
    });
  } catch (error) {
    console.error('[PinkFriday Public API] Error:', error);
    return new Response(JSON.stringify({
      enabled: false,
      status: 'disabled',
      offers: []
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
