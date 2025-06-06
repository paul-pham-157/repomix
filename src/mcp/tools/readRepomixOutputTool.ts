import fs from 'node:fs/promises';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { logger } from '../../shared/logger.js';
import { buildMcpToolErrorResponse, buildMcpToolSuccessResponse, getOutputFilePath } from './mcpToolRuntime.js';

/**
 * Register the tool to read Repomix output files
 */
export const registerReadRepomixOutputTool = (mcpServer: McpServer) => {
  mcpServer.tool(
    'read_repomix_output',
    'Read the contents of a Repomix-generated output file. Supports partial reading with line range specification for large files. This tool is designed for environments where direct file system access is limited (e.g., web-based environments, sandboxed applications). For direct file system access, use standard file operations.',
    {
      outputId: z.string().describe('ID of the Repomix output file to read'),
      startLine: z
        .number()
        .optional()
        .describe('Starting line number (1-based, inclusive). If not specified, reads from beginning.'),
      endLine: z
        .number()
        .optional()
        .describe('Ending line number (1-based, inclusive). If not specified, reads to end.'),
    },
    {
      title: 'Read Repomix Output',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ outputId, startLine, endLine }): Promise<CallToolResult> => {
      try {
        logger.trace(`Reading Repomix output with ID: ${outputId}`);

        // Get the file path from the registry
        const filePath = getOutputFilePath(outputId);
        if (!filePath) {
          return buildMcpToolErrorResponse([
            `Error: Output file with ID ${outputId} not found. The output file may have been deleted or the ID is invalid.`,
          ]);
        }

        // Check if the file exists
        try {
          await fs.access(filePath);
        } catch (error) {
          return buildMcpToolErrorResponse([
            `Error: Output file does not exist at path: ${filePath}. The temporary file may have been cleaned up.`,
          ]);
        }

        // Read the file content
        const content = await fs.readFile(filePath, 'utf8');

        let processedContent = content;
        if (startLine !== undefined || endLine !== undefined) {
          // Validate that startLine is less than or equal to endLine when both are provided
          if (startLine !== undefined && endLine !== undefined && startLine > endLine) {
            return buildMcpToolErrorResponse([
              `Error: Start line (${startLine}) cannot be greater than end line (${endLine}).`,
            ]);
          }

          const lines = content.split('\n');
          const start = Math.max(0, (startLine || 1) - 1);
          const end = endLine ? Math.min(lines.length, endLine) : lines.length;

          if (start >= lines.length) {
            return buildMcpToolErrorResponse([
              `Error: Start line ${startLine} exceeds total lines (${lines.length}) in the file.`,
            ]);
          }

          processedContent = lines.slice(start, end).join('\n');
        }

        return buildMcpToolSuccessResponse([
          `Content of Repomix output file (ID: ${outputId})${startLine || endLine ? ` (lines ${startLine || 1}-${endLine || 'end'})` : ''}:`,
          processedContent,
        ]);
      } catch (error) {
        logger.error(`Error reading Repomix output: ${error}`);
        return buildMcpToolErrorResponse([
          `Error reading Repomix output: ${error instanceof Error ? error.message : String(error)}`,
        ]);
      }
    },
  );
};
