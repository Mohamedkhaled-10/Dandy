// test/firebase-rules-emulator.test.mjs
// GROUP 4D: Firebase Local Emulator Security Rules Integration Testing
// Runs exclusively against local Firebase Emulators using synthetic data and project demo-dandy-rules-test.
// Does NOT load .env, patch-env.cjs, or production Service Account credentials.

import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from '@firebase/rules-unit-testing';
import {
  ref as rtdbRef,
  get as rtdbGet,
  set as rtdbSet,
  update as rtdbUpdate,
  remove as rtdbRemove,
  query as rtdbQuery,
  orderByChild,
  equalTo
} from 'firebase/database';
import {
  doc as fsDoc,
  getDoc as fsGetDoc,
  setDoc as fsSetDoc,
  updateDoc as fsUpdateDoc,
  deleteDoc as fsDeleteDoc,
  collection as fsCollection,
  getDocs as fsGetDocs,
  query as fsQuery,
  where as fsWhere
} from 'firebase/firestore';

const ROOT = process.cwd();
const PROJECT_ID = 'demo-dandy-rules-test';
const RTDB_RULES_PATH = path.join(ROOT, 'firebase/database.rules.json');
const FIRESTORE_RULES_PATH = path.join(ROOT, 'firebase/firestore.rules');

const EMULATOR_ACTIVE = Boolean(
  process.env.FIREBASE_DATABASE_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST
);

const SKIP_REASON = EMULATOR_ACTIVE
  ? false
  : 'Firebase Emulators are not active (requires JDK 11+ and execution via: firebase emulators:exec --project demo-dandy-rules-test --only database,firestore "node --test test/firebase-rules-emulator.test.mjs")';

let testEnv = null;

function getIdentities(env) {
  return {
    guest: env.unauthenticatedContext(),
    custA: env.authenticatedContext('custA', {
      email: 'custa@example.com',
      email_verified: false
    }),
    custB: env.authenticatedContext('custB', {
      email: 'custb@example.com',
      email_verified: true
    }),
    adminUnverified: env.authenticatedContext('admin-unverified', {
      email: 'admin@dandy.com',
      email_verified: false
    }),
    adminVerified: env.authenticatedContext('admin-verified', {
      email: 'admin@dandy.com',
      email_verified: true
    })
  };
}

describe('GROUP 4D: Firebase Local Emulator Security Rules Integration Suite', { concurrency: false, skip: SKIP_REASON }, () => {
  before(async () => {
    const rtdbRules = fs.readFileSync(RTDB_RULES_PATH, 'utf8');
    const firestoreRules = fs.readFileSync(FIRESTORE_RULES_PATH, 'utf8');

    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      database: {
        rules: rtdbRules
      },
      firestore: {
        rules: firestoreRules
      }
    });
  });

  after(async () => {
    if (testEnv) {
      await testEnv.cleanup();
      testEnv = null;
    }
  });

  describe('Phase 3: Realtime Database Security Rules (Emulator)', { concurrency: false }, () => {
    beforeEach(async () => {
      await testEnv.clearDatabase();
      await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
        const db = adminCtx.database();
        await rtdbSet(rtdbRef(db), {
          homepage: { heroTitle: 'Dandy Natural Beauty' },
          categories: { skincare: { name: 'العناية بالبشرة' } },
          products: {
            'prod-1': {
              name: 'سيروم الهيالورونيك',
              slug: 'hyaluronic-serum',
              price: 450,
              stockQuantity: 10,
              isSoldOut: false,
              avgRating: 4.8,
              reviewCount: 5
            },
            'prod-no-stock': {
              name: 'بلسم الشفاه',
              slug: 'lip-balm',
              price: 120,
              isSoldOut: false
            }
          },
          testimonials: {
            't-1': { image: 'https://example.com/review1.jpg' }
          },
          reviews: {
            'prod-1': {
              custA: {
                rating: 5,
                comment: 'ممتاز',
                customerName: 'سارة',
                orderId: 'orderA',
                createdAt: 1700000000000
              }
            }
          },
          orders: {
            orderA: {
              customerId: 'custA',
              invoiceCode: 'DNY-111111',
              name: 'Customer A',
              phone: '01011111111',
              totalAmount: 450,
              status: 'جديد'
            },
            orderB: {
              customerId: 'custB',
              invoiceCode: 'DNY-222222',
              name: 'Customer B',
              phone: '01022222222',
              totalAmount: 240,
              status: 'تم التوصيل'
            }
          },
          customers: {
            custB: {
              name: 'Customer B',
              email: 'custb@example.com',
              phone: '01022222222',
              createdAt: 1700000000000,
              addresses: {
                addrB1: {
                  label: 'المنزل',
                  governorate: 'القاهرة',
                  city: 'المعادي',
                  address: 'شارع 9',
                  isDefault: true
                }
              }
            }
          },
          wishlists: {
            custB: { 'prod-1': true }
          },
          settings: {
            pinkFriday: {
              publishedActiveCampaign: { enabled: false, title: 'Pink Friday' },
              campaigns: {
                'pink-friday-2026': {
                  draft: { title: 'Draft Campaign', updatedBy: 'admin@dandy.com' },
                  published: { title: 'Published Campaign', publishedBy: 'admin@dandy.com' },
                  meta: { id: 'pink-friday-2026', year: 2026 }
                }
              }
            }
          },
          privateOrderAccess: { orderA: { tokenHash: 'hashA' } },
          privateInvoiceAccess: { hashA: { orderId: 'orderA' } },
          privateOrderIdempotency: { reqHash1: { status: 'COMPLETED' } },
          privateRateLimits: { createOrder: { bucket1: { count: 1 } } },
          privateDeletedOrders: { orderOld: { deletedAt: 1700000000000 } },
          notifications_outbox: { notif1: { orderId: 'orderA', timestamp: 1700000000000 } },
          _archive: { oldOrders: { count: 1 } }
        });
      });
    });

    test('3A. Public Catalog Permissions: guest can read catalog, only verified admin can write', async () => {
      const { guest, adminUnverified, adminVerified } = getIdentities(testEnv);
      const guestDb = guest.database();
      const unverifiedAdminDb = adminUnverified.database();
      const verifiedAdminDb = adminVerified.database();

      // Guest reads allowed
      for (const p of ['homepage', 'categories', 'products', 'testimonials', 'reviews/prod-1']) {
        await assertSucceeds(rtdbGet(rtdbRef(guestDb, p)), `Guest must be allowed to read ${p}`);
      }

      // Guest writes/deletes denied
      for (const p of ['homepage', 'categories', 'products', 'testimonials', 'reviews/prod-1']) {
        await assertFails(rtdbSet(rtdbRef(guestDb, `${p}/tamper`), 'bad'), `Guest must be denied writing ${p}`);
        await assertFails(rtdbRemove(rtdbRef(guestDb, p)), `Guest must be denied deleting ${p}`);
      }

      // Unverified admin writes denied
      for (const p of ['homepage', 'categories', 'products', 'testimonials']) {
        await assertFails(rtdbSet(rtdbRef(unverifiedAdminDb, `${p}/unverifiedEdit`), 'bad'), `Unverified admin must be denied writing ${p}`);
      }

      // Verified admin writes allowed
      await assertSucceeds(rtdbUpdate(rtdbRef(verifiedAdminDb, 'homepage'), { heroTitle: 'Updated Hero' }));
      await assertSucceeds(rtdbSet(rtdbRef(verifiedAdminDb, 'categories/bodycare'), { name: 'العناية بالجسم' }));
      await assertSucceeds(rtdbSet(rtdbRef(verifiedAdminDb, 'products/prod-2'), { name: 'كريم جديد', price: 200 }));
      await assertSucceeds(rtdbSet(rtdbRef(verifiedAdminDb, 'testimonials/t-2'), { image: 'https://example.com/t2.jpg' }));
    });

    test('3B. Product Security: guest and customer cannot tamper with stock, soldOut, ratings, or products; verified admin can manage products', async () => {
      const { guest, custA, adminVerified } = getIdentities(testEnv);

      for (const [label, ctx] of [['Guest', guest], ['Customer A', custA]]) {
        const db = ctx.database();
        await assertFails(rtdbSet(rtdbRef(db, 'products/prod-1/stockQuantity'), 0), `${label} must not change stockQuantity`);
        await assertFails(rtdbSet(rtdbRef(db, 'products/prod-1/isSoldOut'), true), `${label} must not set isSoldOut`);
        await assertFails(rtdbSet(rtdbRef(db, 'products/prod-1/avgRating'), 1), `${label} must not change avgRating`);
        await assertFails(rtdbSet(rtdbRef(db, 'products/prod-1/reviewCount'), 999), `${label} must not change reviewCount`);
        await assertFails(rtdbSet(rtdbRef(db, 'products/prod-injected'), { name: 'Hack', price: 1 }), `${label} must not insert a product`);
        await assertFails(rtdbRemove(rtdbRef(db, 'products/prod-1')), `${label} must not delete a product`);
      }

      // Verified admin manages products (including products without numeric stockQuantity)
      const adminDb = adminVerified.database();
      await assertSucceeds(rtdbUpdate(rtdbRef(adminDb, 'products/prod-no-stock'), { price: 135 }));
      await assertSucceeds(rtdbSet(rtdbRef(adminDb, 'products/prod-3'), { name: 'ماسك', price: 300, isSoldOut: false }));
      await assertSucceeds(rtdbRemove(rtdbRef(adminDb, 'products/prod-3')));
    });

    test('3C. Orders Security: strict isolation, customerId query only, no public invoiceCode query, no client writes even by admin Web SDK', async () => {
      const { guest, custA, custB, adminVerified } = getIdentities(testEnv);

      // Guest checks
      const guestDb = guest.database();
      await assertFails(rtdbGet(rtdbRef(guestDb, 'orders')), 'Guest must not read /orders');
      await assertFails(rtdbGet(rtdbRef(guestDb, 'orders/orderA')), 'Guest must not read /orders/orderA');
      await assertFails(
        rtdbGet(rtdbQuery(rtdbRef(guestDb, 'orders'), orderByChild('invoiceCode'), equalTo('DNY-111111'))),
        'Guest must not query orders by invoiceCode'
      );
      await assertFails(rtdbSet(rtdbRef(guestDb, 'orders/orderGuest'), { customerId: 'anon', totalAmount: 100 }), 'Guest must not create orders');
      await assertFails(rtdbUpdate(rtdbRef(guestDb, 'orders/orderA'), { status: 'ملغي' }), 'Guest must not modify orders');
      await assertFails(rtdbRemove(rtdbRef(guestDb, 'orders/orderA')), 'Guest must not delete orders');

      // Customer A checks
      const custADb = custA.database();
      const custASnap = await assertSucceeds(
        rtdbGet(rtdbQuery(rtdbRef(custADb, 'orders'), orderByChild('customerId'), equalTo('custA'))),
        'Customer A must be allowed to query own orders by customerId'
      );
      assert.deepEqual(Object.keys(custASnap.val() || {}), ['orderA']);

      await assertFails(rtdbGet(rtdbRef(custADb, 'orders')), 'Customer A must not run unfiltered /orders read');
      await assertFails(
        rtdbGet(rtdbQuery(rtdbRef(custADb, 'orders'), orderByChild('customerId'), equalTo('custB'))),
        'Customer A must not query orders of Customer B'
      );
      await assertFails(rtdbGet(rtdbRef(custADb, 'orders/orderB')), 'Customer A must not read orderB directly');
      await assertFails(rtdbGet(rtdbRef(custADb, 'orders/orderA')), 'Customer A must not read orderA directly outside constrained query');
      await assertFails(rtdbSet(rtdbRef(custADb, 'orders/orderNew'), { customerId: 'custA', totalAmount: 1 }), 'Customer A must not create orders directly');
      await assertFails(rtdbUpdate(rtdbRef(custADb, 'orders/orderA'), { status: 'تم التوصيل' }), 'Customer A must not modify order status');
      await assertFails(rtdbRemove(rtdbRef(custADb, 'orders/orderA')), 'Customer A must not delete own order');

      // Customer B checks
      const custBDb = custB.database();
      const custBSnap = await assertSucceeds(
        rtdbGet(rtdbQuery(rtdbRef(custBDb, 'orders'), orderByChild('customerId'), equalTo('custB'))),
        'Customer B must be allowed to query own orders'
      );
      assert.deepEqual(Object.keys(custBSnap.val() || {}), ['orderB']);

      // Verified Admin checks: can read, CANNOT write via Web SDK (orders/.write is intentionally false; server Admin SDK handles writes)
      const adminDb = adminVerified.database();
      await assertSucceeds(rtdbGet(rtdbRef(adminDb, 'orders')), 'Verified admin must be able to read /orders');
      await assertSucceeds(rtdbGet(rtdbRef(adminDb, 'orders/orderA')), 'Verified admin must be able to read /orders/orderA');
      await assertFails(rtdbSet(rtdbRef(adminDb, 'orders/orderAdmin'), { customerId: 'custA', totalAmount: 100 }), 'Admin Web SDK must be denied writing orders directly');
      await assertFails(rtdbUpdate(rtdbRef(adminDb, 'orders/orderA'), { status: 'تم الشحن' }), 'Admin Web SDK must be denied updating orders directly');
      await assertFails(rtdbRemove(rtdbRef(adminDb, 'orders/orderA')), 'Admin Web SDK must be denied deleting orders directly');
    });

    test('3D. Customers Security: registration without email_verified, profile/address CRUD, phone immutability, self-deletion blocked, cross-customer isolation', async () => {
      const { custA, adminVerified } = getIdentities(testEnv);
      const custADb = custA.database();

      // Registration works even when email_verified is false
      await assertSucceeds(
        rtdbSet(rtdbRef(custADb, 'customers/custA'), {
          name: 'Amira',
          email: 'custa@example.com',
          phone: '01011111111',
          createdAt: 1700000001000
        }),
        'Customer A registration must succeed even when email_verified is false'
      );

      // Own profile read & allowed name update
      await assertSucceeds(rtdbGet(rtdbRef(custADb, 'customers/custA')));
      await assertSucceeds(rtdbUpdate(rtdbRef(custADb, 'customers/custA'), { name: 'Amira Updated' }));

      // Address CRUD
      await assertSucceeds(
        rtdbSet(rtdbRef(custADb, 'customers/custA/addresses/addr1'), {
          label: 'العمل',
          governorate: 'الجيزة',
          city: 'الدقي',
          address: 'شارع التحرير 12',
          isDefault: true
        })
      );
      await assertSucceeds(rtdbGet(rtdbRef(custADb, 'customers/custA/addresses')));
      await assertSucceeds(rtdbUpdate(rtdbRef(custADb, 'customers/custA/addresses/addr1'), { city: 'المهندسين' }));
      await assertSucceeds(rtdbRemove(rtdbRef(custADb, 'customers/custA/addresses/addr1')));

      // Forbidden operations for Customer A
      await assertFails(rtdbGet(rtdbRef(custADb, 'customers/custB')), 'Customer A must not read customers/custB');
      await assertFails(rtdbUpdate(rtdbRef(custADb, 'customers/custB'), { name: 'Hacked' }), 'Customer A must not write customers/custB');
      await assertFails(rtdbRemove(rtdbRef(custADb, 'customers/custA')), 'Customer A must not delete entire customers/custA node');
      await assertFails(rtdbSet(rtdbRef(custADb, 'customers/custA/phone'), '01099999999'), 'Customer A must not change existing phone');
      await assertFails(rtdbUpdate(rtdbRef(custADb, 'customers/custA'), { phone: '01099999999' }), 'Customer A must not update existing phone');

      // Verified admin retains authorized access
      const adminDb = adminVerified.database();
      await assertSucceeds(rtdbGet(rtdbRef(adminDb, 'customers/custA')));
      await assertSucceeds(rtdbUpdate(rtdbRef(adminDb, 'customers/custA'), { phone: '01088888888' }));
    });

    test('3E. Wishlists: owner CRUD only, cross-customer denied, verified admin allowed', async () => {
      const { guest, custA, custB, adminVerified } = getIdentities(testEnv);

      await assertFails(rtdbGet(rtdbRef(guest.database(), 'wishlists/custB')));
      await assertFails(rtdbSet(rtdbRef(guest.database(), 'wishlists/custA/prod-1'), true));

      const custADb = custA.database();
      await assertSucceeds(rtdbSet(rtdbRef(custADb, 'wishlists/custA/prod-1'), true));
      await assertSucceeds(rtdbGet(rtdbRef(custADb, 'wishlists/custA')));
      await assertSucceeds(rtdbRemove(rtdbRef(custADb, 'wishlists/custA/prod-1')));

      await assertFails(rtdbGet(rtdbRef(custADb, 'wishlists/custB')), 'Customer A must not read Customer B wishlist');
      await assertFails(rtdbSet(rtdbRef(custADb, 'wishlists/custB/prod-1'), true), 'Customer A must not write Customer B wishlist');

      await assertFails(rtdbGet(rtdbRef(custB.database(), 'wishlists/custA')), 'Customer B must not read Customer A wishlist');
      await assertFails(rtdbSet(rtdbRef(custB.database(), 'wishlists/custA/prod-1'), true), 'Customer B must not write Customer A wishlist');

      await assertSucceeds(rtdbGet(rtdbRef(adminVerified.database(), 'wishlists/custB')));
      await assertSucceeds(rtdbSet(rtdbRef(adminVerified.database(), 'wishlists/custA/prod-1'), true));
    });

    test('3F. Reviews: public read allowed, direct client writes and rating tampering denied', async () => {
      const { guest, custA } = getIdentities(testEnv);

      await assertSucceeds(rtdbGet(rtdbRef(guest.database(), 'reviews/prod-1')));
      await assertSucceeds(rtdbGet(rtdbRef(custA.database(), 'reviews/prod-1')));

      await assertFails(
        rtdbSet(rtdbRef(guest.database(), 'reviews/prod-1/guest1'), {
          rating: 5,
          comment: 'fake',
          customerName: 'Guest',
          orderId: 'o1',
          createdAt: 1700000000000
        }),
        'Guest must not write reviews directly'
      );

      await assertFails(
        rtdbSet(rtdbRef(custA.database(), 'reviews/prod-1/custA'), {
          rating: 1,
          comment: 'bypass',
          customerName: 'Cust A',
          orderId: 'orderA',
          createdAt: 1700000000000
        }),
        'Customer A must not write reviews directly (must use /api/submit-review)'
      );

      await assertFails(rtdbSet(rtdbRef(custA.database(), 'products/prod-1/avgRating'), 1.0));
      await assertFails(rtdbSet(rtdbRef(custA.database(), 'products/prod-1/reviewCount'), 100));
    });

    test('3G. Settings: all client contexts (including verified admin Web SDK) are denied direct access', async () => {
      const identities = getIdentities(testEnv);
      const settingPaths = [
        'settings',
        'settings/pinkFriday/publishedActiveCampaign',
        'settings/pinkFriday/campaigns/pink-friday-2026/draft',
        'settings/pinkFriday/campaigns/pink-friday-2026/published',
        'settings/pinkFriday/campaigns/pink-friday-2026/meta'
      ];

      for (const [name, ctx] of Object.entries(identities)) {
        const db = ctx.database();
        for (const p of settingPaths) {
          await assertFails(rtdbGet(rtdbRef(db, p)), `${name} must be denied reading ${p}`);
          await assertFails(rtdbSet(rtdbRef(db, `${p}/tamper`), true), `${name} must be denied writing ${p}`);
        }
      }
    });

    test('3H. Private Paths: all client contexts (including verified admin Web SDK) are denied direct access', async () => {
      const identities = getIdentities(testEnv);
      const privatePaths = [
        'privateOrderAccess',
        'privateInvoiceAccess',
        'privateOrderIdempotency',
        'privateRateLimits',
        'privateDeletedOrders',
        'notifications_outbox'
      ];

      for (const [name, ctx] of Object.entries(identities)) {
        const db = ctx.database();
        for (const p of privatePaths) {
          await assertFails(rtdbGet(rtdbRef(db, p)), `${name} must be denied reading ${p}`);
          await assertFails(rtdbSet(rtdbRef(db, `${p}/probe`), { test: true }), `${name} must be denied writing ${p}`);
        }
      }
    });

    test('3I. Archive: only verified admin allowed; guest, customer, and unverified admin denied', async () => {
      const { guest, custA, adminUnverified, adminVerified } = getIdentities(testEnv);

      for (const [name, ctx] of [['Guest', guest], ['Customer A', custA], ['Admin Unverified', adminUnverified]]) {
        const db = ctx.database();
        await assertFails(rtdbGet(rtdbRef(db, '_archive')), `${name} must be denied reading _archive`);
        await assertFails(rtdbSet(rtdbRef(db, '_archive/probe'), true), `${name} must be denied writing _archive`);
      }

      const adminDb = adminVerified.database();
      await assertSucceeds(rtdbGet(rtdbRef(adminDb, '_archive')));
      await assertSucceeds(rtdbSet(rtdbRef(adminDb, '_archive/testEntry'), { archived: true }));
    });

    test('3J. Default Deny: undefined paths and root-level reads/writes are denied for all clients', async () => {
      const { guest, custA, adminUnverified, adminVerified } = getIdentities(testEnv);

      for (const [name, ctx] of [
        ['Guest', guest],
        ['Customer A', custA],
        ['Admin Unverified', adminUnverified],
        ['Admin Verified', adminVerified]
      ]) {
        const db = ctx.database();
        await assertFails(rtdbGet(rtdbRef(db, 'undefined_synthetic_node/item1')), `${name} must be denied reading undefined path`);
        await assertFails(rtdbSet(rtdbRef(db, 'undefined_synthetic_node/item1'), 'x'), `${name} must be denied writing undefined path`);
        await assertFails(rtdbGet(rtdbRef(db)), `${name} must be denied root-level read`);
        await assertFails(rtdbSet(rtdbRef(db), { wiped: true }), `${name} must be denied root-level write`);
      }
    });
  });

  describe('Phase 4: Cloud Firestore Security Rules (Emulator)', { concurrency: false }, () => {
    beforeEach(async () => {
      await testEnv.clearFirestore();
      await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
        const fsDb = adminCtx.firestore();
        await fsSetDoc(fsDoc(fsDb, 'articles/published-1'), {
          title: 'Published Article',
          slug: 'published-1',
          status: 'published',
          createdAt: 1700000001000
        });
        await fsSetDoc(fsDoc(fsDb, 'articles/draft-1'), {
          title: 'Secret Draft',
          slug: 'draft-1',
          status: 'draft',
          createdAt: 1700000002000
        });
        await fsSetDoc(fsDoc(fsDb, 'articles/legacy-no-status'), {
          title: 'Legacy No Status',
          slug: 'legacy-no-status',
          createdAt: 1700000000000
        });
        await fsSetDoc(fsDoc(fsDb, 'articles/unknown-status'), {
          title: 'Archived Unknown Status',
          slug: 'unknown-status',
          status: 'archived',
          createdAt: 1700000003000
        });
        await fsSetDoc(fsDoc(fsDb, 'change_logs/log-1'), {
          adminEmail: 'admin@dandy.com',
          action: 'Seeded log entry',
          timestamp: 1700000004000
        });
      });
    });

    test('4A. Published Articles: guest reads published-1 & filtered query, rejected on drafts/unknown/legacy/unfiltered query', async () => {
      const { guest } = getIdentities(testEnv);
      const guestFs = guest.firestore();

      await assertSucceeds(fsGetDoc(fsDoc(guestFs, 'articles/published-1')), 'Guest must be allowed to read published article');
      await assertFails(fsGetDoc(fsDoc(guestFs, 'articles/draft-1')), 'Guest must be denied reading draft article');
      await assertFails(fsGetDoc(fsDoc(guestFs, 'articles/unknown-status')), 'Guest must be denied reading unknown-status article');
      await assertFails(fsGetDoc(fsDoc(guestFs, 'articles/legacy-no-status')), 'Guest must be denied reading legacy article without status directly via Web SDK');

      const filteredSnap = await assertSucceeds(
        fsGetDocs(fsQuery(fsCollection(guestFs, 'articles'), fsWhere('status', '==', 'published'))),
        'Guest must be allowed to execute filtered status == published query'
      );
      assert.deepEqual(filteredSnap.docs.map((d) => d.id), ['published-1']);

      await assertFails(
        fsGetDocs(fsCollection(guestFs, 'articles')),
        'Guest unfiltered articles collection query must be rejected'
      );
    });

    test('4B. Admin Article Permissions: verified admin full access; unverified admin & ordinary customers restricted', async () => {
      const { custA, adminUnverified, adminVerified } = getIdentities(testEnv);

      // Verified admin: reads all (published, draft, legacy, unknown, unfiltered) + creates/updates status/deletes
      const adminFs = adminVerified.firestore();
      await assertSucceeds(fsGetDoc(fsDoc(adminFs, 'articles/published-1')));
      await assertSucceeds(fsGetDoc(fsDoc(adminFs, 'articles/draft-1')));
      await assertSucceeds(fsGetDoc(fsDoc(adminFs, 'articles/legacy-no-status')));
      await assertSucceeds(fsGetDocs(fsCollection(adminFs, 'articles')));
      await assertSucceeds(fsSetDoc(fsDoc(adminFs, 'articles/new-admin-art'), {
        title: 'Admin Created',
        slug: 'admin-created',
        status: 'draft',
        createdAt: 1700000005000
      }));
      await assertSucceeds(fsUpdateDoc(fsDoc(adminFs, 'articles/new-admin-art'), { status: 'published' }));
      await assertSucceeds(fsDeleteDoc(fsDoc(adminFs, 'articles/new-admin-art')));

      // Unverified admin: cannot read drafts/legacy or mutate articles
      const unverifiedFs = adminUnverified.firestore();
      await assertSucceeds(fsGetDoc(fsDoc(unverifiedFs, 'articles/published-1')));
      await assertFails(fsGetDoc(fsDoc(unverifiedFs, 'articles/draft-1')));
      await assertFails(fsGetDoc(fsDoc(unverifiedFs, 'articles/legacy-no-status')));
      await assertFails(fsSetDoc(fsDoc(unverifiedFs, 'articles/unverified-art'), { title: 'x', status: 'published' }));
      await assertFails(fsUpdateDoc(fsDoc(unverifiedFs, 'articles/published-1'), { status: 'draft' }));
      await assertFails(fsDeleteDoc(fsDoc(unverifiedFs, 'articles/published-1')));

      // Ordinary customer: published reads only, no mutations
      const custFs = custA.firestore();
      await assertSucceeds(fsGetDoc(fsDoc(custFs, 'articles/published-1')));
      await assertSucceeds(fsGetDocs(fsQuery(fsCollection(custFs, 'articles'), fsWhere('status', '==', 'published'))));
      await assertFails(fsGetDoc(fsDoc(custFs, 'articles/draft-1')));
      await assertFails(fsGetDoc(fsDoc(custFs, 'articles/legacy-no-status')));
      await assertFails(fsGetDocs(fsCollection(custFs, 'articles')));
      await assertFails(fsSetDoc(fsDoc(custFs, 'articles/cust-art'), { title: 'x', status: 'published' }));
      await assertFails(fsUpdateDoc(fsDoc(custFs, 'articles/published-1'), { title: 'tamper' }));
      await assertFails(fsDeleteDoc(fsDoc(custFs, 'articles/published-1')));
    });

    test('4C. change_logs: verified admin only; guest, customer, and unverified admin denied', async () => {
      const { guest, custA, adminUnverified, adminVerified } = getIdentities(testEnv);

      for (const [name, ctx] of [['Guest', guest], ['Customer A', custA], ['Admin Unverified', adminUnverified]]) {
        const fsDb = ctx.firestore();
        await assertFails(fsGetDoc(fsDoc(fsDb, 'change_logs/log-1')), `${name} must be denied reading change_logs`);
        await assertFails(fsSetDoc(fsDoc(fsDb, 'change_logs/log-2'), { action: 'bad' }), `${name} must be denied writing change_logs`);
      }

      const adminFs = adminVerified.firestore();
      await assertSucceeds(fsGetDoc(fsDoc(adminFs, 'change_logs/log-1')));
      await assertSucceeds(fsSetDoc(fsDoc(adminFs, 'change_logs/log-2'), {
        adminEmail: 'admin@dandy.com',
        action: 'Verified log write',
        timestamp: 1700000006000
      }));
    });

    test('4D. Firestore Default Deny: undefined collections and document paths are denied to everyone', async () => {
      const { guest, custA, adminUnverified, adminVerified } = getIdentities(testEnv);
      const forbiddenPaths = [
        'undefined_collection/doc1',
        'articles/published-1/private_sub/doc1'
      ];

      for (const [name, ctx] of [
        ['Guest', guest],
        ['Customer A', custA],
        ['Admin Unverified', adminUnverified],
        ['Admin Verified', adminVerified]
      ]) {
        const fsDb = ctx.firestore();
        for (const p of forbiddenPaths) {
          await assertFails(fsGetDoc(fsDoc(fsDb, p)), `${name} must be denied reading ${p}`);
          await assertFails(fsSetDoc(fsDoc(fsDb, p), { test: true }), `${name} must be denied writing ${p}`);
        }
      }
    });
  });
});
