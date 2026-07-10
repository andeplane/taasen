import { describe, expect, it } from 'vitest';
import { finnSoldUrl, googleMapsUrl, streetViewUrl } from './links';
import { makeHouse } from './test/factory';

const h = makeHouse({ lat: 59.95975, lon: 10.74964 });

describe('links', () => {
  it('builds a Google Maps search URL', () => {
    expect(googleMapsUrl(h)).toBe('https://www.google.com/maps/search/?api=1&query=59.95975,10.74964');
  });
  it('builds a Street View URL', () => {
    expect(streetViewUrl(h)).toBe('https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=59.95975,10.74964');
  });
  it('builds the Finn solgt-eiendom map URL with 5-decimal coordinates', () => {
    expect(finnSoldUrl(h)).toBe('https://www.finn.no/map/realestate/sold?lat=59.95975&lon=10.74964&results=true&zoom=16');
  });
  it('rounds long coordinates to 5 decimals for Finn', () => {
    expect(finnSoldUrl(makeHouse({ lat: 59.956494430003, lon: 10.748486693822 })))
      .toBe('https://www.finn.no/map/realestate/sold?lat=59.95649&lon=10.74849&results=true&zoom=16');
  });
});
