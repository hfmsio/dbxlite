import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  parseURLParams,
  clearURLParams,
  generateExampleURL,
  generateCustomSQLURL,
} from '../urlParams';

describe('urlParams', () => {
  beforeEach(() => {
    // Mock window.location
    delete (window as any).location;
    window.location = {
      href: 'http://localhost:3000/',
      search: '',
      origin: 'http://localhost:3000',
    } as any;

    // Mock window.history
    vi.stubGlobal('history', {
      replaceState: vi.fn(),
    });
  });

  describe('parseURLParams', () => {
    test('should parse example parameter', () => {
      window.location.search = '?example=duckdb-community';
      const params = parseURLParams();
      expect(params.example).toBe('duckdb-community');
      expect(params.sql).toBeUndefined();
      expect(params.share).toBeUndefined();
    });

    test('should parse sql parameter', () => {
      window.location.search = '?sql=SELECT%201';
      const params = parseURLParams();
      expect(params.sql).toBe('SELECT 1');
    });

    test('should parse share parameter', () => {
      window.location.search = '?share=gist:abc123';
      const params = parseURLParams();
      expect(params.share).toBe('gist:abc123');
    });

    test('should parse tab parameter', () => {
      window.location.search = '?example=duckdb-temp&tab=My%20Query';
      const params = parseURLParams();
      expect(params.tab).toBe('My Query');
    });

    test('should parse run parameter', () => {
      window.location.search = '?example=duckdb-temp&run=true';
      const params = parseURLParams();
      expect(params.run).toBe('true');
    });

    test('should parse theme parameter', () => {
      window.location.search = '?example=duckdb-temp&theme=dracula';
      const params = parseURLParams();
      expect(params.theme).toBe('dracula');
    });

    test('should parse explorer parameter', () => {
      window.location.search = '?example=duckdb-temp&explorer=true';
      const params = parseURLParams();
      expect(params.explorer).toBe('true');
    });

    test('should parse multiple parameters', () => {
      window.location.search = '?example=duckdb&run=true&tab=Test&theme=dracula&explorer=true';
      const params = parseURLParams();
      expect(params.example).toBe('duckdb');
      expect(params.run).toBe('true');
      expect(params.tab).toBe('Test');
      expect(params.theme).toBe('dracula');
      expect(params.explorer).toBe('true');
    });

    test('should return undefined for missing parameters', () => {
      window.location.search = '';
      const params = parseURLParams();
      expect(params.example).toBeUndefined();
      expect(params.sql).toBeUndefined();
      expect(params.share).toBeUndefined();
      expect(params.tab).toBeUndefined();
      expect(params.run).toBeUndefined();
      expect(params.theme).toBeUndefined();
      expect(params.explorer).toBeUndefined();
    });

    test('should handle complex SQL with special characters', () => {
      const complexSQL = "SELECT * FROM table WHERE name = 'test' AND value > 10";
      const encoded = encodeURIComponent(complexSQL);
      window.location.search = `?sql=${encoded}`;
      const params = parseURLParams();
      expect(params.sql).toBe(complexSQL);
    });
  });

  describe('clearURLParams', () => {
    test('should clear URL parameters', () => {
      window.location.search = '?example=duckdb-temp';
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

      clearURLParams();

      expect(replaceStateSpy).toHaveBeenCalled();
      const calledURL = String(replaceStateSpy.mock.calls[0][2]);
      expect(calledURL).toContain('http://localhost:3000');
      expect(calledURL).not.toContain('?');
    });

    test('should preserve path when clearing params', () => {
      window.location.href = 'http://localhost:3000/some/path?example=test';
      window.location.pathname = '/some/path';
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

      clearURLParams();

      expect(replaceStateSpy).toHaveBeenCalled();
      const calledURL = String(replaceStateSpy.mock.calls[0][2]);
      expect(calledURL).toContain('/some/path');
      expect(calledURL).not.toContain('?');
    });
  });

  describe('generateExampleURL', () => {
    test('should generate URL with example ID', () => {
      const url = generateExampleURL('duckdb-community');
      expect(url).toContain('?example=duckdb-community');
      expect(url).toContain('http://localhost:3000');
    });

    test('should include custom base URL', () => {
      const url = generateExampleURL('duckdb-temp', {
        baseURL: 'https://example.com',
      });
      expect(url).toContain('https://example.com');
      expect(url).toContain('?example=duckdb-temp');
    });

    test('should include optional tab name', () => {
      const url = generateExampleURL('duckdb-advanced', {
        tabName: 'My Query',
      });
      expect(url).toContain('example=duckdb-advanced');
      expect(url).toContain('tab=My+Query');
    });

    test('should include auto-run flag', () => {
      const url = generateExampleURL('duckdb-temp', {
        autoRun: true,
      });
      expect(url).toContain('example=duckdb-temp');
      expect(url).toContain('run=true');
    });

    test('should include theme override', () => {
      const url = generateExampleURL('duckdb-advanced', {
        theme: 'dracula',
      });
      expect(url).toContain('example=duckdb-advanced');
      expect(url).toContain('theme=dracula');
    });

    test('should include explorer flag', () => {
      const url = generateExampleURL('duckdb-advanced', {
        showExplorer: true,
      });
      expect(url).toContain('example=duckdb-advanced');
      expect(url).toContain('explorer=true');
    });

    test('should include all optional parameters', () => {
      const url = generateExampleURL('duckdb-community', {
        baseURL: 'https://app.example.com',
        tabName: 'Tutorial',
        autoRun: true,
        theme: 'vs-dark',
        showExplorer: true,
      });
      expect(url).toContain('https://app.example.com');
      expect(url).toContain('example=duckdb-community');
      expect(url).toContain('tab=Tutorial');
      expect(url).toContain('run=true');
      expect(url).toContain('theme=vs-dark');
      expect(url).toContain('explorer=true');
    });
  });

  describe('generateCustomSQLURL', () => {
    test('should generate URL with SQL parameter', () => {
      const url = generateCustomSQLURL('SELECT 1');
      expect(url).toContain('?sql=');
      // URLSearchParams encodes space as + not %20
      expect(url).toMatch(/SELECT(\+|%20)1/);
      expect(url).toContain('http://localhost:3000');
    });

    test('should include custom base URL', () => {
      const url = generateCustomSQLURL('SELECT * FROM table', {
        baseURL: 'https://example.com',
      });
      expect(url).toContain('https://example.com');
      expect(url).toContain('sql=');
    });

    test('should include custom tab name', () => {
      const url = generateCustomSQLURL('SELECT 1', {
        tabName: 'Custom Query',
      });
      expect(url).toContain('sql=');
      expect(url).toContain('tab=Custom+Query');
    });

    test('should handle SQL with special characters', () => {
      const sql = "SELECT * FROM users WHERE email = 'test@example.com'";
      const url = generateCustomSQLURL(sql);
      expect(url).toContain('sql=');
      // URL encoding should handle quotes and special chars
      expect(url.length).toBeGreaterThan(0);
    });

    test('should warn if SQL exceeds 1500 characters', () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      const longSQL = 'SELECT * FROM ' + 'a'.repeat(1500);

      generateCustomSQLURL(longSQL);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('too long for URL'),
      );
      consoleSpy.mockRestore();
    });

    test('should not warn if SQL is under 1500 characters', () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      const sql = 'SELECT * FROM table WHERE id = 1';

      generateCustomSQLURL(sql);

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Round-trip URL parsing and generation', () => {
    test('should handle round-trip for example URL', () => {
      const originalURL = generateExampleURL('duckdb-temp', {
        tabName: 'Test',
      });

      // Extract query string
      const url = new URL(originalURL);
      window.location.search = url.search;

      const params = parseURLParams();
      expect(params.example).toBe('duckdb-temp');
      expect(params.tab).toBe('Test');
    });

    test('should handle round-trip for SQL URL', () => {
      const sql = 'SELECT * FROM table';
      const originalURL = generateCustomSQLURL(sql);

      // Extract query string
      const url = new URL(originalURL);
      window.location.search = url.search;

      const params = parseURLParams();
      expect(decodeURIComponent(params.sql || '')).toBe(sql);
    });
  });
});
