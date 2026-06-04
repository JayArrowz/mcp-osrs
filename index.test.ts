import path from 'path';
import { fileURLToPath } from 'url';
import { fuzzyScore, searchFile, fileExists, getFileDetails, listDataFiles } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');

describe('fuzzyScore', () => {
    it('returns 100 for an exact substring match', () => {
        expect(fuzzyScore('abyssal_whip', 'whip')).toBe(100);
    });

    it('returns 100 for a full match', () => {
        expect(fuzzyScore('dragon_sword', 'dragon_sword')).toBe(100);
    });

    it('returns 75 when all space/underscore-split tokens are present', () => {
        expect(fuzzyScore('dragon_sword_of_doom', 'dragon sword')).toBe(75);
    });

    it('returns a positive subsequence score for fuzzy match (typo-like)', () => {
        const score = fuzzyScore('abyssal_whip', 'abssl');
        expect(score).toBeGreaterThan(0);
        expect(score).toBeLessThan(100);
    });

    it('returns 0 when not all pattern chars are present in sequence', () => {
        expect(fuzzyScore('dragon', 'xyz')).toBe(0);
    });

    it('is case-insensitive', () => {
        expect(fuzzyScore('Dragon_Sword', 'dragon')).toBe(100);
    });

    it('exact match scores higher than subsequence match', () => {
        const exact = fuzzyScore('abyssal_whip', 'whip');
        const subseq = fuzzyScore('abyssal_whip', 'awip');
        expect(exact).toBeGreaterThan(subseq);
    });
});

describe('searchFile (real data files)', () => {
    const varptypesPath = path.join(DATA_DIR, 'varptypes.txt');
    const objtypesPath = path.join(DATA_DIR, 'objtypes.txt');

    it('finds exact matches in varptypes.txt', async () => {
        const result = await searchFile(varptypesPath, 'cannon');
        expect(result.results.length).toBeGreaterThan(0);
        expect(result.results[0].line.toLowerCase()).toContain('cannon');
    });

    it('returns results with id, value, and formatted fields', async () => {
        const result = await searchFile(varptypesPath, 'cannon');
        const first = result.results[0];
        expect(first).toHaveProperty('id');
        expect(first).toHaveProperty('value');
        expect(first).toHaveProperty('formatted');
        expect(first.formatted).toContain('\t');
    });

    it('converts spaces to underscores before searching', async () => {
        const withSpace = await searchFile(objtypesPath, 'mcannon ball');
        const withUnderscore = await searchFile(objtypesPath, 'mcannonball');
        expect(withSpace.pagination.totalResults).toBe(withUnderscore.pagination.totalResults);
    });

    it('returns correct pagination metadata', async () => {
        const result = await searchFile(varptypesPath, 'quest', 1, 5);
        expect(result.pagination.page).toBe(1);
        expect(result.pagination.pageSize).toBe(5);
        expect(result.results.length).toBeLessThanOrEqual(5);
        if (result.pagination.totalResults > 5) {
            expect(result.pagination.hasNextPage).toBe(true);
        }
    });

    it('returns second page of results', async () => {
        const page1 = await searchFile(varptypesPath, 'quest', 1, 3);
        const page2 = await searchFile(varptypesPath, 'quest', 2, 3);
        if (page1.pagination.totalPages >= 2) {
            expect(page2.results[0].line).not.toBe(page1.results[0].line);
            expect(page2.pagination.hasPreviousPage).toBe(true);
        }
    });

    it('sorts results so exact matches come before fuzzy matches', async () => {
        const result = await searchFile(objtypesPath, 'mcannonball');
        const lines: string[] = result.results.map((r: any) => r.line as string);
        const exactIndex = lines.findIndex(l => l.toLowerCase().includes('mcannonball'));
        const fuzzyIndex = lines.findIndex(l => !l.toLowerCase().includes('mcannonball'));
        if (exactIndex !== -1 && fuzzyIndex !== -1) {
            expect(exactIndex).toBeLessThan(fuzzyIndex);
        }
    });

    it('rejects with an error for a non-existent file', async () => {
        await expect(searchFile('/nonexistent/path/file.txt', 'test')).rejects.toThrow('File not found');
    });

    it('returns empty results for a query with no matches', async () => {
        const result = await searchFile(varptypesPath, 'zzz_no_match_xqq');
        expect(result.results).toHaveLength(0);
        expect(result.pagination.totalResults).toBe(0);
    });
});

describe('fileExists', () => {
    it('returns true for files that exist in the data directory', () => {
        expect(fileExists('varptypes.txt')).toBe(true);
        expect(fileExists('objtypes.txt')).toBe(true);
        expect(fileExists('npctypes.txt')).toBe(true);
    });

    it('returns false for files that do not exist', () => {
        expect(fileExists('nonexistent.txt')).toBe(false);
    });
});

describe('getFileDetails', () => {
    it('returns exists:true and metadata for a real file', () => {
        const details = getFileDetails('varptypes.txt');
        expect(details.exists).toBe(true);
        expect(details.size).toBeGreaterThan(0);
        expect(details.lineCount).toBeGreaterThan(0);
        expect(details.created).toBeTruthy();
        expect(details.lastModified).toBeTruthy();
    });

    it('returns exists:false for a missing file', () => {
        const details = getFileDetails('nonexistent.txt');
        expect(details.exists).toBe(false);
    });
});

describe('listDataFiles', () => {
    it('returns all data files when no filter is given', () => {
        const files = listDataFiles();
        expect(files.length).toBeGreaterThan(0);
        expect(files).toContain('varptypes.txt');
        expect(files).toContain('objtypes.txt');
    });

    it('filters by file extension', () => {
        const txtFiles = listDataFiles('txt');
        expect(txtFiles.every(f => f.endsWith('.txt'))).toBe(true);
        expect(txtFiles.length).toBeGreaterThan(0);
    });

    it('returns empty array when filter matches nothing', () => {
        const result = listDataFiles('xyz');
        expect(result).toEqual([]);
    });
});
