import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Configuration
interface Env {
  XANO_API_KEY: string;
  XANO_WORKSPACE: string;
  XANO_API_BASE: string;
}

// Types
interface DatabaseRecord {
  id: string;
  [key: string]: any;
}

// Xano specific types
interface XanoTable {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

interface XanoTableSchema {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
  nullable?: boolean;
  access?: 'public' | 'private' | 'internal';
  config?: Record<string, any>;
}

// API Group and API interfaces
interface XanoApiGroup {
  id: string;
  name: string;
  description?: string;
  docs?: string;
  created_at: string;
  updated_at: string;
  guid?: string;
  canonical?: string;
  swagger?: boolean;
  documentation?: {
    require_token: boolean;
    token: string;
    link: string;
  };
  branch?: string;
  tag?: string[];
}

interface XanoApi {
  id: string;
  name: string;
  description: string;
  docs?: string;
  guid?: string;
  created_at: string;
  updated_at: string;
  verb: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH' | 'HEAD';
  tag?: string[];
  cache?: {
    active: boolean;
    ttl: number;
    input: boolean;
    auth: boolean;
    datasource: boolean;
    ip: boolean;
    headers: string[];
    env?: string[];
  };
  auth?: Record<string, any>;
  input?: any[];
}

// Helper function for making Xano API requests
async function makeXanoRequest<T>(env: Env, endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', body?: any): Promise<T> {
  try {
    console.error(`[API] Making ${method} request to endpoint: ${endpoint}`);
    if (body) {
      console.error(`[API] Request body: ${JSON.stringify(body, null, 2)}`);
    }
    
    const url = new URL(`${env.XANO_API_BASE}${endpoint}`);
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.XANO_API_KEY}`,
      'X-Workspace': env.XANO_WORKSPACE
    };

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Error] HTTP error! status: ${response.status}, response: ${errorText}`);
      throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
    }

    const data = await response.json() as T;
    console.error(`[API] Successfully received response from endpoint: ${endpoint}`);
    return data;
  } catch (error) {
    console.error(`[Error] Failed to make Xano request to ${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

export class XanoMCP extends McpAgent<Env> {
  server = new McpServer({
    name: "xano-mcp",
    version: "1.0.0",
    description: "MCP server for interacting with Xano database and APIs",
  });

  async init() {
    // List Tables Tool
    this.server.tool(
      "list-tables",
      "Browse all tables in the Xano workspace",
      {},
      async () => {
        console.error('[Tool] Executing list-tables');
        try {
          const response = await makeXanoRequest<{ items: XanoTable[] }>(this.env, `/workspace/${this.env.XANO_WORKSPACE}/table`);
          const tables = response.items;

          const formattedContent = `# Xano Database Tables\n\n${tables.map(table =>
            `## ${table.name}\n` +
            `**ID**: ${table.id}\n` +
            `**Description**: ${table.description || 'No description'}\n` +
            `**Created**: ${new Date(table.created_at).toLocaleString()}\n` +
            `**Updated**: ${new Date(table.updated_at).toLocaleString()}\n` +
            `${table.tags && table.tags.length > 0 ? `**Tags**: ${table.tags.join(', ')}\n` : ''}`
          ).join('\n\n')}`;

          console.error(`[Tool] Successfully listed ${tables.length} tables`);
          return {
            content: [
              {
                type: "text",
                text: formattedContent
              }
            ]
          };
        } catch (error) {
          console.error(`[Error] Failed to list tables: ${error instanceof Error ? error.message : String(error)}`);
          return {
            content: [
              {
                type: "text",
                text: `Error listing tables: ${error instanceof Error ? error.message : String(error)}`
              }
            ],
            isError: true
          };
        }
      }
    );

    // Get Table Schema Tool
    this.server.tool(
      "get-table-schema",
      "Browse the schema of a table",
      {
        table_id: z.string().describe("ID of the table to get schema from"),
        format: z.enum(["markdown", "json"]).default("markdown").describe("Output format: 'markdown' for readable documentation or 'json' for complete schema")
      },
      async ({ table_id, format }) => {
        console.error(`[Tool] Executing get-table-schema for table ID: ${table_id} with format: ${format}`);
        try {
          const schema = await makeXanoRequest(this.env, `/workspace/${this.env.XANO_WORKSPACE}/table/${table_id}/schema`);
          
          if (format === "json") {
            return {
              content: [
                {
                  type: "text",
                  text: `# Table Schema (Full JSON)\n\n\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\``
                }
              ]
            };
          } else {
            const formattedContent = `# Schema for Table ID: ${table_id}\n\n` +
              (Array.isArray(schema) ? 
                schema.map(field => {
                  let content = `## ${field.name} (${field.type})\n`;
                  content += `**Required**: ${field.required ? 'Yes' : 'No'}\n`;
                  content += `**Nullable**: ${field.nullable ? 'Yes' : 'No'}\n`;
                  content += `**Access**: ${field.access || 'public'}\n`;
                  content += `**Style**: ${field.style || 'single'}\n`;
                  if (field.description) content += `**Description**: ${field.description}\n`;
                  if (field.default !== undefined) content += `**Default**: ${field.default}\n`;
                  if (field.config && Object.keys(field.config).length > 0) {
                    content += `**Config**:\n\`\`\`json\n${JSON.stringify(field.config, null, 2)}\n\`\`\`\n`;
                  }
                  if (field.validators && Object.keys(field.validators).length > 0) {
                    content += `**Validators**:\n\`\`\`json\n${JSON.stringify(field.validators, null, 2)}\n\`\`\`\n`;
                  }
                  if (field.children && field.children.length > 0) {
                    content += `**Children**:\n\`\`\`json\n${JSON.stringify(field.children, null, 2)}\n\`\`\`\n`;
                  }
                  return content;
                }).join('\n\n') : 
                `Error: Unexpected schema format: ${JSON.stringify(schema)}`
              );

            console.error(`[Tool] Successfully retrieved schema for table ID: ${table_id}`);
            return {
              content: [
                {
                  type: "text",
                  text: formattedContent
                }
              ]
            };
          }
        } catch (error) {
          console.error(`[Error] Failed to get table schema: ${error instanceof Error ? error.message : String(error)}`);
          return {
            content: [
              {
                type: "text",
                text: `Error getting table schema: ${error instanceof Error ? error.message : String(error)}`
              }
            ],
            isError: true
          };
        }
      }
    );

    // Add Table Tool
    this.server.tool(
      "add-table",
      "Add a new table to the Xano database",
      {
        name: z.string().describe("Name of the table"),
        description: z.string().optional().describe("Description of the table"),
        schema: z.array(z.object({
          name: z.string().describe("Name of the schema element"),
          type: z.enum([
            "attachment", "audio", "bool", "date", "decimal", "email", "enum", 
            "geo_linestring", "geo_multilinestring", "geo_multipoint", "geo_multipolygon", 
            "geo_point", "geo_polygon", "image", "int", "json", "object", "password", 
            "tablerefuuid", "text", "timestamp", "uuid", "vector", "video"
          ]).describe("Type of the schema element"),
          description: z.string().optional().describe("Description of the schema element"),
          nullable: z.boolean().optional().default(false).describe("Whether the field can be null"),
          required: z.boolean().optional().default(false).describe("Whether the field is required"),
          access: z.enum(["public", "private", "internal"]).optional().default("public").describe("Access level for the field"),
          style: z.enum(["single", "list"]).optional().default("single").describe("Whether the field is a single value or a list"),
          default: z.string().optional().describe("Default value for the field"),
          config: z.record(z.any()).optional().describe("Additional configuration for specific field types"),
          validators: z.object({
            lower: z.boolean().optional(),
            max: z.number().optional(),
            maxLength: z.number().optional(),
            min: z.number().optional(),
            minLength: z.number().optional(),
            pattern: z.string().optional(),
            precision: z.number().optional(),
            scale: z.number().optional(),
            trim: z.boolean().optional()
          }).optional().describe("Validation rules for the field"),
          children: z.array(z.any()).optional().describe("Nested fields for object types"),
          tableref_id: z.string().optional().describe("ID of the referenced table (only valid when type is 'int')"),
          values: z.array(z.string()).optional().describe("Array of allowed values (only for enum type)")
        })).optional().describe(`Schema configuration for the table`)
      },
      async ({ name, description, schema }) => {
        console.error(`[Tool] Executing add-table for table: ${name}`);
        try {
          const createTableResponse = await makeXanoRequest<{ id: string }>(
            this.env,
            `/workspace/${this.env.XANO_WORKSPACE}/table`, 
            'POST', 
            { name, description }
          );
          
          const tableId = createTableResponse.id;
          console.error(`[Tool] Table created with ID: ${tableId}`);
          
          if (schema && schema.length > 0) {
            try {
              const processedSchema = schema.map(field => {
                if (field.tableref_id && field.type !== "int") {
                  throw new Error(`Field "${field.name}" has tableref_id but type is not "int". Foreign key fields must be of type "int".`);
                }
                return field;
              });
              
              await makeXanoRequest(
                this.env,
                `/workspace/${this.env.XANO_WORKSPACE}/table/${tableId}/schema`, 
                'PUT', 
                { schema: processedSchema }
              );
              console.error(`[Tool] Schema successfully added to table ID: ${tableId}`);
            } catch (schemaError) {
              console.error(`[Error] Failed to add schema: ${schemaError instanceof Error ? schemaError.message : String(schemaError)}`);
              return {
                content: [
                  {
                    type: "text",
                    text: `Table created with ID ${tableId}, but failed to add schema: ${schemaError instanceof Error ? schemaError.message : String(schemaError)}`
                  }
                ],
                isError: true
              };
            }
          }
          
          return {
            content: [
              {
                type: "text",
                text: `Successfully created table "${name}" with ID: ${tableId}${schema ? ' and added the specified schema.' : '.'}`
              }
            ]
          };
        } catch (error) {
          console.error(`[Error] Failed to create table: ${error instanceof Error ? error.message : String(error)}`);
          return {
            content: [
              {
                type: "text",
                text: `Error creating table: ${error instanceof Error ? error.message : String(error)}`
              }
            ],
            isError: true
          };
        }
      }
    );

    // Edit Table Schema Tool
    this.server.tool(
      "edit-table-schema",
      "Edit the schema of an existing table (add, remove, or modify columns)",
      {
        table_id: z.string().describe("ID of the table to edit"),
        operation: z.enum(['update', 'add_column', 'rename_column', 'remove_column']).describe("Type of schema operation to perform"),
        schema: z.array(z.object({
          name: z.string().describe("Name of the schema element"),
          type: z.enum([
            "attachment", "audio", "bool", "date", "decimal", "email", "enum", 
            "geo_linestring", "geo_multilinestring", "geo_multipoint", "geo_multipolygon", 
            "geo_point", "geo_polygon", "image", "int", "json", "object", "password", 
            "tableref", "tablerefuuid", "text", "timestamp", "uuid", "vector", "video"
          ]).describe("Type of the schema element"),
          description: z.string().optional().describe("Description of the schema element"),
          nullable: z.boolean().optional().default(false).describe("Whether the field can be null"),
          required: z.boolean().optional().default(false).describe("Whether the field is required"),
          access: z.enum(["public", "private", "internal"]).optional().default("public").describe("Access level for the field"),
          style: z.enum(["single", "list"]).optional().default("single").describe("Whether the field is a single value or a list"),
          default: z.string().optional().describe("Default value for the field"),
          config: z.record(z.any()).optional().describe("Additional configuration for specific field types"),
          children: z.array(z.any()).optional().describe("Nested fields for object types")
        })).optional().describe("Full schema specification (for 'update' operation)"),
        column: z.object({
          name: z.string().describe("Name of the column"),
          type: z.enum([
            "attachment", "audio", "bool", "date", "decimal", "email", "enum", 
            "geo_linestring", "geo_multilinestring", "geo_multipoint", "geo_multipolygon", 
            "geo_point", "geo_polygon", "image", "int", "json", "object", "password", 
            "tableref", "tablerefuuid", "text", "timestamp", "uuid", "vector", "video"
          ]).describe("Type of the column"),
          description: z.string().optional().describe("Description of the column"),
          nullable: z.boolean().optional().default(false).describe("Whether the field can be null"),
          required: z.boolean().optional().default(false).describe("Whether the field is required"),
          access: z.enum(["public", "private", "internal"]).optional().default("public").describe("Access level for the field"),
          style: z.enum(["single", "list"]).optional().default("single").describe("Whether the field is a single value or a list"),
          default: z.string().optional().describe("Default value for the field"),
          config: z.record(z.any()).optional().describe("Additional configuration for the column")
        }).optional().describe("Column specification (for 'add_column' operation)"),
        rename: z.object({
          old_name: z.string().describe("Current name of the column"),
          new_name: z.string().describe("New name for the column")
        }).optional().describe("Rename specification (for 'rename_column' operation)"),
        column_name: z.string().optional().describe("Name of the column to remove (for 'remove_column' operation)")
      },
      async ({ table_id, operation, schema, column, rename, column_name }) => {
        console.error(`[Tool] Executing edit-table-schema for table ID: ${table_id}, operation: ${operation}`);
        
        try {
          let successMessage = "";
          
          switch (operation) {
            case 'update':
              if (!schema || schema.length === 0) {
                return {
                  content: [{ type: "text", text: "Error: Schema array must be provided for 'update' operation" }],
                  isError: true
                };
              }
              
              await makeXanoRequest(
                this.env,
                `/workspace/${this.env.XANO_WORKSPACE}/table/${table_id}/schema`,
                'PUT',
                { schema }
              );
              
              successMessage = `Successfully updated the entire schema for table ID: ${table_id}`;
              break;
              
            case 'add_column':
              if (!column) {
                return {
                  content: [{ type: "text", text: "Error: Column specification must be provided for 'add_column' operation" }],
                  isError: true
                };
              }
              
              await makeXanoRequest(
                this.env,
                `/workspace/${this.env.XANO_WORKSPACE}/table/${table_id}/schema/type/${column.type}`,
                'POST',
                column
              );
              
              successMessage = `Successfully added column '${column.name}' of type '${column.type}' to table ID: ${table_id}`;
              break;
              
            case 'rename_column':
              if (!rename) {
                return {
                  content: [{ type: "text", text: "Error: Rename specification must be provided for 'rename_column' operation" }],
                  isError: true
                };
              }
              
              await makeXanoRequest(
                this.env,
                `/workspace/${this.env.XANO_WORKSPACE}/table/${table_id}/schema/rename`,
                'POST',
                rename
              );
              
              successMessage = `Successfully renamed column from '${rename.old_name}' to '${rename.new_name}' in table ID: ${table_id}`;
              break;
              
            case 'remove_column':
              if (!column_name) {
                return {
                  content: [{ type: "text", text: "Error: Column name must be provided for 'remove_column' operation" }],
                  isError: true
                };
              }
              
              await makeXanoRequest(
                this.env,
                `/workspace/${this.env.XANO_WORKSPACE}/table/${table_id}/schema/${column_name}`,
                'DELETE'
              );
              
              successMessage = `Successfully removed column '${column_name}' from table ID: ${table_id}`;
              break;
          }
          
          console.error(`[Tool] ${successMessage}`);
          return {
            content: [{ type: "text", text: successMessage }]
          };
          
        } catch (error) {
          console.error(`[Error] Failed to edit table schema: ${error instanceof Error ? error.message : String(error)}`);
          return {
            content: [
              {
                type: "text",
                text: `Error editing table schema: ${error instanceof Error ? error.message : String(error)}`
              }
            ],
            isError: true
          };
        }
      }
    );
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return McpAgent.serve("/sse", { corsOptions: { origin: "*" } }).fetch(request, env, ctx);
  }
};
