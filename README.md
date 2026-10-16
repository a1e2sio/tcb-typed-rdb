# CloudBase Typed Client

一个纯 TypeScript 声明的 CloudBase RDB 类型增强包。包本身只提供 `GenericDatabase`、`TypedRdb` 和数据库类型生成，不依赖或绑定 `@cloudbase/js-sdk`；SDK 与 CLI 由使用项目自行提供。本包不发布 JavaScript 运行时代码。

## 使用

### 通过 Git 引入

当前包可以直接从 GitHub 安装，适合在发布到 npm 前进行应用实验：

```sh
pnpm add git+ssh://git@github.com/a1e2sio/tcb-typed-rdb.git#main
```

也可以固定到某个提交，避免实验过程中上游变更：

```sh
pnpm add git+ssh://git@github.com/a1e2sio/tcb-typed-rdb.git#<commit>
```

Git 依赖安装时会通过 `prepare` 自动执行构建，生成 `dist` 类型入口。调用项目仍需自行安装 CloudBase SDK：

```sh
pnpm add @cloudbase/js-sdk
```

安装完成后，通过包名导入类型：

```ts
import type { GenericDatabase, TypedRdb } from "@a1e2sio/tcb-typed-rdb";
```

```ts
import type { Database } from "./database.types";
import cloudbaseSDK from "@cloudbase/js-sdk";
import type { GenericDatabase, TypedRdb } from "@a1e2sio/tcb-typed-rdb";

type CloudbaseConfig = Parameters<typeof cloudbaseSDK.init>[0];
type CloudbaseSdkClient = ReturnType<typeof cloudbaseSDK.init>;

export type CloudbaseClient<Database extends GenericDatabase = GenericDatabase> =
  Omit<CloudbaseSdkClient, "rdb"> & {
    rdb: () => TypedRdb<Database>;
  };

export function createCloudbaseClient<Database extends GenericDatabase = GenericDatabase>(
  config: CloudbaseConfig,
): CloudbaseClient<Database> {
  return cloudbaseSDK.init(config) as unknown as CloudbaseClient<Database>;
}

const cloudbase = createCloudbaseClient<Database>({
  env: "your-env-id",
  region: "ap-shanghai",
});

const posts = await cloudbase.rdb().from("forum_posts").select("*").limit(100);
await cloudbase.auth().anonymousAuthProvider().signIn();
```

`cloudbase.auth()`、`database()`、`storage()` 等方法直接使用业务项目安装的 CloudBase SDK 类型。

`rdb()` 就是 SDK 原生的 PostgreSQL 客户端（请求 `/rdb/rest`）。本包只把它的返回类型收窄为生成的 `Database`，不覆盖任何运行时实现，因此不会误落到文档数据库。

环境变量由调用方提供，本包不读取 `import.meta.env`，可在 Node、测试环境和其他 bundler 中安全导入：

```ts
import { createCloudbaseClient } from "./client";

export const cloudbase = createCloudbaseClient({
  env: import.meta.env.VITE_CLOUDBASE_ENV_ID,
  accessKey: import.meta.env.VITE_CLOUDBASE_ACCESS_KEY,
});
```

本包没有 `@cloudbase/js-sdk` 依赖，也不导出客户端工厂。调用项目自行安装和导入 SDK，并按上面的方式组合 `CloudbaseClient`。`Database` 不由本包提供，必须使用调用项目自己生成的 `database.types.ts`。使用时只能通过 `import type` 导入本包类型。

## 类型生成

类型生成器使用调用项目 PATH 中的 CloudBase CLI 查询 PostgreSQL 元数据，并写入调用项目的 `src/database.types.ts`。在调用项目目录执行：

```sh
pnpm exec node --experimental-strip-types node_modules/@a1e2sio/tcb-typed-rdb/scripts/typegen.ts
pnpm exec node --experimental-strip-types node_modules/@a1e2sio/tcb-typed-rdb/scripts/typegen.ts --admin
node --experimental-strip-types node_modules/@a1e2sio/tcb-typed-rdb/scripts/typegen.ts --role my_database_role
node --experimental-strip-types node_modules/@a1e2sio/tcb-typed-rdb/scripts/typegen.ts --config-file path/to/cloudbaserc.json
node --experimental-strip-types node_modules/@a1e2sio/tcb-typed-rdb/scripts/typegen.ts --output src/database.types.ts
```

默认角色是 `cloudbase_read_only_user`，也可以通过 `CLOUDBASE_DB_ROLE` 指定已授权角色。`--admin` 和 `--role` 不能同时使用。

生成后类型随源码直接生效，无需构建或发布。

## GitHub 配置

GitHub 相关配置文件的职责和维护约定见 [.github/README.md](.github/README.md)。该目录说明 CI、依赖更新、Issue/PR 模板和代码所有者等配置的用途；只有实际启用的配置文件才会影响仓库行为。
