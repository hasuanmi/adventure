import { Global, Module } from '@nestjs/common';
import { ImagesService } from './images.service';

/** 图片生成（SiliconFlow Kolors）：供每日成长卡等模块注入使用 */
@Global()
@Module({
  providers: [ImagesService],
  exports: [ImagesService],
})
export class ImagesModule {}