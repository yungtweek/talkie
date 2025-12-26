import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import { AuthModule } from '@/modules/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@/modules/infra/database/database.module';
import { KyselyModule } from '@/modules/infra/database/kysely/kysely.module';
import { AuthService } from '@/modules/auth/auth.service';
import { RefreshJwtAuthGuard } from '@/modules/auth/jwt-refresh.guard';
import type { Request } from 'express';

const TEST_USER = {
  sub: '00000000-0000-4000-8000-000000000001',
  pns: '00000000000000000000000000000001',
  username: 'test-user',
  email: 'test-user@example.com',
  role: 'user',
};

const ISSUED_AT = 1_700_000_000;
const ACCESS_TOKEN = 'access.payload.signature';
const REFRESH_TOKEN = 'refresh.payload.signature';

describe('AuthController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        await ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.local', // ✅ .env.local 파일 로드
        }),
        DatabaseModule,
        KyselyModule,
        AuthModule,
      ],
    })
      .overrideProvider(AuthService)
      .useValue({
        validateUser: jest.fn((identifier: string, password: string) => {
          const ok =
            identifier === 'iam@tweek.ninja' &&
            password === 'Naruto1234567890';
          if (!ok) {
            throw new UnauthorizedException('Invalid credentials');
          }
          return TEST_USER;
        }),
        issueTokens: jest.fn(() =>
          Promise.resolve({
            access: {
              tokenType: 'Bearer',
              token: ACCESS_TOKEN,
              issuedAt: ISSUED_AT,
              expiresIn: 900,
              expiresAt: ISSUED_AT + 900,
            },
            refresh: {
              tokenType: 'Bearer',
              token: REFRESH_TOKEN,
              expiresIn: 60 * 60 * 24 * 14,
              expiresAt: ISSUED_AT + 60 * 60 * 24 * 14,
            },
          }),
        ),
      })
      .overrideGuard(RefreshJwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<Request & { user?: typeof TEST_USER }>();
          if (req) {
            req.user = TEST_USER;
          }
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication({});

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /v1/auth/login -> should return 401', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'demo@tweek.ninja', password: 'test' })
      .expect(401);
  });

  it('POST /v1/auth/login → should issue a JWT token', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'iam@tweek.ninja', password: 'Naruto1234567890' })
      .expect(201);

    expect(response.body).toHaveProperty('access.token');
    expect(typeof response.body.access.token).toBe('string');
    expect(response.body.access.token.split('.').length).toBe(3);
  });

  it('POST /v1/auth/refresh → should issue new tokens', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'iam@tweek.ninja', password: 'Naruto1234567890' })
      .expect(201);

    const refreshToken = login.body.refresh?.token;
    expect(refreshToken).toBeDefined();

    const refresh = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      // RefreshJwtStrategy expects token via cookie 'rt' or Authorization: Bearer
      .set('Authorization', `Bearer ${refreshToken}`)
      .expect(201);

    expect(refresh.body).toHaveProperty('access.token');
    expect(refresh.body).toHaveProperty('refresh.token');
    expect(refresh.body.access.token.split('.').length).toBe(3);
    expect(refresh.body.refresh.token.split('.').length).toBe(3);
  });
});
