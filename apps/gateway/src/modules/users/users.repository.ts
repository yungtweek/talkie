// src/modules/users/users.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { UserRow } from '@/modules/users/user.zod';
import { DB, KYSELY } from '@/modules/infra/database/kysely/kysely.module';

@Injectable()
export class UsersRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  async findByIdentifierAndPwd(
    identifier: string,
    password: string,
  ): Promise<UserRow | null> {
    const row = await this.db
      .selectFrom('users')
      .select([
        'id',
        'username',
        'email',
        'public_ns',
        sql`created_at::text`.$castTo<string>().as('created_at'),
        sql`updated_at::text`.$castTo<string>().as('updated_at'),
      ])
      .where(eb =>
        eb.and([
          eb('pwd_shadow', '=', password),
          eb.or([eb('username', '=', identifier), eb('email', '=', identifier)]),
        ]),
      )
      .limit(1)
      .executeTakeFirst();

    return row ?? null;
  }
}
