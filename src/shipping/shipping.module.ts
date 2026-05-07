import { Module } from '@nestjs/common';
import { AndreaniService } from './andreani.service';
import { ShippingController } from './shipping.controller';

@Module({
  controllers: [ShippingController],
  providers: [AndreaniService],
  exports: [AndreaniService],
})
export class ShippingModule {}
