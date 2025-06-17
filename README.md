[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/jayarrowz-mcp-osrs-badge.png)](https://mseep.ai/app/jayarrowz-mcp-osrs)

# OSRS MCP Server [![smithery badge](https://smithery.ai/badge/@jayarrowz/mcp-osrs)](https://smithery.ai/server/@jayarrowz/mcp-osrs)

MCP Server for interacting with the Old School RuneScape (OSRS) Wiki API and data files. This server provides tools to search the OSRS Wiki and access game data definitions through the Model Context Protocol.

<a href="https://glama.ai/mcp/servers/@JayArrowz/mcp-osrs">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@JayArrowz/mcp-osrs/badge" alt="OSRS Server MCP server" />
</a>

![image](https://github.com/user-attachments/assets/da9d1f48-513d-4a1b-a65b-56f8a012fa83)

![image](https://github.com/user-attachments/assets/9e7e4e07-6e47-44f9-ab0c-b3835418bd37)

![image](https://github.com/user-attachments/assets/628f35e1-2e85-42f4-8693-4ef4f16591d4)


## Tools

This server implements the following tools:

### OSRS Wiki Methods
1. `osrs_wiki_search` - Search the OSRS Wiki for pages matching a search term
2. `osrs_wiki_get_page_info` - Get information about specific pages on the OSRS Wiki
3. `osrs_wiki_parse_page` - Get the parsed HTML content of a specific OSRS Wiki page

### Game Data Search Methods
4. `search_varptypes` - Search the varptypes.txt file for player variables (varps) that store player state and progress
5. `search_varbittypes` - Search the varbittypes.txt file for variable bits (varbits) that store individual bits from varps
6. `search_iftypes` - Search the iftypes.txt file for interface definitions used in the game's UI
7. `search_invtypes` - Search the invtypes.txt file for inventory type definitions in the game
8. `search_loctypes` - Search the loctypes.txt file for location/object type definitions in the game world
9. `search_npctypes` - Search the npctypes.txt file for NPC (non-player character) definitions
10. `search_objtypes` - Search the objtypes.txt file for object/item definitions in the game
11. `search_rowtypes` - Search the rowtypes.txt file for row definitions used in various interfaces
12. `search_seqtypes` - Search the seqtypes.txt file for animation sequence definitions
13. `search_soundtypes` - Search the soundtypes.txt file for sound effect definitions in the game
14. `search_spottypes` - Search the spottypes.txt file for spot animation (graphical effect) definitions
15. `search_spritetypes` - Search the spritetypes.txt file for sprite image definitions used in the interface
16. `search_tabletypes` - Search the tabletypes.txt file for interface tab definitions

### Generic Data File Methods
17. `search_data_file` - Search any file in the data directory for matching entries
18. `get_file_details` - Get details about a file in the data directory
19. `list_data_files` - List available data files in the data directory

## Installation

### Installing via Smithery
To install mcp-osrs for Claude Desktop automatically via [Smithery](https://smithery.ai/embed/@jayarrowz/mcp-osrs):

```bash
npx @smithery/cli@latest install @jayarrowz/mcp-osrs --client claude
```

### Prerequisites
- Node.js (v16 or later)
- npm or yarn

### Installing the package
```bash
# Clone the repository
git clone https://github.com/jayarrowz/mcp-osrs.git
cd mcp-osrs

# Install dependencies
npm install

# Build the package
npm run build
```

## Usage with Claude Desktop

Add the following to your `claude_desktop_config.json`:

### Using npx
```json
{
  "mcpServers": {
    "osrs": {
      "command": "npx",
      "args": ["-y", "@jayarrowz/mcp-osrs"]
    }
  }
}
```

### Direct Node.js
```json
{
  "mcpServers": {
    "osrs": {
      "command": "node",
      "args": ["/path/to/mcp-osrs/dist/index.js"]
    }
  }
}
```

Replace `/path/to/mcp-osrs` with the actual path to your repository.

## Examples

### Search the OSRS Wiki
```javascript
// Search for information about the Abyssal whip
const result = await callTool("osrs_wiki_search", { 
  search: "Abyssal whip" 
});
```

### Get Page Information
```javascript
// Get information about a specific wiki page
const pageInfo = await callTool("osrs_wiki_get_page_info", { 
  titles: "Abyssal_whip" 
});
```

### Search Game Data
```javascript
// Search for items in the object definitions
const items = await callTool("search_objtypes", { 
  query: "dragon",
  page: 1,
  pageSize: 10
});
```

### List Available Data Files
```javascript
// Get a list of all data files
const files = await callTool("list_data_files", {});
```

## Development
```bash
# Install dependencies
npm install

# Start the server in development mode
npm start

# Build the server
npm run build
```

## License
This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.