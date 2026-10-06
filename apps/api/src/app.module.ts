import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AiModule } from './ai/ai.module';
import { ApprovalModule } from './approval/approval.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AuthModule } from './auth/auth.module';
import { CompletionModule } from './completion/completion.module';
import { FamilyModule } from './family/family.module';
import { FilesModule } from './files/files.module';
import { GrowthModule } from './growth/growth.module';
import { HealthModule } from './health/health.module';
import { KnowledgeTagModule } from './knowledge-tag/knowledge-tag.module';
import { PrismaModule } from './prisma/prisma.module';
import { RewardProfileModule } from './reward-profile/reward-profile.module';
import { TaskModule } from './task/task.module';
import { WrongQuestionModule } from './wrong-question/wrong-question.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // 开发：pnpm --filter 运行 cwd=apps/api → 读仓库根 .env
      envFilePath: ['../../.env', '.env'],
    }),
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
        signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '30m' },
      }),
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    TaskModule,
    CompletionModule,
    FamilyModule,
    ApprovalModule,
    GrowthModule,
    RewardProfileModule,
    AttendanceModule,
    WrongQuestionModule,
    KnowledgeTagModule,
    AiModule,
    FilesModule,
  ],
})
export class AppModule {}
