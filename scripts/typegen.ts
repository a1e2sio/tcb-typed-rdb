import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

type MetadataRow = {
  record_type: "column" | "enum";
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  udt_schema: string;
  udt_name: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
  attidentity: string | null;
  attgenerated: string | null;
  enum_schema: string | null;
  enum_name: string | null;
  enum_value: string | null;
};

type CliPayload = {
  data?: { Rows?: Array<unknown>; Columns?: string[]; list?: unknown[] };
  rows?: unknown[];
  result?: unknown;
};

const outputArgumentIndex = process.argv.indexOf("--output");
const outputArgument = outputArgumentIndex >= 0 ? process.argv[outputArgumentIndex + 1] : undefined;
const outputDirectoryArgumentIndex = process.argv.indexOf("--output-dir");
const outputDirectoryArgument =
  outputDirectoryArgumentIndex >= 0
    ? process.argv[outputDirectoryArgumentIndex + 1]
    : undefined;
const outputFile = resolve(
  process.cwd(),
  outputArgument || join(outputDirectoryArgument || "src", "database.types.ts"),
);
const configArgumentIndex = process.argv.indexOf("--config-file");
const configFile = configArgumentIndex >= 0 ? process.argv[configArgumentIndex + 1] : undefined;
const adminMode = process.argv.includes("--admin");
const roleArgumentIndex = process.argv.indexOf("--role");
const roleArgument = roleArgumentIndex >= 0 ? process.argv[roleArgumentIndex + 1] : undefined;
const role = adminMode
  ? undefined
  : roleArgument || process.env.CLOUDBASE_DB_ROLE || "cloudbase_read_only_user";
const envId = process.env.CLOUDBASE_ENV_ID || process.env.VITE_CLOUDBASE_ENV_ID;

if (process.argv.includes("--help")) {
  console.log(`Usage: typegen [options]

Options:
  --output <path>          Write to a specific TypeScript file.
  --output-dir <path>      Write database.types.ts inside this directory.
  --config-file <path>     Use a specific cloudbaserc.json file.
  --role <name>            Query metadata using a database role.
  --admin                  Query metadata using the admin role.
  --help                   Show this help message.`);
  process.exit(0);
}

if (roleArgumentIndex >= 0 && (!roleArgument || roleArgument.startsWith("--"))) {
  throw new Error("Missing database role. Use --role <role> or CLOUDBASE_DB_ROLE.");
}
if (adminMode && roleArgumentIndex >= 0) {
  throw new Error("Use either --admin or --role <role>, not both.");
}
if (configArgumentIndex >= 0 && (!configFile || configFile.startsWith("--"))) {
  throw new Error("Missing config file. Use --config-file <path>.");
}
if (outputArgumentIndex >= 0 && (!outputArgument || outputArgument.startsWith("--"))) {
  throw new Error("Missing output file. Use --output <path>.");
}
if (
  outputDirectoryArgumentIndex >= 0 &&
  (!outputDirectoryArgument || outputDirectoryArgument.startsWith("--"))
)
  throw new Error("Missing output directory. Use --output-dir <path>.");
if (outputArgumentIndex >= 0 && outputDirectoryArgumentIndex >= 0)
  throw new Error("Use either --output <path> or --output-dir <path>, not both.");

const metadataSql = `
SELECT
  'column' AS record_type, c.table_schema, c.table_name, c.column_name,
  c.ordinal_position, c.data_type, c.udt_schema, c.udt_name, c.is_nullable,
  c.column_default, a.attidentity, a.attgenerated,
  false AS is_primary_key, NULL::text AS enum_schema,
  NULL::text AS enum_name, NULL::text AS enum_value, NULL::real AS enum_sort_order
FROM information_schema.columns c
JOIN pg_catalog.pg_namespace ns ON ns.nspname = c.table_schema
JOIN pg_catalog.pg_class cls ON cls.relname = c.table_name AND cls.relnamespace = ns.oid
JOIN pg_catalog.pg_attribute a ON a.attrelid = cls.oid AND a.attname = c.column_name
WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
`.trim();

function quoteWindowsArgument(value: string): string {
  if (!/[\s"]/u.test(value)) return value;
  return `"${value
    .replace(/(\\*)"/g, "$1$1\\\"")
    .replace(/(\\*)$/g, "$1$1")}"`;
}

function runQuery(): string {
  const args = [] as string[];
  if (configFile) args.push("--config-file", resolve(process.cwd(), configFile));
  else if (existsSync(resolve(process.cwd(), "cloudbaserc.json")))
    args.push("--config-file", resolve(process.cwd(), "cloudbaserc.json"));
  if (envId) args.push("-e", envId);
  args.push("db", "execute");
  if (role) args.push("--role", role);
  args.push("--sql", metadataSql, "--json");

  const childEnv = { ...process.env };
  for (const variable of [
    "NODE_OPTIONS",
    "VSCODE_INSPECTOR_OPTIONS",
    "NODE_INSPECT_RESUME_ON_START",
    "VSCODE_DEBUG_OPTIONS",
  ])
    delete childEnv[variable];

  const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "tcb";
  const commandArgs =
    process.platform === "win32"
      ? ["/d", "/c", `tcb.cmd ${args.map(quoteWindowsArgument).join(" ")}`]
      : args;
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: childEnv,
    windowsVerbatimArguments: process.platform === "win32",
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  if (result.error || result.status !== 0) {
    const reason = result.error?.message || output || `exit code ${result.status ?? "unknown"}`;
    throw new Error(`CloudBase metadata query failed: ${reason}`);
  }
  return output;
}

function rowsFromJson(output: string): MetadataRow[] {
  const jsonStart = output.indexOf("{");
  if (jsonStart < 0) throw new Error("CloudBase CLI returned no JSON payload");
  const parsed = JSON.parse(output.slice(jsonStart)) as CliPayload;
  const rawRows = parsed.data?.Rows ?? parsed.rows;
  const rows = Array.isArray(rawRows)
    ? rawRows.map((row) => (typeof row === "string" ? JSON.parse(row) : row))
    : undefined;
  const candidates = [rows, parsed, parsed.data, parsed.result, parsed.data?.list];
  const result = candidates.find(Array.isArray) as unknown[] | undefined;
  if (!result) throw new Error("CloudBase CLI returned JSON without a row array");
  if (result === rows) {
    const columns = parsed.data?.Columns ?? [];
    return rows.map((row) =>
      Object.fromEntries(
        columns.map((column, index) => [column, (row as unknown[])[index] ?? null]),
      ),
    ) as MetadataRow[];
  }
  return result as MetadataRow[];
}

function typeName(value: string): string {
  return value.replace(/(^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/g, (_match, _separator, character) =>
    character.toUpperCase(),
  );
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function postgresType(row: MetadataRow, enumNames: Set<string>): string {
  if (row.data_type === "USER-DEFINED" && enumNames.has(`${row.udt_schema}.${row.udt_name}`)) {
    return typeName(row.udt_name);
  }
  if (row.data_type === "ARRAY") {
    return `Array<${postgresType({ ...row, data_type: row.udt_name.replace(/^_/, "") }, enumNames)}>`;
  }
  if (
    [
      "smallint",
      "integer",
      "bigint",
      "numeric",
      "decimal",
      "real",
      "double precision",
      "money",
    ].includes(row.data_type)
  )
    return "number";
  if (row.data_type === "boolean") return "boolean";
  if (["json", "jsonb"].includes(row.data_type)) return "Json";
  return "string";
}

function optional(row: MetadataRow): boolean {
  return (
    row.is_nullable === "YES" ||
    row.column_default !== null ||
    Boolean(row.attidentity) ||
    Boolean(row.attgenerated)
  );
}

function render(rows: MetadataRow[]): string {
  const columns = rows.filter((row) => row.record_type === "column");
  const enums = rows.filter((row) => row.record_type === "enum");
  const enumNames = new Set(enums.map((row) => `${row.enum_schema}.${row.enum_name}`));
  const tableMap = new Map<string, MetadataRow[]>();
  for (const row of columns) {
    const key = `${row.table_schema}.${row.table_name}`;
    tableMap.set(key, [...(tableMap.get(key) ?? []), row]);
  }
  const tableOutput = [...tableMap.entries()]
    .map(([key, tableColumns]) => {
      const tableName = key.slice(key.indexOf(".") + 1);
      const fields = (mode: "row" | "insert" | "update") =>
        tableColumns
          .filter((column) => mode !== "insert" || (!column.attidentity && !column.attgenerated))
          .map((column) => {
            const name = `${quote(column.column_name)}${mode === "update" || optional(column) ? "?" : ""}`;
            return `${name}: ${postgresType(column, enumNames)}${column.is_nullable === "YES" ? " | null" : ""};`;
          })
          .join("\n    ");
      return `    ${quote(tableName)}: {\n      Row: {\n    ${fields("row")}\n      };\n      Insert: {\n    ${fields("insert")}\n      };\n      Update: {\n    ${fields("update")}\n      };\n      Relationships: [];\n    };`;
    })
    .join("\n");
  const enumOutput = new Map<string, string[]>();
  for (const row of enums)
    enumOutput.set(row.enum_name!, [...(enumOutput.get(row.enum_name!) ?? []), row.enum_value!]);
  const enumText = [...enumOutput.entries()]
    .map(([name, values]) => `    ${typeName(name)}: ${values.map(quote).join(" | ")};`)
    .join("\n");
  return `export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\n\nexport type Database = {\n  public: {\n    Tables: {\n${tableOutput}\n    };\n    Views: {};\n    Functions: {};\n    Enums: {\n${enumText}\n    };\n    CompositeTypes: {};\n  };\n};\n`;
}

const output = render(rowsFromJson(runQuery()));
mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, output, "utf8");
console.log(`Generated ${outputFile}`);
