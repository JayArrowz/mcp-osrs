import { jest } from '@jest/globals';
import {
  pricesApiClient,
  searchItems,
  getLatest,
  getTimeSeries,
  clearCache,
  GeLatestSchema,
  SearchGeItemsSchema,
  GeTimeSeriesSchema,
} from './ge-prices.js';

const mockItems = [
  { id: 4151, name: 'Abyssal whip', members: true, limit: 10, highalch: 180000, lowalch: 120000, value: 150000, icon: 'abyssal_whip.png', examine: 'A weapon from the abyss.' },
  { id: 2, name: 'Cannonball', members: true, limit: 3000, highalch: 12, lowalch: 8, value: 10, icon: 'cannonball.png', examine: 'Ammo for the Dwarf Cannon.' },
  { id: 3, name: 'Abyssal dagger', members: true, limit: 10, highalch: 30000, lowalch: 20000, value: 25000, icon: 'abyssal_dagger.png', examine: 'A dagger from the abyss.' },
  { id: 4, name: 'Dragon scimitar', members: true, limit: 10, highalch: 60000, lowalch: 40000, value: 50000, icon: 'dragon_scimitar.png', examine: 'A vicious curved sword.' },
  { id: 5, name: 'Abyssal dagger (p)', members: true, limit: 10, highalch: 30000, lowalch: 20000, value: 25000, icon: 'abyssal_dagger_p.png', examine: 'A dagger from the abyss, poisoned.' },
];

const mockLatest = { data: { '4151': { high: 1850000, highTime: 1749200000, low: 1820000, lowTime: 1749200000 } } };
const mockTimeSeries = { data: [{ high: 1850000, highTime: 1749200000, low: 1820000, lowTime: 1749200000 }], timestamp: 1615733400 };

let mockedGet: jest.SpyInstance;

beforeEach(() => {
  clearCache();
  mockedGet = jest.spyOn(pricesApiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/mapping') return { data: mockItems };
    if (url === '/latest') return { data: mockLatest };
    if (url === '/timeseries') return { data: mockTimeSeries };
    return { data: {} };
  });
});

afterEach(() => {
  mockedGet.mockRestore();
});

describe('searchItems', () => {
  it('finds items matching the query by substring', async () => {
    const result = await searchItems('abyssal');
    expect(result.results.length).toBe(3);
    const names = result.results.map(r => r.name);
    expect(names).toContain('Abyssal whip');
    expect(names).toContain('Abyssal dagger');
    expect(names).toContain('Abyssal dagger (p)');
    expect(names.length).toBe(3);
  });

  it('is case-insensitive', async () => {
    const upper = await searchItems('ABYSSAL');
    const lower = await searchItems('abyssal');
    expect(upper.results.length).toBe(lower.results.length);
    expect(upper.results[0].id).toBe(lower.results[0].id);
  });

  it('returns exact match first', async () => {
    const result = await searchItems('Dragon scimitar');
    expect(result.results[0].name).toBe('Dragon scimitar');
  });

  it('sorts results by score descending, then alphabetically', async () => {
    const result = await searchItems('abyssal');
    const names = result.results.map(r => r.name);
    expect(names).toEqual(['Abyssal dagger', 'Abyssal dagger (p)', 'Abyssal whip']);
  });

  it('paginates results correctly', async () => {
    const page1 = await searchItems('abyssal', 1, 2);
    expect(page1.results.length).toBe(2);
    expect(page1.pagination.page).toBe(1);
    expect(page1.pagination.totalResults).toBe(3);
    expect(page1.pagination.hasNextPage).toBe(true);

    const page2 = await searchItems('abyssal', 2, 2);
    expect(page2.results.length).toBe(1);
    expect(page2.pagination.page).toBe(2);
    expect(page2.pagination.hasPreviousPage).toBe(true);
    expect(page2.pagination.hasNextPage).toBe(false);
  });

  it('returns empty results for a query with no matches', async () => {
    const result = await searchItems('zzz_nonexistent');
    expect(result.results).toHaveLength(0);
    expect(result.pagination.totalResults).toBe(0);
  });

  it('caches the mapping across multiple calls', async () => {
    mockedGet.mockClear();
    await searchItems('abyssal');
    await searchItems('dragon');
    await searchItems('cannon');
    const mappingCalls = mockedGet.mock.calls.filter(([url]: [string]) => url === '/mapping');
    expect(mappingCalls).toHaveLength(1);
  });

  it('returns item metadata fields', async () => {
    const result = await searchItems('cannonball');
    expect(result.results[0]).toMatchObject({
      id: 2,
      name: 'Cannonball',
      members: true,
      limit: 3000,
      highalch: 12,
      lowalch: 8,
      value: 10,
    });
  });
});

describe('getLatest', () => {
  it('requests /latest with the given item ID', async () => {
    await getLatest(4151);
    expect(mockedGet).toHaveBeenCalledWith('/latest', { params: { id: 4151 } });
  });

  it('returns price data for a known item', async () => {
    const result = await getLatest(4151);
    expect(result).toEqual(mockLatest);
    expect(result.data['4151'].high).toBe(1850000);
    expect(result.data['4151'].low).toBe(1820000);
    expect(result.data['4151']).toHaveProperty('highTime');
    expect(result.data['4151']).toHaveProperty('lowTime');
  });
});

describe('getTimeSeries', () => {
  it('requests /timeseries with id and timestep', async () => {
    await getTimeSeries(4151, '5m');
    expect(mockedGet).toHaveBeenCalledWith('/timeseries', { params: { id: 4151, timestep: '5m' } });
  });

  it('returns time series data array', async () => {
    const result = await getTimeSeries(4151, '5m');
    expect(result).toEqual(mockTimeSeries);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data[0]).toHaveProperty('high');
    expect(result.data[0]).toHaveProperty('low');
  });
});

describe('User-Agent header', () => {
  it('includes a custom User-Agent on the axios client', () => {
    const headers = pricesApiClient.defaults.headers;
    const userAgent = headers['User-Agent'] || (headers.common && headers.common['User-Agent']);
    expect(userAgent).toBeTruthy();
    expect(userAgent).toContain('mcp-osrs');
  });
});

describe('Zod schemas', () => {
  it('GeLatestSchema accepts valid input', () => {
    const result = GeLatestSchema.parse({ itemId: 4151 });
    expect(result.itemId).toBe(4151);
  });

  it('GeLatestSchema rejects non-positive itemId', () => {
    expect(() => GeLatestSchema.parse({ itemId: -1 })).toThrow();
    expect(() => GeLatestSchema.parse({ itemId: 0 })).toThrow();
  });

  it('SearchGeItemsSchema applies defaults', () => {
    const result = SearchGeItemsSchema.parse({ query: 'whip' });
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it('SearchGeItemsSchema rejects empty query', () => {
    expect(() => SearchGeItemsSchema.parse({ query: '' })).toThrow();
  });

  it('GeTimeSeriesSchema accepts valid timesteps', () => {
    for (const ts of ['5m', '1h', '6h', '24h']) {
      expect(() => GeTimeSeriesSchema.parse({ itemId: 4151, timestep: ts })).not.toThrow();
    }
  });

  it('GeTimeSeriesSchema rejects invalid timestep', () => {
    expect(() => GeTimeSeriesSchema.parse({ itemId: 4151, timestep: '1d' })).toThrow();
  });
});
