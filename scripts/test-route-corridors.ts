import { getPathCities, riderMatchesRide, validatePickupStops } from '../src/services/routeCorridors';

// Bareilly → Delhi path should include Moradabad
const path = getPathCities('Bareilly', 'Delhi');
console.log('bareilly-delhi intermediates:', path.intermediateCities);
console.assert(path.intermediateCities.includes('Moradabad'), 'Moradabad on path');

const stops = validatePickupStops('Bareilly', 'Delhi', ['Moradabad']);
console.assert(stops.ok && stops.pickupStops.includes('Moradabad'), 'valid stop');

const ride = {
  fromCity: 'Bareilly',
  toCity: 'Delhi',
  pickupStops: ['Bareilly', 'Moradabad'],
};
console.assert(riderMatchesRide(ride, 'Moradabad', 'Delhi') === 'viaStop', 'via stop match');
console.assert(riderMatchesRide(ride, 'Moradabad', 'Ghaziabad') === null, 'no partial dest');
console.assert(riderMatchesRide(ride, 'Bareilly', 'Delhi') === 'exact', 'exact match');
console.log('route corridor tests passed');
