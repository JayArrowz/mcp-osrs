#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from 'zod';
import axios from 'axios';
import { zodToJsonSchema } from 'zod-to-json-schema';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { getStats, getStatsByGamemode } from 'osrs-json-hiscores';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');

const responseToString = (response: any) => {
    const contentText = typeof response === 'string' ? response : JSON.stringify(response);
    return {
        content: [{ type: "text", text: contentText }]
    };
};

const osrsApiClient = axios.create({
    baseURL: 'https://oldschool.runescape.wiki/api.php',
    params: {
        format: 'json'
    }
});

const OsrsWikiSearchSchema = z.object({
    search: z.string().describe("The term to search for on the OSRS Wiki"),
    limit: z.number().int().min(1).max(50).optional().describe("Number of results to return (1-50)"),
    offset: z.number().int().min(0).optional().describe("Offset for pagination (0-based)")
});

const OsrsWikiGetPageInfoSchema = z.object({
    titles: z.string().describe("Comma-separated list of page titles to get info for (e.g., Dragon_scimitar,Abyssal_whip)")
});

const OsrsWikiParsePageSchema = z.object({
    page: z.string().describe("The exact title of the wiki page to parse (e.g., 'Dragon scimitar', 'Abyssal whip'). Case-sensitive.")
});

const FileSearchSchema = z.object({
    query: z.string().describe("The term to search for in the file"),
    page: z.number().int().min(1).optional().default(1).describe("Page number for pagination"),
    pageSize: z.number().int().min(1).max(100).optional().default(10).describe("Number of results per page")
});

const GenericFileSearchSchema = z.object({
    filename: z.string().describe("The filename to search in the data directory (e.g., 'varptypes.txt')"),
    query: z.string().describe("The term to search for in the file"),
    page: z.number().int().min(1).optional().default(1).describe("Page number for pagination"),
    pageSize: z.number().int().min(1).max(100).optional().default(10).describe("Number of results per page")
});

const FileDetailsSchema = z.object({
    filename: z.string().describe("The filename to get details for in the data directory")
});

const ListDataFilesSchema = z.object({
    fileType: z.string().optional().describe("Optional filter for file type (e.g., 'txt')")
});

const LookupPlayerSchema = z.object({
    playerName: z.string().describe("The RuneScape username to look up"),
    gamemode: z.enum(['main', 'ironman', 'hardcore', 'ultimate', 'deadman', 'seasonal']).optional().describe("Game mode to check (defaults to auto-detect)")
});

function convertZodToJsonSchema(schema: z.ZodType<any>) {
  const jsonSchema = zodToJsonSchema(schema);
  delete jsonSchema.$schema;
  delete jsonSchema.definitions;
  return {
    ...jsonSchema
  };
}

const server = new Server(
    {
        name: "mcp-osrs",
        version: "0.1.0" 
    },
    {
        capabilities: {
            tools: {}
        }
    }
);

/**
 * Search through a file for matching lines
 * @param filePath Path to the file to search
 * @param searchTerm Term to search for
 * @param page Page number for pagination
 * @param pageSize Number of results per page
 * @returns Object containing results and pagination info
 */
async function searchFile(filePath: string, searchTerm: string, page: number = 1, pageSize: number = 10): Promise<any> {
    //replace spaces with underscores
    searchTerm = searchTerm.replace(" ", "_");
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(filePath)) {
            reject(new Error(`File not found: ${filePath}`));
            return;
        }

        const results: {line: string, lineNumber: number}[] = [];
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let lineNumber = 0;
        
        rl.on('line', (line) => {
            lineNumber++;
            if (line.toLowerCase().includes(searchTerm.toLowerCase())) {
                results.push({ line, lineNumber });
            }
        });

        rl.on('close', () => {
            const totalResults = results.length;
            const totalPages = Math.ceil(totalResults / pageSize);
            const startIndex = (page - 1) * pageSize;
            const endIndex = startIndex + pageSize;
            const paginatedResults = results.slice(startIndex, endIndex);

            // Process the results to extract key-value pairs if possible
            const formattedResults = paginatedResults.map(result => {
                // Try to format as key-value pair (common for ID data files)
                const parts = result.line.split(/\s+/);
                if (parts.length >= 2) {
                    const id = parts[0];
                    const value = parts.slice(1).join(' ');
                    return {
                        ...result,
                        id,
                        value,
                        formatted: `${id}\t${value}`
                    };
                }
                return result;
            });

            resolve({
                results: formattedResults,
                pagination: {
                    page,
                    pageSize,
                    totalResults,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1
                }
            });
        });

        rl.on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Check if a file exists in the data directory
 * @param filename The filename to check
 * @returns Boolean indicating if the file exists
 */
function fileExists(filename: string): boolean {
    const filePath = path.join(DATA_DIR, filename);
    return fs.existsSync(filePath);
}

/**
 * Get data file details
 * @param filename The filename to get details for
 * @returns Object with file details
 */
function getFileDetails(filename: string): any {
    try {
        const filePath = path.join(DATA_DIR, filename);
        if (!fs.existsSync(filePath)) {
            return { exists: false };
        }

        const stats = fs.statSync(filePath);
        const lineCount = getFileLineCount(filePath);

        return {
            exists: true,
            size: stats.size,
            lineCount,
            created: stats.birthtime,
            lastModified: stats.mtime
        };
    } catch (error) {
        console.error(`Error getting file details for ${filename}:`, error);
        return { exists: false, error: 'Error getting file details' };
    }
}

/**
 * Get the number of lines in a file
 * @param filePath Path to the file
 * @returns Number of lines in the file
 */
function getFileLineCount(filePath: string): number {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return content.split('\n').length;
    } catch (error) {
        console.error(`Error counting lines in ${filePath}:`, error);
        return 0;
    }
}

/**
 * List all data files in the data directory
 * @param fileType Optional filter for file type
 * @returns Array of file names
 */
function listDataFiles(fileType?: string): string[] {
    try {
        const files = fs.readdirSync(DATA_DIR);
        
        if (fileType) {
            return files.filter(file => file.endsWith(`.${fileType}`));
        }
        
        return files;
    } catch (error) {
        console.error("Error listing data files:", error);
        return [];
    }
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "osrs_wiki_search",
                description: "Search the OSRS Wiki for pages matching a search term.",
                inputSchema: convertZodToJsonSchema(OsrsWikiSearchSchema),
            },
            {
                name: "osrs_wiki_get_page_info",
                description: "Get information about specific pages on the OSRS Wiki.",
                inputSchema: convertZodToJsonSchema(OsrsWikiGetPageInfoSchema),
            },
            {
                name: "osrs_wiki_parse_page",
                description: "Get the parsed HTML content of a specific OSRS Wiki page.",
                inputSchema: convertZodToJsonSchema(OsrsWikiParsePageSchema),
            },
            {
                name: "search_varptypes",
                description: "Search the varptypes.txt file for player variables (varps) that store player state and progress.",
                inputSchema: convertZodToJsonSchema(FileSearchSchema),
            },
            {
                name: "search_varbittypes",
                description: "Search the varbittypes.txt file for variable bits (varbits) that store individual bits from varps.",
                inputSchema: convertZodToJsonSchema(FileSearchSchema),
            },
            {
                name: "search_iftypes",
                description: "Search the iftypes.txt file for interface definitions used in the game's UI.",
                inputSchema: convertZodToJsonSchema(FileSearchSchema),
            },
            {
                name: "search_invtypes",
                description: "Search the invtypes.txt file for inventory type definitions in the game.",
                inputSchema: convertZodToJsonSchema(FileSearchSchema),
            },
            {
                name: "search_loctypes",
                description: "Search the loctypes.txt file for location/object type definitions in the game world.",
                inputSchema: convertZodToJsonSchema(FileSearchSchema),
            },
            {
                name: "search_npctypes",
                description: "Search the npctypes.txt file for NPC (non-player character) definitions.",
                inputSchema: convertZodToJsonSchema(FileSearchSchema),
            },
            {
                name: "search_objtypes",
                description: "Search the objtypes.txt file for object/item definitions in the game.",
                inputSchema: convertZodToJsonSchema(FileSearchSchema),
            },
            {
                name: "search_rowtypes",
                description: "Search the rowtypes.txt file for row definitions used in various interfaces.",
                inputSchema: convertZodToJsonSchema(FileSearchSchema),
            },
            {
                name: "search_seqtypes",
                description: "Search the seqtypes.txt file for animation sequence definitions.",
                inputSchema: convertZodToJsonSchema(FileSearchSchema),
            },
            {
                name: "search_soundtypes",
                description: "Search the soundtypes.txt file for sound effect definitions in the game.",
                inputSchema: convertZodToJsonSchema(FileSearchSchema),
            },
            {
                name: "search_spottypes",
                description: "Search the spottypes.txt file for spot animation (graphical effect) definitions.",
                inputSchema: convertZodToJsonSchema(FileSearchSchema),
            },
            {
                name: "search_spritetypes",
                description: "Search the spritetypes.txt file for sprite image definitions used in the interface.",
                inputSchema: convertZodToJsonSchema(FileSearchSchema),
            },
            {
                name: "search_tabletypes",
                description: "Search the tabletypes.txt file for interface tab definitions.",
                inputSchema: convertZodToJsonSchema(FileSearchSchema),
            },
            {
                name: "search_data_file",
                description: "Search any file in the data directory for matching entries.",
                inputSchema: convertZodToJsonSchema(GenericFileSearchSchema),
            },
            {
                name: "get_file_details",
                description: "Get details about a file in the data directory.",
                inputSchema: convertZodToJsonSchema(FileDetailsSchema),
            },
            {
                name: "list_data_files",
                description: "List available data files in the data directory.",
                inputSchema: convertZodToJsonSchema(ListDataFilesSchema),
            },
            {
                name: "lookup_player",
                description: "Look up an OSRS player's stats (skills, bosses, clue scrolls, and activities) from the official hiscores.",
                inputSchema: convertZodToJsonSchema(LookupPlayerSchema),
            },
        ]
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        switch (name) {
            case "osrs_wiki_search":
                const { search, limit = 10, offset = 0 } = OsrsWikiSearchSchema.parse(args);
                const searchResponse = await osrsApiClient.get('', {
                    params: {
                        action: 'query',
                        list: 'search',
                        srsearch: search,
                        srlimit: limit,
                        sroffset: offset,
                        srprop: 'snippet|titlesnippet|sectiontitle'
                    }
                });
                return responseToString(searchResponse.data);

            case "osrs_wiki_get_page_info":
                const { titles } = OsrsWikiGetPageInfoSchema.parse(args);
                const pageInfoResponse = await osrsApiClient.get('', {
                    params: {
                        action: 'query',
                        prop: 'info',
                        titles: titles
                    }
                });
                return responseToString(pageInfoResponse.data);

            case "osrs_wiki_parse_page":
                const { page } = OsrsWikiParsePageSchema.parse(args);
                const parseResponse = await osrsApiClient.get('', {
                    params: {
                        action: 'parse',
                        page: page,
                        prop: 'text',
                        formatversion: 2
                    }
                });
                return responseToString(parseResponse.data?.parse?.text || 'Page content not found.');

            case "search_varptypes":
            case "search_varbittypes":
            case "search_iftypes":
            case "search_invtypes":
            case "search_loctypes":
            case "search_npctypes":
            case "search_objtypes":
            case "search_rowtypes":
            case "search_seqtypes":
            case "search_soundtypes":
            case "search_spottypes":
            case "search_spritetypes":
            case "search_tabletypes":
                const { query, page: filePage = 1, pageSize: filePageSize = 10 } = FileSearchSchema.parse(args);
                const filename = `${name.replace('search_', '')}.txt`;
                const filePath = path.join(DATA_DIR, filename);
                
                if (!fileExists(filename)) {
                    return responseToString({ error: `${filename} not found in data directory` });
                }
                
                const fileResults = await searchFile(filePath, query, filePage, filePageSize);
                return responseToString(fileResults);

            case "search_data_file":
                const { filename: genericFilename, query: searchQuery, page: genericFilePage = 1, pageSize: genericFilePageSize = 10 } = GenericFileSearchSchema.parse(args);
                
                // Security check to prevent directory traversal
                if (genericFilename.includes('..') || genericFilename.includes('/') || genericFilename.includes('\\')) {
                    throw new Error('Invalid filename');
                }
                
                if (!fileExists(genericFilename)) {
                    return responseToString({ error: `${genericFilename} not found in data directory` });
                }
                
                const genericFilePath = path.join(DATA_DIR, genericFilename);
                const genericFileResults = await searchFile(genericFilePath, searchQuery, genericFilePage, genericFilePageSize);
                return responseToString(genericFileResults);

            case "get_file_details":
                const { filename: detailsFilename } = FileDetailsSchema.parse(args);
                
                // Security check to prevent directory traversal
                if (detailsFilename.includes('..') || detailsFilename.includes('/') || detailsFilename.includes('\\')) {
                    throw new Error('Invalid filename');
                }
                
                const details = getFileDetails(detailsFilename);
                return responseToString(details);

            case "list_data_files":
                const { fileType } = ListDataFilesSchema.parse(args);
                const files = listDataFiles(fileType);
                return responseToString({ files, path: DATA_DIR });

            case "lookup_player":
                const { playerName, gamemode } = LookupPlayerSchema.parse(args);
                let playerStats: any;
                if (gamemode) {
                    playerStats = await getStatsByGamemode(playerName, gamemode);
                } else {
                    playerStats = await getStats(playerName);
                }
                return responseToString(playerStats);

            default:
                throw new Error(`Unknown tool: ${name}`);
        }

    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(
                `Invalid arguments: ${error.errors
                    .map((e) => `${e.path.join(".")}: ${e.message}`)
                    .join(", ")}`
            );
        }

        const err = error as any;
        if (axios.isAxiosError(err)) {
             console.error("Axios Error Details:", {
                message: err.message,
                url: err.config?.url,
                method: err.config?.method,
                params: err.config?.params,
                data: err.config?.data,
                responseStatus: err.response?.status,
                responseData: err.response?.data,
                stack: err.stack
            });
             throw new Error(`Error executing tool ${name}: ${err.message}${err.response?.data ? ` - Wiki Response: ${JSON.stringify(err.response.data)}` : ''}`);
        } else {
            console.error("Error details:", {
                message: err.message,
                stack: err.stack,
                name: err.name,
                fullError: JSON.stringify(err, Object.getOwnPropertyNames(err), 2)
            });
            throw new Error(`Error executing tool ${name}: ${err.message}`);
        }
    }
});

async function main() {
    try {
        //console.log("Starting MCP OSRS Server...");
        const transport = new StdioServerTransport();
        await server.connect(transport);
        //console.log("MCP OSRS Server running on stdio");
    } catch (error) {
        console.error("Error during startup:", error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
