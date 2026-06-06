import axios from 'axios';
import { z } from 'zod';

const USER_AGENT = 'mcp-osrs - https://github.com/jayarrowz/mcp-osrs';

export const pricesApiClient = axios.create({
  baseURL: 'https://prices.runescape.wiki/api/v1/osrs',
  headers: { 'User-Agent': USER_AGENT },
});

export interface ItemMapping {
  id: number;
  name: string;
  examine?: string;
  members: boolean;
  lowalch?: number;
  limit?: number;
  value: number;
  highalch?: number;
  icon: string;
}

let mappingCache: ItemMapping[] | null = null;

export function clearCache(): void {
  mappingCache = null;
}

async function ensureMapping(): Promise<ItemMapping[]> {
  if (mappingCache) return mappingCache;
  const response = await pricesApiClient.get('/mapping');
  mappingCache = response.data;
  return mappingCache!;
}

function scoreItem(item: ItemMapping, query: string): number {
  const name = item.name.toLowerCase();
  const q = query.toLowerCase();
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 60;
  return 0;
}

export async function searchItems(
  query: string,
  page: number = 1,
  pageSize: number = 20,
): Promise<{
  results: ItemMapping[];
  pagination: {
    page: number;
    pageSize: number;
    totalResults: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}> {
  const items = await ensureMapping();
  const scored = items
    .map(item => ({ item, score: scoreItem(item, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));

  const totalResults = scored.length;
  const totalPages = Math.ceil(totalResults / pageSize);
  const startIndex = (page - 1) * pageSize;
  const paginatedResults = scored.slice(startIndex, startIndex + pageSize).map(s => s.item);

  return {
    results: paginatedResults,
    pagination: {
      page,
      pageSize,
      totalResults,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export async function getLatest(itemId: number): Promise<any> {
  const response = await pricesApiClient.get('/latest', { params: { id: itemId } });
  return response.data;
}

export async function getTimeSeries(itemId: number, timestep: string): Promise<any> {
  const response = await pricesApiClient.get('/timeseries', { params: { id: itemId, timestep } });
  return response.data;
}

export const GeLatestSchema = z.object({
  itemId: z.number().int().positive().describe("The item ID to get the latest price for"),
});

export const SearchGeItemsSchema = z.object({
  query: z.string().min(1).describe("Search term to find items by name"),
  page: z.number().int().min(1).optional().default(1).describe("Page number for pagination"),
  // Default pageSize of 20 reduces the need for paginated round-trips on broad queries
  // without being wasteful for precise queries that return few results.
  pageSize: z.number().int().min(1).max(100).optional().default(20).describe("Number of results per page"),
});

export const GeTimeSeriesSchema = z.object({
  itemId: z.number().int().positive().describe("The item ID to get the time series for"),
  timestep: z.enum(['5m', '1h', '6h', '24h']).describe("Time interval between data points"),
});
