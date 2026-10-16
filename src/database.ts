// oxlint-disable typescript/no-redundant-type-constituents

export type GenericDatabase = {
  public: {
    Tables: Record<
      string,
      {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      }
    >;
  };
};

export type TableName<Database extends GenericDatabase> = keyof Database["public"]["Tables"] & string;
export type Row<Database extends GenericDatabase, Table extends TableName<Database>> =
  Database["public"]["Tables"][Table]["Row"];
export type Insert<Database extends GenericDatabase, Table extends TableName<Database>> =
  Database["public"]["Tables"][Table]["Insert"];
export type Update<Database extends GenericDatabase, Table extends TableName<Database>> =
  Database["public"]["Tables"][Table]["Update"];

export type RdbError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

export type RdbResult<RowType> = {
  data: RowType[] | null;
  error: RdbError | null;
};

export type RdbSingleResult<RowType> = {
  data: RowType | null;
  error: RdbError | null;
};

/**
 * Type-only mirror of the native `rdb()` query builder from `@cloudbase/js-sdk`,
 * which is a PostgREST-style client bound to the environment PostgreSQL instance.
 *
 * The runtime is entirely the SDK's; this surface only narrows table names,
 * column names and written values against the generated `Database` types.
 */
export interface RdbBuilder<RowType> extends PromiseLike<RdbResult<RowType>> {
  select(): RdbBuilder<RowType>;
  select(columns: "*"): RdbBuilder<RowType>;
  limit(count: number): RdbBuilder<RowType>;
  order<Column extends keyof RowType & string>(
    column: Column,
    options?: { ascending?: boolean },
  ): RdbBuilder<RowType>;
  eq<Column extends keyof RowType & string>(
    column: Column,
    value: RowType[Column],
  ): RdbBuilder<RowType>;
  single(): PromiseLike<RdbSingleResult<RowType>>;
}

export interface RdbTable<Database extends GenericDatabase, Table extends TableName<Database>> {
  select(): RdbBuilder<Row<Database, Table>>;
  select(columns: "*"): RdbBuilder<Row<Database, Table>>;
  insert(
    values: Insert<Database, Table> | Insert<Database, Table>[],
  ): PromiseLike<RdbResult<Row<Database, Table>>>;
  update(values: Update<Database, Table>): RdbBuilder<Row<Database, Table>>;
  delete(): RdbBuilder<Row<Database, Table>>;
}

export interface TypedRdb<Database extends GenericDatabase> {
  from<Table extends TableName<Database>>(table: Table): RdbTable<Database, Table>;
}
