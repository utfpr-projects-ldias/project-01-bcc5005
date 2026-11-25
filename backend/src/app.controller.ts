import { Controller, Get } from '@nestjs/common';
import { RotaPublica } from './autorizacao/politica.decorator.js';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @RotaPublica()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
