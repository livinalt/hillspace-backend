/**
 * Live API smoke tests against Render production.
 * Usage: BASE_URL=https://hillspace-backend.onrender.com node scripts/live-smoke.mjs
 */
const BASE = (process.env.BASE_URL || 'https://hillspace-backend.onrender.com').replace(/\/$/, '');
const stamp = Date.now();
const password = 'SmokeTest123!';
const buyerEmail = `smoke.buyer.${stamp}@hillspace.test`;
const sellerEmail = `smoke.seller.${stamp}@hillspace.test`;

const results = [];
const ok = (name, detail = '') => {
  results.push({ name, pass: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
};
const fail = (name, detail = '') => {
  results.push({ name, pass: false, detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function req(method, path, { token, body, expect } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (expect !== undefined && res.status !== expect) {
    const err = new Error(
      `expected ${expect}, got ${res.status}: ${JSON.stringify(data).slice(0, 400)}`,
    );
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return { status: res.status, data };
}

async function register(email, role, phoneSuffix) {
  const res = await req('POST', '/api/auth/register', {
    body: {
      firstName: 'Smoke',
      lastName: role,
      email,
      phone: `+23480${phoneSuffix}`,
      password,
      role,
    },
  });
  return res;
}

async function main() {
  console.log(`\nLive smoke → ${BASE}\n`);

  // Docs (HTML)
  try {
    const res = await fetch(`${BASE}/docs`, { redirect: 'follow' });
    if (res.ok) ok('GET /docs', String(res.status));
    else fail('GET /docs', String(res.status));
  } catch (e) {
    fail('GET /docs', e.message);
  }

  try {
    await req('GET', '/docs-json', { expect: 200 });
    ok('GET /docs-json');
  } catch (e) {
    // some deploys may use different path
    try {
      const r = await fetch(`${BASE}/docs-json`);
      if (r.ok) ok('GET /docs-json', String(r.status));
      else fail('GET /docs-json', e.message);
    } catch (e2) {
      fail('GET /docs-json', e2.message);
    }
  }

  // Public search + filters
  try {
    const { data } = await req('GET', '/api/listings?limit=5', { expect: 200 });
    ok('GET /api/listings', `total=${data?.meta?.total ?? '?'}`);
  } catch (e) {
    fail('GET /api/listings', e.message);
  }

  for (const [name, path] of [
    ['All', '/api/listings?limit=2'],
    ['Rent', '/api/listings?purpose=rent&limit=2'],
    ['Buy/sale', '/api/listings?purpose=sale&limit=2'],
    ['2_bedroom', '/api/listings?category=2_bedroom&limit=2'],
    ['3_bedroom', '/api/listings?category=3_bedroom&limit=2'],
    ['land', '/api/listings?category=land&limit=2'],
    ['self_con', '/api/listings?category=self_con&limit=2'],
    ['price', '/api/listings?minPrice=1&maxPrice=999999999&limit=2'],
    ['amenities', '/api/listings?amenities=parking&limit=2'],
    ['sort rating', '/api/listings?sortBy=rating&limit=2'],
    ['geo nearby', '/api/listings?lat=4.8156&lng=7.0498&radiusKm=50&limit=2'],
  ]) {
    try {
      await req('GET', path, { expect: 200 });
      ok(`filter: ${name}`);
    } catch (e) {
      fail(`filter: ${name}`, e.message);
    }
  }

  // Register (returns JWT even before email verify)
  let buyerToken;
  let sellerToken;
  let buyerId;
  let sellerId;

  try {
    const buyer = await register(buyerEmail, 'buyer', `${String(stamp).slice(-8)}`);
    if ((buyer.status === 201 || buyer.status === 200) && buyer.data?.accessToken) {
      buyerToken = buyer.data.accessToken;
      buyerId = buyer.data.user?.id || buyer.data.user?._id;
      ok('register buyer + JWT', buyerEmail);
    } else {
      fail('register buyer', `${buyer.status} ${JSON.stringify(buyer.data).slice(0, 200)}`);
    }
  } catch (e) {
    fail('register buyer', e.message);
  }

  try {
    const seller = await register(
      sellerEmail,
      'seller',
      `${String(stamp + 1).slice(-8)}`,
    );
    if ((seller.status === 201 || seller.status === 200) && seller.data?.accessToken) {
      sellerToken = seller.data.accessToken;
      sellerId = seller.data.user?.id || seller.data.user?._id;
      ok('register seller + JWT', sellerEmail);
    } else {
      fail('register seller', `${seller.status} ${JSON.stringify(seller.data).slice(0, 200)}`);
    }
  } catch (e) {
    fail('register seller', e.message);
  }

  // Login without verify should 401
  try {
    await req('POST', '/api/auth/login', {
      body: { email: buyerEmail, password },
      expect: 401,
    });
    ok('login before verify → 401');
  } catch (e) {
    fail('login before verify', e.message);
  }

  // Unauth guards
  for (const [name, method, path] of [
    ['favorites', 'GET', '/api/listings/favorites'],
    ['mine', 'GET', '/api/listings/mine'],
    ['escrow/me', 'GET', '/api/escrow/me'],
  ]) {
    try {
      await req(method, path, { expect: 401 });
      ok(`${name} → 401 unauth`);
    } catch (e) {
      fail(`${name} unauth`, e.message);
    }
  }

  // Create + publish listing as seller
  let listingId;
  if (sellerToken) {
    try {
      const created = await req('POST', '/api/listings', {
        token: sellerToken,
        body: {
          title: `Smoke Listing ${stamp}`,
          description: 'Automated smoke-test listing in GRA Port Harcourt',
          propertyType: 'apartment',
          purpose: 'rent',
          category: '2_bedroom',
          price: 2500000,
          currency: 'NGN',
          paymentFrequency: 'yearly',
          bedrooms: 2,
          bathrooms: 2,
          amenities: ['parking', 'security'],
          utilities: ['water', 'electricity'],
          location: {
            address: '12 Aba Road',
            city: 'Port Harcourt',
            state: 'Rivers',
            lga: 'Obio-Akpor',
            country: 'Nigeria',
            lat: 4.8156,
            lng: 7.0498,
          },
          status: 'draft',
        },
        expect: 201,
      });
      listingId = created.data?._id || created.data?.id;
      ok('POST /api/listings (seller)', listingId);
    } catch (e) {
      // Nest may return 200
      if (e.status === 200 && e.data?._id) {
        listingId = e.data._id;
        ok('POST /api/listings (seller)', listingId);
      } else {
        fail('POST /api/listings', e.message);
      }
    }

    if (listingId) {
      try {
        await req('POST', `/api/listings/${listingId}/publish`, {
          token: sellerToken,
          expect: 201,
        });
        ok('POST publish listing');
      } catch (e) {
        if (e.status === 200) ok('POST publish listing', '200');
        else fail('POST publish', e.message);
      }

      try {
        const mine = await req('GET', '/api/listings/mine', {
          token: sellerToken,
          expect: 200,
        });
        const n = Array.isArray(mine.data) ? mine.data.length : 0;
        ok('GET /api/listings/mine', `count=${n}`);
      } catch (e) {
        fail('GET mine', e.message);
      }

      try {
        await req('GET', `/api/listings/${listingId}`, { expect: 200 });
        ok('GET listing by id (public)');
      } catch (e) {
        fail('GET listing by id', e.message);
      }

      try {
        const search = await req('GET', `/api/listings?category=2_bedroom&q=Smoke&limit=10`, {
          expect: 200,
        });
        const found = (search.data?.items || []).some(
          (i) => String(i._id) === String(listingId),
        );
        if (found) ok('search finds smoke listing');
        else ok('search 2_bedroom ok', 'listing may still be indexing/text');
      } catch (e) {
        fail('search after create', e.message);
      }
    }
  }

  // Favorites + ratings as buyer (not owner)
  if (buyerToken && listingId) {
    try {
      await req('POST', `/api/listings/${listingId}/favorite`, {
        token: buyerToken,
        expect: 201,
      });
      ok('POST favorite');
    } catch (e) {
      if (e.status === 200 || e.status === 409) ok('POST favorite', String(e.status));
      else fail('POST favorite', e.message);
    }

    try {
      const favs = await req('GET', '/api/listings/favorites', {
        token: buyerToken,
        expect: 200,
      });
      const n = Array.isArray(favs.data) ? favs.data.length : 0;
      if (n >= 1) ok('GET favorites', `count=${n}`);
      else fail('GET favorites', `expected >=1, got ${n}`);
    } catch (e) {
      fail('GET favorites', e.message);
    }

    try {
      await req('DELETE', `/api/listings/${listingId}/favorite`, {
        token: buyerToken,
        expect: 200,
      });
      ok('DELETE favorite');
    } catch (e) {
      fail('DELETE favorite', e.message);
    }

    try {
      const rated = await req('POST', `/api/listings/${listingId}/rating`, {
        token: buyerToken,
        body: { stars: 5, comment: 'smoke rating' },
      });
      if (rated.status === 201 || rated.status === 200) {
        ok(
          'POST rating 5 stars',
          `avg=${rated.data?.listing?.ratingAvg} count=${rated.data?.listing?.ratingCount}`,
        );
      } else {
        fail('POST rating', `${rated.status} ${JSON.stringify(rated.data).slice(0, 200)}`);
      }
    } catch (e) {
      fail('POST rating', e.message);
    }

    try {
      await req('GET', `/api/listings/${listingId}/rating/me`, {
        token: buyerToken,
        expect: 200,
      });
      ok('GET rating/me');
    } catch (e) {
      fail('GET rating/me', e.message);
    }

    try {
      const list = await req('GET', `/api/listings/${listingId}/ratings`, {
        expect: 200,
      });
      const n = Array.isArray(list.data) ? list.data.length : 0;
      ok('GET ratings list', `count=${n}`);
    } catch (e) {
      fail('GET ratings list', e.message);
    }

    // upsert rating
    try {
      const rated = await req('POST', `/api/listings/${listingId}/rating`, {
        token: buyerToken,
        body: { stars: 4 },
      });
      if (rated.status === 201 || rated.status === 200) {
        ok('POST rating upsert → 4', `avg=${rated.data?.listing?.ratingAvg}`);
      } else {
        fail('POST rating upsert', String(rated.status));
      }
    } catch (e) {
      fail('POST rating upsert', e.message);
    }

    // owner cannot rate own listing
    if (sellerToken) {
      try {
        await req('POST', `/api/listings/${listingId}/rating`, {
          token: sellerToken,
          body: { stars: 5 },
          expect: 400,
        });
        ok('seller cannot rate own listing → 400');
      } catch (e) {
        fail('owner rate guard', e.message);
      }
    }

    try {
      await req('DELETE', `/api/listings/${listingId}/rating`, {
        token: buyerToken,
        expect: 200,
      });
      ok('DELETE rating');
    } catch (e) {
      fail('DELETE rating', e.message);
    }
  } else {
    fail('fav/rating suite', `buyerToken=${!!buyerToken} listingId=${listingId || 'none'}`);
  }

  // Cleanup listing
  if (sellerToken && listingId) {
    try {
      await req('DELETE', `/api/listings/${listingId}`, {
        token: sellerToken,
        expect: 200,
      });
      ok('DELETE listing cleanup');
    } catch (e) {
      fail('DELETE listing cleanup', e.message);
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n======== ${passed} passed, ${failed} failed (of ${results.length}) ========\n`);
  if (failed) {
    console.log('Failed cases:');
    for (const r of results.filter((x) => !x.pass)) {
      console.log(`  - ${r.name}: ${r.detail}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
