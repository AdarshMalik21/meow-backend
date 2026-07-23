/**
 * Local test: en-route pickup stops (Bareilly → Delhi, rider Moradabad → Delhi)
 * Run: npx tsx scripts/test-pickup-stops-local.ts
 * Requires backend on http://localhost:3001
 */
const BASE = process.env.API_BASE || 'http://localhost:3001';

async function api<T>(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {}
): Promise<{ status: number; json: T }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, json };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`PASS: ${msg}`);
}

async function main() {
  console.log(`Testing against ${BASE}\n`);

  const health = await api<{ ok: boolean }>('/health');
  assert(health.status === 200 && health.json.ok, 'health check');

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 2);
  const date = tomorrow.toISOString().slice(0, 10);

  const driverLogin = await api<{ token: string }>('/auth/dev-login', {
    method: 'POST',
    body: { phone: '9777777001', name: 'Local Driver' },
  });
  assert(driverLogin.status === 200, 'driver dev login');
  const dToken = driverLogin.json.token;

  await api('/users/driver-profile', {
    method: 'PUT',
    token: dToken,
    body: { carModel: 'Swift', carNumber: 'UP16LOCAL01' },
  });

  const pathRes = await api<{
    corridorFound: boolean;
    intermediateCities: string[];
  }>(`/routes/path?fromCity=Bareilly&toCity=Delhi`, { token: dToken });
  assert(pathRes.status === 200, 'GET /routes/path');
  assert(pathRes.json.corridorFound, 'corridor found for Bareilly→Delhi');
  assert(
    pathRes.json.intermediateCities.includes('Moradabad'),
    'Moradabad in intermediate cities'
  );
  console.log('  intermediates:', pathRes.json.intermediateCities.join(' → '));

  const post = await api<{ ride: { id: string; pickupStops: string[] } }>('/rides', {
    method: 'POST',
    token: dToken,
    body: {
      fromCity: 'Bareilly',
      toCity: 'Delhi',
      date,
      time: '09:00',
      pickupStops: ['Moradabad'],
      totalSeats: 3,
    },
  });
  assert(post.status === 201, 'POST ride with Moradabad pickup stop');
  const rideId = post.json.ride.id;
  assert(post.json.ride.pickupStops.includes('Moradabad'), 'ride stores Moradabad stop');
  console.log('  rideId:', rideId, 'stops:', post.json.ride.pickupStops.join(', '));

  const riderLogin = await api<{ token: string }>('/auth/dev-login', {
    method: 'POST',
    body: { phone: '9777777002', name: 'Local Rider' },
  });
  const rToken = riderLogin.json.token;

  const search = await api<{
    rides: Array<{ id: string; matchType?: string; fromCity: string; toCity: string }>;
  }>(`/rides?fromCity=Moradabad&toCity=Delhi&date=${date}`, { token: rToken });
  assert(search.status === 200, 'rider search Moradabad→Delhi');
  const found = search.json.rides.find((r) => r.id === rideId);
  assert(!!found, 'rider finds driver ride via pickup stop');
  assert(found!.matchType === 'viaStop', 'matchType is viaStop');
  console.log('  matchType:', found!.matchType, 'driver route:', found!.fromCity, '→', found!.toCity);

  const noMatch = await api<{ rides: unknown[] }>(
    `/rides?fromCity=Rampur&toCity=Delhi&date=${date}`,
    { token: rToken }
  );
  const rampurFound = noMatch.json.rides.some(
    (r: { id?: string }) => (r as { id: string }).id === rideId
  );
  assert(!rampurFound, 'Rampur→Delhi does NOT match (Rampur not selected as stop)');

  const book = await api<{ booking: { riderFromCity: string; riderToCity: string } }>(
    `/rides/${rideId}/book`,
    {
      method: 'POST',
      token: rToken,
      body: { riderFromCity: 'Moradabad', riderToCity: 'Delhi' },
    }
  );
  assert(book.status === 201, 'book with rider segment');
  assert(book.json.booking.riderFromCity === 'Moradabad', 'booking stores riderFromCity');
  assert(book.json.booking.riderToCity === 'Delhi', 'booking stores riderToCity');

  await api(`/rides/${rideId}/status`, {
    method: 'PATCH',
    token: dToken,
    body: { status: 'CANCELLED' },
  });
  console.log('PASS: cleanup — ride cancelled');

  console.log('\nAll local pickup-stop tests passed.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
