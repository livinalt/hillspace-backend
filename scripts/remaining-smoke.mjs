/**
 * Smoke tests for remaining modules: waitlist, users, bookings, messages,
 * notifications, reports, verification.
 * Usage: BASE_URL=http://localhost:3000 node scripts/remaining-smoke.mjs
 */
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const stamp = Date.now();
const password = 'SmokeTest123!';

const results = [];
const ok = (name, detail = '') => {
  results.push({ name, pass: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
};
const fail = (name, detail = '') => {
  results.push({ name, pass: false, detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function req(method, path, { token, body, expect, formData } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: formData
      ? formData
      : body !== undefined
        ? JSON.stringify(body)
        : undefined,
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
      `expected ${expect}, got ${res.status}: ${JSON.stringify(data).slice(0, 350)}`,
    );
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return { status: res.status, data };
}

async function register(email, role, phoneTail) {
  return req('POST', '/api/auth/register', {
    body: {
      firstName: 'Mod',
      lastName: role,
      email,
      phone: `+23471${phoneTail}`,
      password,
      role,
    },
  });
}

function tinyPng() {
  // 1x1 PNG
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
}

async function main() {
  console.log(`\nRemaining-modules smoke → ${BASE}\n`);

  // ── Waitlist (public) ──────────────────────────────────────
  try {
    const created = await req('POST', '/api/waitlist', {
      body: {
        fullName: `Smoke User ${stamp}`,
        email: `waitlist.${stamp}@hillspace.test`,
        city: 'Lagos',
        persona: 'renter',
        phone: '+2348000000001',
      },
    });
    if ([200, 201].includes(created.status)) ok('waitlist POST join');
    else fail('waitlist POST', `${created.status} ${JSON.stringify(created.data).slice(0, 200)}`);
  } catch (e) {
    fail('waitlist POST', e.message);
  }

  try {
    const count = await req('GET', '/api/waitlist/count', { expect: 200 });
    ok('waitlist GET count', `total=${count.data?.total ?? '?'}`);
  } catch (e) {
    fail('waitlist GET count', e.message);
  }

  try {
    await req('GET', '/api/waitlist', { expect: 401 });
    ok('waitlist admin list → 401 unauth');
  } catch (e) {
    // might be 403 depending on guards
    if (e.status === 403) ok('waitlist admin list → 403');
    else fail('waitlist admin list unauth', e.message);
  }

  // ── Auth fixtures ──────────────────────────────────────────
  let buyerToken;
  let sellerToken;
  let buyerId;
  let sellerId;

  try {
    const buyer = await register(
      `mod.buyer.${stamp}@hillspace.test`,
      'buyer',
      `${String(stamp).slice(-8)}`,
    );
    if ([200, 201].includes(buyer.status) && buyer.data?.accessToken) {
      buyerToken = buyer.data.accessToken;
      buyerId = buyer.data.user?.id || buyer.data.user?._id;
      ok('register buyer');
    } else fail('register buyer', `${buyer.status}`);
  } catch (e) {
    fail('register buyer', e.message);
  }

  try {
    const seller = await register(
      `mod.seller.${stamp}@hillspace.test`,
      'seller',
      `${String(stamp + 1).slice(-8)}`,
    );
    if ([200, 201].includes(seller.status) && seller.data?.accessToken) {
      sellerToken = seller.data.accessToken;
      sellerId = seller.data.user?.id || seller.data.user?._id;
      ok('register seller');
    } else fail('register seller', `${seller.status}`);
  } catch (e) {
    fail('register seller', e.message);
  }

  // ── Users ──────────────────────────────────────────────────
  if (buyerToken) {
    try {
      const me = await req('GET', '/api/users/me', { token: buyerToken, expect: 200 });
      ok('users GET /me', me.data?.email || me.data?.firstName);
    } catch (e) {
      fail('users GET /me', e.message);
    }

    try {
      await req('PATCH', '/api/users/me', {
        token: buyerToken,
        body: { firstName: 'Smoke', lastName: 'Buyer' },
        expect: 200,
      });
      ok('users PATCH /me');
    } catch (e) {
      fail('users PATCH /me', e.message);
    }

    try {
      await req('PATCH', '/api/users/me/settings', {
        token: buyerToken,
        body: { notificationsEnabled: true, theme: 'system' },
        expect: 200,
      });
      ok('users PATCH /me/settings');
    } catch (e) {
      fail('users PATCH /me/settings', e.message);
    }

    try {
      await req('PUT', '/api/users/me/availability', {
        token: buyerToken,
        body: {
          slots: [{ day: 'Mon', from: '09:00', to: '17:00' }],
          repeatAllDays: false,
        },
        expect: 200,
      });
      ok('users PUT /me/availability');
    } catch (e) {
      fail('users PUT /me/availability', e.message);
    }

    try {
      const fd = new FormData();
      fd.append(
        'avatar',
        new Blob([tinyPng()], { type: 'image/png' }),
        'avatar.png',
      );
      const av = await req('POST', '/api/users/me/avatar', {
        token: buyerToken,
        formData: fd,
      });
      if ([200, 201].includes(av.status)) ok('users POST /me/avatar');
      else fail('users avatar', `${av.status} ${JSON.stringify(av.data).slice(0, 200)}`);
    } catch (e) {
      fail('users avatar', e.message);
    }
  }

  // ── Listing fixture (seller) ───────────────────────────────
  let listingId;
  if (sellerToken) {
    try {
      const created = await req('POST', '/api/listings', {
        token: sellerToken,
        body: {
          title: `Mod Smoke Listing ${stamp}`,
          description: 'For bookings/messages/verification smoke',
          propertyType: 'apartment',
          purpose: 'rent',
          category: '2_bedroom',
          price: 1500000,
          bedrooms: 2,
          bathrooms: 1,
          location: {
            address: '2 Module Road',
            city: 'Lagos',
            state: 'Lagos',
            country: 'Nigeria',
          },
        },
      });
      listingId = created.data?._id || created.data?.id;
      if (!listingId) throw new Error(`${created.status}`);
      await req('POST', `/api/listings/${listingId}/publish`, { token: sellerToken });
      ok('listing fixture published', listingId);
    } catch (e) {
      fail('listing fixture', e.message);
    }
  }

  // ── Bookings ───────────────────────────────────────────────
  let bookingId;
  if (buyerToken && listingId) {
    // date a week out
    const d = new Date(Date.now() + 7 * 86400000);
    const date = d.toISOString().slice(0, 10);
    try {
      const created = await req('POST', '/api/bookings', {
        token: buyerToken,
        body: {
          listingId,
          date,
          time: '12:00',
          inspectionType: 'physical',
          note: 'smoke booking',
        },
      });
      bookingId = created.data?._id || created.data?.id;
      if ([200, 201].includes(created.status) && bookingId) {
        ok('bookings POST create', bookingId);
      } else {
        fail('bookings create', `${created.status} ${JSON.stringify(created.data).slice(0, 250)}`);
      }
    } catch (e) {
      fail('bookings create', e.message);
    }

    try {
      const mine = await req('GET', '/api/bookings/me', {
        token: buyerToken,
        expect: 200,
      });
      const n = Array.isArray(mine.data) ? mine.data.length : 0;
      if (n >= 1) ok('bookings GET /me', `count=${n}`);
      else fail('bookings GET /me', `count=${n}`);
    } catch (e) {
      fail('bookings GET /me', e.message);
    }

    if (bookingId && sellerToken) {
      try {
        const confirmed = await req('PATCH', `/api/bookings/${bookingId}/confirm`, {
          token: sellerToken,
        });
        if ([200, 201].includes(confirmed.status)) ok('bookings confirm (seller/agent)');
        else fail('bookings confirm', `${confirmed.status} ${JSON.stringify(confirmed.data).slice(0, 200)}`);
      } catch (e) {
        fail('bookings confirm', e.message);
      }
    }

    // separate cancel booking
    try {
      const d2 = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
      const created = await req('POST', '/api/bookings', {
        token: buyerToken,
        body: {
          listingId,
          date: d2,
          time: '15:00',
          inspectionType: 'online',
        },
      });
      const bid = created.data?._id || created.data?.id;
      const cancelled = await req('PATCH', `/api/bookings/${bid}/cancel`, {
        token: buyerToken,
      });
      if ([200, 201].includes(cancelled.status)) ok('bookings cancel');
      else fail('bookings cancel', `${cancelled.status}`);
    } catch (e) {
      fail('bookings cancel', e.message);
    }
  }

  // ── Messages ───────────────────────────────────────────────
  let conversationId;
  if (buyerToken && sellerId) {
    try {
      const conv = await req('POST', '/api/messages/conversations', {
        token: buyerToken,
        body: {
          participantId: sellerId,
          ...(listingId ? { listingId } : {}),
        },
      });
      conversationId = conv.data?._id || conv.data?.id;
      if ([200, 201].includes(conv.status) && conversationId) {
        ok('messages create conversation', conversationId);
      } else {
        fail('messages create conversation', `${conv.status} ${JSON.stringify(conv.data).slice(0, 250)}`);
      }
    } catch (e) {
      fail('messages create conversation', e.message);
    }

    try {
      const list = await req('GET', '/api/messages/conversations', {
        token: buyerToken,
        expect: 200,
      });
      const n = Array.isArray(list.data) ? list.data.length : 0;
      if (n >= 1) ok('messages list conversations', `count=${n}`);
      else fail('messages list conversations', `count=${n}`);
    } catch (e) {
      fail('messages list conversations', e.message);
    }

    if (conversationId) {
      try {
        await req('POST', `/api/messages/conversations/${conversationId}`, {
          token: buyerToken,
          body: { body: 'Is this still available? (smoke)' },
        });
        ok('messages send');
      } catch (e) {
        fail('messages send', e.message);
      }

      try {
      const thread = await req('GET', `/api/messages/conversations/${conversationId}`, {
        token: buyerToken,
        expect: 200,
      });
      const msgs = thread.data?.messages ?? thread.data;
      const n = Array.isArray(msgs) ? msgs.length : 0;
      if (n >= 1) ok('messages get thread', `msgs=${n}`);
      else fail('messages get thread', `msgs=${n} raw=${JSON.stringify(thread.data).slice(0, 180)}`);
      } catch (e) {
        fail('messages get thread', e.message);
      }

      try {
        await req('POST', `/api/messages/conversations/${conversationId}/read`, {
          token: sellerToken,
          expect: 201,
        });
        ok('messages mark read');
      } catch (e) {
        if (e.status === 200) ok('messages mark read', '200');
        else fail('messages mark read', e.message);
      }
    }
  }

  // ── Notifications ──────────────────────────────────────────
  if (sellerToken) {
    try {
      const list = await req('GET', '/api/notifications', {
        token: sellerToken,
        expect: 200,
      });
      const n = Array.isArray(list.data) ? list.data.length : 0;
      ok('notifications GET list', `count=${n}`);
      if (n >= 1) {
        const id = list.data[0]._id || list.data[0].id;
        try {
          await req('PATCH', `/api/notifications/${id}/read`, {
            token: sellerToken,
            expect: 200,
          });
          ok('notifications mark read');
        } catch (e) {
          fail('notifications mark read', e.message);
        }
      }
      try {
        await req('POST', '/api/notifications/read-all', {
          token: sellerToken,
          expect: 201,
        });
        ok('notifications read-all');
      } catch (e) {
        if (e.status === 200) ok('notifications read-all', '200');
        else fail('notifications read-all', e.message);
      }
    } catch (e) {
      fail('notifications list', e.message);
    }
  }

  // ── Reports ────────────────────────────────────────────────
  if (sellerToken) {
    try {
      const sales = await req('GET', '/api/reports/sales', {
        token: sellerToken,
        expect: 200,
      });
      ok(
        'reports GET /sales',
        `active=${sales.data?.activeProperties ?? '?'} deals=${sales.data?.dealsClosed ?? '?'}`,
      );
    } catch (e) {
      fail('reports sales', e.message);
    }
  }
  if (buyerToken) {
    try {
      await req('GET', '/api/reports/sales', { token: buyerToken, expect: 403 });
      ok('reports sales buyer → 403');
    } catch (e) {
      if (e.status === 403) ok('reports sales buyer → 403');
      else fail('reports sales buyer role', e.message);
    }
  }

  // ── Verification ───────────────────────────────────────────
  if (buyerToken) {
    try {
      const fd = new FormData();
      fd.append('type', 'kyc');
      fd.append('category', 'individual');
      fd.append('fullName', 'Smoke Buyer');
      fd.append(
        'documents',
        new Blob([tinyPng()], { type: 'image/png' }),
        'id.png',
      );
      const submitted = await req('POST', '/api/verification', {
        token: buyerToken,
        formData: fd,
      });
      if ([200, 201].includes(submitted.status)) ok('verification POST kyc');
      else fail('verification POST', `${submitted.status} ${JSON.stringify(submitted.data).slice(0, 250)}`);
    } catch (e) {
      fail('verification POST', e.message);
    }

    try {
      const mine = await req('GET', '/api/verification/me', {
        token: buyerToken,
        expect: 200,
      });
      const n = Array.isArray(mine.data) ? mine.data.length : 0;
      if (n >= 1) ok('verification GET /me', `count=${n}`);
      else fail('verification GET /me', `count=${n}`);
    } catch (e) {
      fail('verification GET /me', e.message);
    }

    try {
      await req('GET', '/api/verification/pending', {
        token: buyerToken,
        expect: 403,
      });
      ok('verification pending buyer → 403');
    } catch (e) {
      if (e.status === 403) ok('verification pending buyer → 403');
      else fail('verification pending role', e.message);
    }
  }

  // cleanup listing
  if (sellerToken && listingId) {
    try {
      await req('DELETE', `/api/listings/${listingId}`, { token: sellerToken });
      ok('cleanup listing');
    } catch (e) {
      ok('cleanup listing skipped', e.message.slice(0, 80));
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n======== ${passed} passed, ${failed} failed (of ${results.length}) ========\n`);
  if (failed) {
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
