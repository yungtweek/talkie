import { Global, Module } from '@nestjs/common'
import { Kysely, PostgresDialect } from 'kysely'
import type { Pool } from 'pg'

import { DATABASE_POOL } from '@/modules/infra/database/database.module'
import type { DB } from '@/modules/infra/database/kysely/db.types'
export type { DB }

export const KYSELY = Symbol('KYSELY')

@Global()
@Module({
  providers: [
    {
      provide: KYSELY,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool) => {
        // Pool lifecycle is owned by DatabaseModule; Kysely must not end it.
        return new Kysely<DB>({
          dialect: new PostgresDialect({ pool }),
        })
      },
    },
  ],
  exports: [KYSELY],
})
export class KyselyModule {}
